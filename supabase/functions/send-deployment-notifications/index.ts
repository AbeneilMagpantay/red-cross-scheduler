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

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  subscription: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  } | null;
};

const isAllowedPushEndpoint = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 4096) return false;

  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return false;
    if (endpoint.port && endpoint.port !== '443') return false;

    const hostname = endpoint.hostname.toLowerCase();
    return hostname === 'fcm.googleapis.com'
      || hostname === 'android.googleapis.com'
      || hostname === 'web.push.apple.com'
      || hostname === 'push.services.mozilla.com'
      || hostname.endsWith('.push.services.mozilla.com')
      || hostname === 'notify.windows.com'
      || hostname.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
};

const getValidatedSubscription = (row: PushSubscriptionRow) => {
  const subscription = row.subscription;
  if (!subscription || subscription.endpoint !== row.endpoint || !isAllowedPushEndpoint(row.endpoint)) return null;
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (p256dh.length < 16 || auth.length < 8) return null;
  return subscription as unknown as Parameters<typeof webpush.sendNotification>[0];
};

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
      .ilike('email', user.email)
      .limit(1)
      .maybeSingle();
    personnel = result.data;
  }

  if (!personnel?.is_active) return jsonResponse({ error: 'Inactive account' }, 403);

  let requestBody: { schedule_id?: string; announcement_id?: string };
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: 'A valid JSON request body is required' }, 400);
  }

  const {
    schedule_id: scheduleId,
    announcement_id: announcementId,
  } = requestBody;

  if (!scheduleId && !announcementId) {
    return jsonResponse({ error: 'schedule_id or announcement_id is required' }, 400);
  }

  let notificationTitle = '';
  let notificationBody = '';
  let notificationTag = '';
  let notificationUrl = '';

  if (announcementId) {
    if (!['admin', 'officer'].includes(personnel.role)) {
      return jsonResponse({ error: 'Only active administrators and officers can send ARC Alerts' }, 403);
    }

    const { data: announcement, error: announcementError } = await adminClient
      .from('arc_announcements')
      .select('id, title, body_html, category')
      .eq('id', announcementId)
      .single();

    if (announcementError || !announcement) {
      return jsonResponse({ error: 'ARC announcement not found' }, 404);
    }

    const plainBody = String(announcement.body_html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
    notificationTitle = announcement.title || 'New ARC Alert';
    notificationBody = plainBody.slice(0, 180) || `${announcement.category || 'ARC'} announcement published.`;
    notificationTag = `arc-alert-${announcement.id}`;
    notificationUrl = '/alerts';
  } else {
    if (personnel.role !== 'admin') {
      return jsonResponse({ error: 'Only active administrators can send deployment notifications' }, 403);
    }

    const { data: schedule, error: scheduleError } = await adminClient
      .from('schedules')
      .select('id, title, duty_date, start_time, is_deployment_event')
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !schedule?.is_deployment_event) {
      return jsonResponse({ error: 'Deployment event not found' }, 404);
    }

    const time = schedule.start_time?.slice(0, 5);
    const details = [schedule.duty_date, time].filter(Boolean).join(' at ');
    notificationTitle = schedule.title || 'New Deployment Duty';
    notificationBody = details ? `Scheduled for ${details}.` : 'Open the schedule to view the details.';
    notificationTag = `deployment-${schedule.id}`;
    notificationUrl = '/schedule';
  }

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, endpoint, subscription')
    .eq('is_active', true);

  if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

  // A subscription may outlive its Personnel account. Resolve restored users
  // by verified Auth email, but never notify inactive or unlinked accounts.
  const { data: activePersonnel, error: personnelError } = await adminClient
    .from('personnel')
    .select('id, email')
    .eq('is_active', true);
  if (personnelError) return jsonResponse({ error: 'Unable to validate notification recipients' }, 500);

  const activePersonnelIds = new Set((activePersonnel || []).map((member) => member.id));
  const activePersonnelEmails = new Set((activePersonnel || [])
    .map((member) => member.email?.toLowerCase())
    .filter(Boolean));
  const subscriptionUserIds = [...new Set((subscriptions || []).map((row) => row.user_id))];
  const activeAuthUserIds = new Set(subscriptionUserIds.filter((id) => activePersonnelIds.has(id)));
  const unresolvedUserIds = new Set(subscriptionUserIds.filter((id) => !activeAuthUserIds.has(id)));

  for (let page = 1; unresolvedUserIds.size && page <= 20; page += 1) {
    const { data: authPage, error: authPageError } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (authPageError) return jsonResponse({ error: 'Unable to validate notification accounts' }, 500);

    authPage.users.forEach((authUser) => {
      if (!unresolvedUserIds.has(authUser.id)) return;
      const email = authUser.email?.toLowerCase();
      if (email && activePersonnelEmails.has(email)) activeAuthUserIds.add(authUser.id);
      unresolvedUserIds.delete(authUser.id);
    });
    if (authPage.users.length < 1000) break;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const notification = JSON.stringify({
    title: notificationTitle,
    body: notificationBody,
    tag: notificationTag,
    url: notificationUrl,
  });

  const uniqueEndpoints = new Set<string>();
  let delivered = 0;
  let failed = 0;

  await Promise.all(((subscriptions || []) as PushSubscriptionRow[]).map(async (row) => {
    if (!activeAuthUserIds.has(row.user_id)) {
      await adminClient.from('push_subscriptions').delete().eq('id', row.id);
      return;
    }

    const subscription = getValidatedSubscription(row);
    if (!subscription || uniqueEndpoints.has(row.endpoint)) {
      if (!subscription) await adminClient.from('push_subscriptions').delete().eq('id', row.id);
      return;
    }
    uniqueEndpoints.add(row.endpoint);

    try {
      await webpush.sendNotification(subscription, notification, { TTL: 3600, timeout: 10_000 });
      delivered += 1;
    } catch (error) {
      failed += 1;
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await adminClient.from('push_subscriptions').delete().eq('id', row.id);
      }
    }
  }));

  if (announcementId) {
    await adminClient
      .from('arc_announcements')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', announcementId);
  }

  return jsonResponse({ delivered, failed });
});
