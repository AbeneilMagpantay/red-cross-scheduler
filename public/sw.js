const DEFAULT_NOTIFICATION_URL = '/schedule';
const NOTIFICATION_ICON = '/icon-192.png';
const NOTIFICATION_BADGE = '/badge-96.png';

// Take over open tabs as soon as a new version installs.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let payload = {};

    try {
        payload = event.data?.json() || {};
    } catch {
        payload = { body: event.data?.text() || 'A new deployment duty was scheduled.' };
    }

    // Every push must show a notification, or browsers may revoke the subscription.
    event.waitUntil(self.registration.showNotification(
        payload.title || 'New Deployment Duty',
        {
            body: payload.body || 'Open the schedule to view the new duty.',
            icon: NOTIFICATION_ICON,
            badge: NOTIFICATION_BADGE,
            tag: payload.tag || 'deployment-duty',
            data: { url: payload.url || DEFAULT_NOTIFICATION_URL },
            vibrate: [180, 80, 180]
        }
    ));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    let targetUrl = new URL(DEFAULT_NOTIFICATION_URL, self.location.origin).href;

    try {
        const requestedUrl = new URL(event.notification.data?.url || DEFAULT_NOTIFICATION_URL, self.location.origin);
        if (requestedUrl.origin === self.location.origin) targetUrl = requestedUrl.href;
    } catch {
        // Invalid URLs fall back to the default.
    }

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
        if (!existingWindow) return self.clients.openWindow(targetUrl);

        const focused = await existingWindow.focus();
        // navigate() only works on controlled tabs; otherwise just focus.
        return focused.navigate(targetUrl).catch(() => focused);
    })());
});
