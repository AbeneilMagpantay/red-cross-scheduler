export const WHATS_NEW_RELEASE = 'v3';

export function getWhatsNewStorageKey(userId) {
    return `rcy-whats-new:${WHATS_NEW_RELEASE}:${userId || 'visitor'}`;
}

export function hasSeenWhatsNew(userId) {
    try {
        return window.localStorage.getItem(getWhatsNewStorageKey(userId)) === 'seen';
    } catch {
        return false;
    }
}

export function rememberWhatsNewSeen(userId) {
    try {
        window.localStorage.setItem(getWhatsNewStorageKey(userId), 'seen');
    } catch {
        // Storage may be blocked; the modal may reappear next visit.
    }
}
