export const ARC_RESOURCE_BUCKET = 'arc-resource-qr';

export const roleCanViewArc = (role) => ['admin', 'officer', 'volunteer'].includes(role);

export const roleCanEditArc = (role) => role === 'admin' || role === 'officer';

// Kept as a compatibility alias for older imports. "Access" originally meant
// edit access when NEXUS and CORE were officer-only.
export const roleCanAccessArc = roleCanEditArc;

export const CORE_STATUSES = ['Not Started', 'Blocked', 'In Progress', 'Completed', 'NONE'];

export const CORE_ROWS = [
    {
        slug: 'lead',
        label: 'Lead',
        color: 'lead',
        numbered: true,
        deliverable: '<ol><li>Monthly leadership report</li><li>Officer performance review</li><li>Strategic planning update</li></ol>',
        statuses: ['In Progress', 'Not Started', 'Not Started'],
        deadlines: ['Monday, May 4, 2026', 'May 10, 2026', 'May 15, 2026'],
        remarks: ['For review', '—', '—']
    },
    { slug: 'internal-affairs', label: 'Internal Affairs', color: 'internal', deliverable: 'Officer coordination brief', status: 'Completed', deadline: 'May 8, 2026', remark: 'Submitted' },
    { slug: 'external-relations', label: 'External Relations', color: 'external', deliverable: 'Partner outreach list', status: 'Blocked', deadline: 'May 12, 2026', remark: 'Awaiting confirmation' },
    { slug: 'secretariat', label: 'Secretariat', color: 'secretariat', deliverable: 'Meeting minutes and files', deadline: 'May 15, 2026' },
    { slug: 'finance', label: 'Finance', color: 'finance', deliverable: 'Monthly budget update', deadline: 'May 16, 2026' },
    { slug: 'media-and-communications', label: 'Media & Communications', color: 'media', deliverable: 'Content calendar', deadline: 'May 18, 2026' },
    { slug: 'fundraising', label: 'Fundraising', color: 'fundraising', deliverable: 'Fundraising proposal', deadline: 'May 20, 2026' },
    { slug: 'safe-space', label: 'Safe Space', color: 'safe', deliverable: 'Safety protocol check', deadline: 'May 22, 2026' },
    { slug: 'community-engagement', label: 'Community Engagement', color: 'community', deliverable: 'Community activity plan', deadline: 'May 24, 2026' },
    { slug: 'design-and-innovation', label: 'Design & Innovation', color: 'design', deliverable: 'Campaign design kit', deadline: 'May 26, 2026' },
    { slug: 'formation', label: 'Formation', color: 'formation', deliverable: 'Formation session outline', deadline: 'May 28, 2026' },
    { slug: 'recruitment', label: 'Recruitment', color: 'recruitment', deliverable: 'Membership recruitment plan', deadline: 'May 30, 2026' },
    { slug: 'deployment', label: 'Deployment', color: 'deployment', deliverable: 'Event logistics deployment plan', deadline: 'May 31, 2026' }
];

const coreLineKey = (prefix, row, index) => (
    row.numbered || index > 0
        ? `${prefix}-${row.slug}-${index + 1}`
        : `${prefix}-${row.slug}`
);

export const getCoreLineKeys = (row, count, prefix) => (
    Array.from({ length: Math.max(1, count) }, (_, index) => coreLineKey(prefix, row, index))
);

export const countDeliverables = (html = '') => {
    const listItems = html.match(/<li\b[^>]*>/gi)?.length || 0;
    if (listItems) return listItems;
    return html.replace(/<[^>]*>/g, '').trim() ? 1 : 1;
};

export const createDefaultCoreFields = () => {
    const fields = {
        'month-value': 'May 2026',
        'updated-value': 'May 29, 2026',
        'updated-by-value': 'ARC Secretariat',
        'tracker-footnote': 'Status updates are reviewed during the officers’ monthly coordination meeting. Edits save automatically and sync for everyone within a few seconds.',
        customRows: '[]'
    };

    CORE_ROWS.forEach((row) => {
        fields[`officer-${row.slug}`] = row.label;
        fields[`deliverable-${row.slug}`] = row.deliverable;
        const count = countDeliverables(row.deliverable);

        getCoreLineKeys(row, count, 'status').forEach((key, index) => {
            fields[key] = row.statuses?.[index] || row.status || 'Not Started';
        });
        getCoreLineKeys(row, count, 'deadline').forEach((key, index) => {
            fields[key] = row.deadlines?.[index] || row.deadline || 'Set a date';
        });
        getCoreLineKeys(row, count, 'remarks').forEach((key, index) => {
            fields[key] = row.remarks?.[index] || row.remark || '—';
        });
    });

    return fields;
};

const ALLOWED_RICH_TAGS = new Set([
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h1', 'h2', 'h3', 'ol', 'ul', 'li', 'br', 'p', 'div', 'span'
]);

export const sanitizeArcHtml = (value = '') => {
    const withoutUnsafeBlocks = String(value)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');

    return withoutUnsafeBlocks.replace(/<(\/?)\s*([a-z0-9-]+)(?:\s[^>]*)?>/gi, (_, closing, rawTag) => {
        const tag = rawTag.toLowerCase();
        if (!ALLOWED_RICH_TAGS.has(tag)) return '';
        return `<${closing ? '/' : ''}${tag}>`;
    });
};

export const arcHtmlToText = (value = '') => sanitizeArcHtml(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const getCoreStatusClass = (status = '') => status.toLowerCase().replace(/\s+/g, '-');

export const parseCustomCoreRows = (value) => {
    try {
        const rows = JSON.parse(value || '[]');
        return Array.isArray(rows)
            ? rows.filter((row) => row && typeof row.slug === 'string').map((row) => ({
                slug: row.slug,
                label: row.label || 'New Committee',
                color: row.colorClass || row.color || 'custom',
                deliverable: row.deliverable || 'New deliverable'
            }))
            : [];
    } catch {
        return [];
    }
};
