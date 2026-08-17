const DEFAULT_NOTIFICATION_URL = '/schedule';

self.addEventListener('push', (event) => {
    let payload = {};

    try {
        payload = event.data?.json() || {};
    } catch {
        payload = { body: event.data?.text() || 'A new deployment duty was scheduled.' };
    }

    event.waitUntil(self.registration.showNotification(
        payload.title || 'New Deployment Duty',
        {
            body: payload.body || 'Open the schedule to view the new duty.',
            icon: '/app-icon.svg',
            badge: '/app-icon.svg',
            tag: payload.tag || 'deployment-duty',
            data: { url: payload.url || DEFAULT_NOTIFICATION_URL },
            vibrate: [180, 80, 180]
        }
    ));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || DEFAULT_NOTIFICATION_URL, self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
            if (existingWindow) {
                existingWindow.navigate(targetUrl);
                return existingWindow.focus();
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});
