import { supabase } from './supabase';

const NOTIFICATION_PREFERENCE_KEY = 'deployment-notifications-enabled';
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

    if (capability.backgroundConfigured && userId && supabase) {
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });
        }

        const { error } = await supabase.from('push_subscriptions').upsert({
            user_id: userId,
            endpoint: subscription.endpoint,
            subscription: subscription.toJSON(),
            is_active: true,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,endpoint' });

        if (error) throw error;
        mode = 'background';
    }

    localStorage.setItem(getPreferenceKey(userId), 'true');
    return { ...getNotificationCapability(userId), mode };
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

export const showTestNotification = async (userId) => {
    const capability = getNotificationCapability(userId);
    if (!capability.enabled || capability.permission !== 'granted') {
        throw new Error('Enable notifications first.');
    }

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Notifications are ready', {
        body: 'You will be alerted when a new deployment duty is scheduled.',
        icon: '/app-icon.svg',
        badge: '/app-icon.svg',
        tag: 'notification-test',
        data: { url: '/settings' }
    });
};

export const showLiveDeploymentNotification = async (schedule, userId) => {
    const capability = getNotificationCapability(userId);

    // The server sends background push when VAPID is configured. This fallback
    // covers devices using live-only notifications while the app is running.
    if (!capability.enabled || capability.permission !== 'granted' || capability.backgroundConfigured) return;

    const registration = await navigator.serviceWorker.ready;
    const time = schedule.start_time?.slice(0, 5);
    const details = [schedule.duty_date, time].filter(Boolean).join(' at ');

    await registration.showNotification(schedule.title || 'New Deployment Duty', {
        body: details ? `Scheduled for ${details}.` : 'Open the schedule to view the details.',
        icon: '/app-icon.svg',
        badge: '/app-icon.svg',
        tag: `deployment-${schedule.id}`,
        data: { url: '/schedule' }
    });
};
