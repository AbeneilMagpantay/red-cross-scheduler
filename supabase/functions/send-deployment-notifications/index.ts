import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: 'Notification service is not configured' }, 503);
  }

  const authorization = request.headers.get('Authorization') || '';
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

  let { data: personnel } = await adminClient
    .from('personnel')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!personnel && user.email) {
    const result = await adminClient
      .from('personnel')
      .select('role, is_active')
      .eq('email', user.email)
      .maybeSingle();
    personnel = result.data;
  }

  if (!personnel?.is_active || personnel.role !== 'admin') {
    return jsonResponse({ error: 'Only active administrators can send deployment notifications' }, 403);
  }

  const { schedule_id: scheduleId } = await request.json();
  if (!scheduleId) return jsonResponse({ error: 'schedule_id is required' }, 400);

  const { data: schedule, error: scheduleError } = await adminClient
    .from('schedules')
    .select('id, title, duty_date, start_time, is_deployment_event')
    .eq('id', scheduleId)
    .single();

  if (scheduleError || !schedule?.is_deployment_event) {
    return jsonResponse({ error: 'Deployment event not found' }, 404);
  }

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('is_active', true);

  if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const time = schedule.start_time?.slice(0, 5);
  const details = [schedule.duty_date, time].filter(Boolean).join(' at ');
  const notification = JSON.stringify({
    title: schedule.title || 'New Deployment Duty',
    body: details ? `Scheduled for ${details}.` : 'Open the schedule to view the details.',
    tag: `deployment-${schedule.id}`,
    url: '/schedule',
  });

  const uniqueEndpoints = new Set<string>();
  let delivered = 0;
  let failed = 0;

  await Promise.all((subscriptions || []).map(async (row) => {
    const subscription = row.subscription as Parameters<typeof webpush.sendNotification>[0];
    if (!subscription?.endpoint || uniqueEndpoints.has(subscription.endpoint)) return;
    uniqueEndpoints.add(subscription.endpoint);

    try {
      await webpush.sendNotification(subscription, notification, { TTL: 3600 });
      delivered += 1;
    } catch (error) {
      failed += 1;
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await adminClient.from('push_subscriptions').delete().eq('id', row.id);
      }
    }
  }));

  return jsonResponse({ delivered, failed });
});
