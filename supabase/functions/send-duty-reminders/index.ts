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
  personnel: { email: string | null; is_active: boolean } | null;
};

type AccountRequestRow = {
  user_id: string;
  name: string;
  email: string;
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
    .select('id, personnel_id, title, duty_date, start_time, precise_location, reminder_offsets, personnel!inner(email, is_active)')
    .not('personnel_id', 'is', null)
    .eq('personnel.is_active', true)
    .gte('duty_date', today)
    .order('duty_date', { ascending: true })
    .limit(5000);

  if (schedulesError) return jsonResponse({ error: schedulesError.message }, 500);

  const { data: accountRequests, error: accountRequestsError } = await adminClient
    .from('account_requests')
    .select('user_id, name, email')
    .eq('status', 'pending')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(20);

  if (accountRequestsError) return jsonResponse({ error: accountRequestsError.message }, 500);

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

  const pendingRequests = (accountRequests || []) as AccountRequestRow[];
  if (!due.length && !pendingRequests.length) {
    return jsonResponse({ checked: data?.length || 0, due: 0, delivered: 0, failed: 0, account_requests: 0 });
  }

  // Restored and Google-linked accounts can legitimately have an auth ID that
  // differs from the preserved personnel ID. Resolve by ID first, then email.
  const authUsers: Array<{ id: string; email?: string | null }> = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data: authPage, error: authUsersError } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (authUsersError) return jsonResponse({ error: authUsersError.message }, 500);
    authUsers.push(...authPage.users);
    if (authPage.users.length < 1000) break;
  }

  const usersById = new Map(authUsers.map((user) => [user.id, user]));
  const usersByEmail = new Map(authUsers.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));
  const resolvedDue = due.flatMap((item) => {
    const authUser = usersById.get(item.schedule.personnel_id)
      || usersByEmail.get(item.schedule.personnel?.email?.toLowerCase() || '');
    return authUser ? [{ ...item, userId: authUser.id }] : [];
  });

  const { data: administrators, error: administratorsError } = await adminClient
    .from('personnel')
    .select('id, email')
    .eq('role', 'admin')
    .eq('is_active', true);
  if (administratorsError) return jsonResponse({ error: administratorsError.message }, 500);

  const administratorUserIds = new Set<string>();
  (administrators || []).forEach((administrator) => {
    const authUser = usersById.get(administrator.id)
      || usersByEmail.get(administrator.email?.toLowerCase() || '');
    if (authUser) administratorUserIds.add(authUser.id);
  });

  const userIds = [...new Set([
    ...resolvedDue.map(({ userId }) => userId),
    ...administratorUserIds,
  ])];

  const subscriptionResult = userIds.length
    ? await adminClient
      .from('push_subscriptions')
      .select('id, user_id, endpoint, subscription')
      .in('user_id', userIds)
      .eq('is_active', true)
    : { data: [], error: null };
  const { data: subscriptions, error: subscriptionsError } = subscriptionResult;

  if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
  ((subscriptions || []) as PushSubscriptionRow[]).forEach((row) => {
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
      const subscription = getValidatedSubscription(row);
      if (!subscription) {
        await adminClient.from('push_subscriptions').delete().eq('id', row.id);
        continue;
      }
      if (uniqueEndpoints.has(row.endpoint)) continue;
      uniqueEndpoints.add(row.endpoint);

      try {
        const ttl = Math.max(60, Math.floor((item.dutyStartsAt.getTime() - now.getTime()) / 1000));
        await webpush.sendNotification(subscription, notification, { TTL: ttl, timeout: 10_000 });
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

  let approvalDevicesDelivered = 0;
  let approvalDevicesFailed = 0;

  if (pendingRequests.length && administratorUserIds.size) {
    const firstRequest = pendingRequests[0];
    const notification = JSON.stringify({
      title: pendingRequests.length === 1 ? 'New account request' : `${pendingRequests.length} new account requests`,
      body: pendingRequests.length === 1
        ? `${firstRequest.name || firstRequest.email} is waiting for approval.`
        : 'New members are waiting for an administrator to review their access.',
      tag: 'account-approval-requests',
      url: '/personnel',
    });
    const uniqueAdminEndpoints = new Set<string>();

    for (const administratorUserId of administratorUserIds) {
      const administratorSubscriptions = subscriptionsByUser.get(administratorUserId) || [];
      for (const row of administratorSubscriptions) {
        const subscription = getValidatedSubscription(row);
        if (!subscription) {
          await adminClient.from('push_subscriptions').delete().eq('id', row.id);
          continue;
        }
        if (uniqueAdminEndpoints.has(row.endpoint)) continue;
        uniqueAdminEndpoints.add(row.endpoint);

        try {
          await webpush.sendNotification(subscription, notification, { TTL: 3600, timeout: 10_000 });
          approvalDevicesDelivered += 1;
        } catch (error) {
          approvalDevicesFailed += 1;
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await adminClient.from('push_subscriptions').delete().eq('id', row.id);
          }
        }
      }
    }

    // Mark the batch after one delivery attempt. Administrators without a push
    // subscription still retain the persistent Personnel badge and queue.
    await adminClient
      .from('account_requests')
      .update({ notified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('user_id', pendingRequests.map((item) => item.user_id));
  }

  return jsonResponse({
    checked: data?.length || 0,
    due: due.length,
    delivered,
    failed,
    skipped,
    account_requests: pendingRequests.length,
    approval_devices_delivered: approvalDevicesDelivered,
    approval_devices_failed: approvalDevicesFailed,
  });
});
