import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const MANILA_OFFSET = '+08:00';
const DELIVERY_WINDOW_MS = 20 * 60 * 1000;

const getManilaDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

type ScheduleRow = {
  id: string;
  personnel_id: string;
  title: string | null;
  duty_date: string;
  start_time: string | null;
  precise_location: string | null;
  reminder_offsets: number[] | null;
  personnel: { email: string | null } | null;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('REMINDER_CRON_SECRET');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: 'Reminder service is not configured' }, 503);
  }

  const bearerToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const providedCronSecret = request.headers.get('x-cron-secret');
  const isServiceRole = bearerToken === serviceRoleKey;
  const hasCronSecret = Boolean(cronSecret && providedCronSecret === cronSecret);
  if (!isServiceRole && !hasCronSecret) return jsonResponse({ error: 'Unauthorized' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();
  const today = getManilaDate(now);

  const { data, error: schedulesError } = await adminClient
    .from('schedules')
    .select('id, personnel_id, title, duty_date, start_time, precise_location, reminder_offsets, personnel(email)')
    .not('personnel_id', 'is', null)
    .gte('duty_date', today)
    .order('duty_date', { ascending: true })
    .limit(5000);

  if (schedulesError) return jsonResponse({ error: schedulesError.message }, 500);

  const due = (data as ScheduleRow[] || []).flatMap((schedule) => {
    if (!schedule.start_time) return [];
    const dutyStartsAt = new Date(`${schedule.duty_date}T${schedule.start_time.slice(0, 8)}${MANILA_OFFSET}`);

    return (schedule.reminder_offsets || []).flatMap((minutes) => {
      const reminderAt = new Date(dutyStartsAt.getTime() - minutes * 60 * 1000);
      const elapsed = now.getTime() - reminderAt.getTime();
      if (elapsed < 0 || elapsed > DELIVERY_WINDOW_MS) return [];
      return [{ schedule, minutes, dutyStartsAt }];
    });
  });

  if (!due.length) return jsonResponse({ checked: data?.length || 0, due: 0, delivered: 0, failed: 0 });

  // Restored and Google-linked accounts can legitimately have an auth ID that
  // differs from the preserved personnel ID. Resolve by ID first, then email.
  const { data: authUsers, error: authUsersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authUsersError) return jsonResponse({ error: authUsersError.message }, 500);

  const usersById = new Map(authUsers.users.map((user) => [user.id, user]));
  const usersByEmail = new Map(authUsers.users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));
  const resolvedDue = due.flatMap((item) => {
    const authUser = usersById.get(item.schedule.personnel_id)
      || usersByEmail.get(item.schedule.personnel?.email?.toLowerCase() || '');
    return authUser ? [{ ...item, userId: authUser.id }] : [];
  });
  const userIds = [...new Set(resolvedDue.map(({ userId }) => userId))];
  if (!userIds.length) return jsonResponse({ checked: data?.length || 0, due: due.length, delivered: 0, failed: 0, skipped: due.length });

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from('push_subscriptions')
    .select('id, user_id, subscription')
    .in('user_id', userIds)
    .eq('is_active', true);

  if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

  const subscriptionsByUser = new Map<string, typeof subscriptions>();
  (subscriptions || []).forEach((row) => {
    const current = subscriptionsByUser.get(row.user_id) || [];
    current.push(row);
    subscriptionsByUser.set(row.user_id, current);
  });

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  let delivered = 0;
  let failed = 0;
  let skipped = due.length - resolvedDue.length;

  for (const item of resolvedDue) {
    const userSubscriptions = subscriptionsByUser.get(item.userId) || [];
    if (!userSubscriptions.length) {
      skipped += 1;
      continue;
    }

    const { data: claim, error: claimError } = await adminClient
      .from('duty_reminder_deliveries')
      .insert({
        schedule_id: item.schedule.id,
        user_id: item.userId,
        reminder_minutes: item.minutes,
      })
      .select('id')
      .single();

    if (claimError) {
      if (claimError.code === '23505') skipped += 1;
      else failed += 1;
      continue;
    }

    const time = item.schedule.start_time?.slice(0, 5);
    const location = item.schedule.precise_location ? ` at ${item.schedule.precise_location}` : '';
    const notification = JSON.stringify({
      title: `Duty reminder: ${item.schedule.title || 'Scheduled duty'}`,
      body: `${item.schedule.duty_date} at ${time}${location}. Tap to review your assignment.`,
      tag: `duty-reminder-${item.schedule.id}-${item.minutes}`,
      url: '/schedule',
    });

    let assignmentDelivered = false;
    const uniqueEndpoints = new Set<string>();

    for (const row of userSubscriptions) {
      const subscription = row.subscription as Parameters<typeof webpush.sendNotification>[0];
      if (!subscription?.endpoint || uniqueEndpoints.has(subscription.endpoint)) continue;
      uniqueEndpoints.add(subscription.endpoint);

      try {
        const ttl = Math.max(60, Math.floor((item.dutyStartsAt.getTime() - now.getTime()) / 1000));
        await webpush.sendNotification(subscription, notification, { TTL: ttl });
        assignmentDelivered = true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from('push_subscriptions').delete().eq('id', row.id);
        }
      }
    }

    if (assignmentDelivered) {
      delivered += 1;
    } else {
      failed += 1;
      await adminClient.from('duty_reminder_deliveries').delete().eq('id', claim.id);
    }
  }

  return jsonResponse({ checked: data?.length || 0, due: due.length, delivered, failed, skipped });
});
