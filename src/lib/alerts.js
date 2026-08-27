export const ALERT_CATEGORIES = [
    'Urgent',
    'Operational Dispatch',
    'Deployment',
    'Training',
    'General'
];

const readKey = (userId) => `arc-alerts-read:${userId || 'anonymous'}`;

export const getReadAlertIds = (userId, storage = globalThis.localStorage) => {
    try {
        const value = JSON.parse(storage?.getItem(readKey(userId)) || '[]');
        return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    } catch {
        return [];
    }
};

export const computeUnreadAlerts = (alerts = [], readIds = []) => {
    const read = new Set(readIds);
    return alerts.filter((alert) => alert?.id && !read.has(alert.id)).length;
};

export const markAlertsRead = (alerts = [], userId, storage = globalThis.localStorage) => {
    const ids = [...new Set([
        ...getReadAlertIds(userId, storage),
        ...alerts.map((alert) => alert?.id).filter(Boolean)
    ])];

    try {
        storage?.setItem(readKey(userId), JSON.stringify(ids));
    } catch {
        // Reading Alerts should still work when browser storage is unavailable.
    }

    return ids;
};

export const sortArcAlerts = (alerts = []) => alerts.slice().sort((left, right) => {
    if (Boolean(left.is_pinned) !== Boolean(right.is_pinned)) {
        return left.is_pinned ? -1 : 1;
    }

    const orderDifference = (left.sort_order ?? Number.MAX_SAFE_INTEGER)
        - (right.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (orderDifference) return orderDifference;

    return new Date(right.created_at || 0) - new Date(left.created_at || 0);
});

export const getAlertCategoryClass = (category = 'General') => {
    const normalized = category.toLowerCase();
    if (normalized.startsWith('urgent')) return 'urgent';
    if (normalized.includes('dispatch')) return 'dispatch';
    if (normalized.startsWith('deploy')) return 'deployment';
    if (normalized.startsWith('train')) return 'training';
    return 'general';
};

export const normalizeExternalUrl = (value = '') => {
    try {
        const url = new URL(String(value).trim());
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
};

export const normalizeAlertUrl = normalizeExternalUrl;
