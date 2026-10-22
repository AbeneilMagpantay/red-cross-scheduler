import { db, supabase } from './supabase';
import { arcHtmlToText } from './arc';

const NOTIFICATION_PREFERENCE_KEY = 'deployment-notifications-enabled';
const NOTIFICATION_ICON = '/icon-192.png';
const NOTIFICATION_BADGE = '/badge-96.png';
export const TEST_PUSH_DELAY_SECONDS = 10;
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const getPreferenceKey = (userId) => `${NOTIFICATION_PREFERENCE_KEY}:${userId || 'anonymous'}`;

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
};

export const getNotificationCapability = (userId) => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    const backgroundSupported = supported && 'PushManager' in window;

    return {
        supported,
        backgroundSupported,
        backgroundConfigured: backgroundSupported && Boolean(vapidPublicKey),
        enabled: supported && localStorage.getItem(getPreferenceKey(userId)) === 'true',
        permission: supported ? Notification.permission : 'unsupported'
    };
};

const usesKey = (subscription, key) => {
    const current = subscription.options?.applicationServerKey;
    if (!current) return true;
    const bytes = new Uint8Array(current);
    return bytes.length === key.length && bytes.every((value, index) => value === key[index]);
};

// Subscribe this device (replacing a subscription made with an old VAPID key)
// and save it so the server can reach it while the app is closed.
const savePushSubscription = async (registration, userId) => {
    const key = urlBase64ToUint8Array(vapidPublicKey);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !usesKey(subscription, key)) {
        await subscription.unsubscribe();
        subscription = null;
    }
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }

    const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
        is_active: true,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,endpoint' });
    if (error) throw error;
};

export const enableDeploymentNotifications = async (userId) => {
    const capability = getNotificationCapability();
    if (!capability.supported) throw new Error('Notifications are not supported by this browser.');
    if (!userId) throw new Error('Sign in before enabling notifications.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Notification permission was not granted. You can change it in your browser settings.');
    }

    const registration = await navigator.serviceWorker.ready;
    let mode = 'live';

    if (capability.backgroundConfigured && supabase) {
        await savePushSubscription(registration, userId);
        mode = 'background';
    }

    localStorage.setItem(getPreferenceKey(userId), 'true');
    return { ...getNotificationCapability(userId), mode };
};

// Run on every app start so devices stay reachable after key changes,
// browser-rotated subscriptions, or rows the server removed.
export const syncPushSubscription = async (userId) => {
    const capability = getNotificationCapability(userId);
    if (!userId || !supabase || !capability.enabled || !capability.backgroundConfigured || capability.permission !== 'granted') return;
    await savePushSubscription(await navigator.serviceWorker.ready, userId);
};

export const disableDeploymentNotifications = async (userId) => {
    localStorage.setItem(getPreferenceKey(userId), 'false');

    if (!('serviceWorker' in navigator)) return getNotificationCapability(userId);

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager?.getSubscription();

    if (subscription && supabase && userId) {
        await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
    }

    return getNotificationCapability(userId);
};

// Background mode sends a real push through the server after a short delay so
// the user can close the app and confirm delivery; live mode shows it locally.
export const sendTestNotification = async (userId) => {
    const capability = getNotificationCapability(userId);
    if (!capability.enabled || capability.permission !== 'granted') {
        throw new Error('Enable notifications first.');
    }

    if (capability.backgroundConfigured) {
        await syncPushSubscription(userId);
        const { error } = await db.sendTestPush(TEST_PUSH_DELAY_SECONDS);
        if (error) {
            const details = await error.context?.json?.().catch(() => null);
            throw new Error(details?.error || error.message || 'The test notification could not be sent.');
        }
        return { mode: 'background' };
    }

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Notifications are ready', {
        body: 'You will be alerted about new deployment duties, ARC announcements, and relevant account updates.',
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        tag: 'notification-test',
        data: { url: '/settings' }
    });
    return { mode: 'live' };
};

export const showLiveArcAlertNotification = async (announcement, userId) => {
    const capability = getNotificationCapability(userId);
    if (!capability.enabled || capability.permission !== 'granted' || capability.backgroundConfigured) return;

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(announcement.title || 'New ARC Alert', {
        body: arcHtmlToText(announcement.body_html || '').slice(0, 180) || 'Open Alerts to read the announcement.',
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        tag: `arc-alert-${announcement.id}`,
        data: { url: '/alerts' }
    });
};

export const showLiveDeploymentNotification = async (schedule, userId) => {
    const capability = getNotificationCapability(userId);
    // With VAPID configured the server sends push; this covers live-only mode.
    if (!capability.enabled || capability.permission !== 'granted' || capability.backgroundConfigured) return;

    const registration = await navigator.serviceWorker.ready;
    const time = schedule.start_time?.slice(0, 5);
    const details = [schedule.duty_date, time].filter(Boolean).join(' at ');

    await registration.showNotification(schedule.title || 'New Deployment Duty', {
        body: details ? `Scheduled for ${details}.` : 'Open the schedule to view the details.',
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_BADGE,
        tag: `deployment-${schedule.id}`,
        data: { url: '/schedule' }
    });
};
