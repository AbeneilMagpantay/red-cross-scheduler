export const PAGE_INFO = {
    '/': {
        label: 'ARC Home',
        title: 'Your ARC workspace',
        description: 'Use this landing page to move between the four main parts of ARC.',
        items: [
            'Alerts keeps council announcements and deployment updates in one feed.',
            'NEXUS is the shared QR code, link, and resource board.',
            'CORE tracks officer and committee deliverables.',
            'Tracker contains personnel, scheduling, attendance, duty records, and shift swaps.'
        ]
    },
    '/tracker': {
        label: 'Tracker overview',
        title: 'Understand today at a glance',
        description: 'This is the starting point for volunteer operations and duty activity.',
        items: [
            'Use the summary cards to review personnel, today’s duties, swaps, and attendance.',
            'The duty roster shows who is scheduled today and their assigned time.',
            'Open the Tracker section in the sidebar to reach its detailed tools.'
        ]
    },
    '/personnel': {
        label: 'Personnel',
        title: 'Manage ARC accounts and roles',
        description: 'Administrators use Personnel to review account requests and maintain member records.',
        items: [
            'Approve or decline new account requests before they receive access.',
            'Assign Volunteer, Officer, or Administrator roles carefully.',
            'Archived names remain available to historical duty records.'
        ]
    },
    '/schedule': {
        label: 'Schedule',
        title: 'Plan and join deployment duties',
        description: 'Schedule is the shared calendar for duty details, registration, teams, and reminders.',
        items: [
            'Open a calendar entry to see its location, contacts, reminders, teams, and roster.',
            'Volunteers can manage their own duty time and personal notes before checkout.',
            'Officers and administrators can create duties and manage assignments.'
        ]
    },
    '/attendance': {
        label: 'Attendance',
        title: 'Handle live duty attendance',
        description: 'Use Attendance during an active duty to check personnel in and out.',
        items: [
            'Choose the duty date to load its scheduled personnel.',
            'Check-in and check-out times become part of the permanent duty record.',
            'Use Duty Records afterward for historical summaries and reporting.'
        ]
    },
    '/records': {
        label: 'Duty Records',
        title: 'Review completed service',
        description: 'Duty Records groups attendance from the same event and preserves its service history.',
        items: [
            'Use the personal summary to see your own attended duties and service time.',
            'Filter records to find an event or time period more quickly.',
            'Open an event table for the detailed attendance of everyone assigned to it.'
        ]
    },
    '/swaps': {
        label: 'Shift Swaps',
        title: 'Request and review duty changes',
        description: 'Shift Swaps gives personnel a clear process for requesting assignment exchanges.',
        items: [
            'Volunteers can submit and monitor their own swap requests.',
            'Administrators can approve or reject pending requests.',
            'Use the status filters to focus on requests that still need action.'
        ]
    },
    '/alerts': {
        label: 'Alerts',
        title: 'Stay informed about operations',
        description: 'Alerts is the council feed for deployments, training, announcements, and urgent updates.',
        items: [
            'Unread updates are counted on the navigation badge.',
            'Open an alert to read its full details and mark it as seen.',
            'Notification settings control supported device and background alerts.'
        ]
    },
    '/nexus': {
        label: 'NEXUS',
        title: 'Find shared council resources',
        description: 'NEXUS is a visual resource board for QR codes, links, files, and reference material.',
        items: [
            'Everyone can browse, search, open, and copy resources.',
            'Officers and administrators can add, edit, organize, and remove cards.',
            'Use compact view when you need to scan many resources quickly.'
        ]
    },
    '/core': {
        label: 'CORE',
        title: 'Follow officer deliverables',
        description: 'CORE keeps committee commitments, deadlines, progress, and remarks in one shared view.',
        items: [
            'Everyone can review current deliverables and their status.',
            'Officers and administrators can update deliverables and add committee rows.',
            'Changes save to the shared workspace for other members to see.'
        ]
    },
    '/settings': {
        label: 'Settings',
        title: 'Personalize your ARC experience',
        description: 'Settings contains account details, appearance, sound, and notification preferences.',
        items: [
            'Choose the appearance that is most comfortable for you.',
            'Enable supported notifications and review device-specific guidance.',
            'Your profile section shows the account and role currently signed in.'
        ]
    }
};

export const getPageInfo = (pathname) => PAGE_INFO[pathname] || PAGE_INFO['/'];

export const getWalkthroughSteps = ({ isAdmin = false } = {}) => [
    {
        path: '/',
        target: '[data-tour="landing-brand"]',
        title: 'Welcome to ARC',
        text: 'This is your shared council workspace. The home screen keeps every major module one tap away.',
        placement: 'bottom'
    },
    {
        path: '/',
        target: '[data-tour="landing-modules"]',
        title: 'Choose a workspace',
        text: 'Open Alerts, NEXUS, CORE, or Tracker from these four module buttons. They stay visible to every approved member.',
        placement: 'top'
    },
    {
        path: '/',
        target: '[data-tour="mobile-navigation"], [data-tour="primary-navigation"]',
        title: 'Move around ARC',
        text: 'Use the sidebar on larger screens or the bottom navigation on mobile. Tracker expands to reveal its operational tools.',
        placement: 'right'
    },
    {
        path: '/tracker',
        target: '.dashboard-hero',
        title: 'Tracker overview',
        text: 'Start duty work here. The overview summarizes today’s operations before you open a more detailed Tracker page.',
        placement: 'bottom'
    },
    ...(isAdmin ? [{
        path: '/personnel',
        target: '.page-header',
        title: 'Personnel and approvals',
        text: 'Administrators approve new accounts here, assign roles, and maintain active or archived personnel.',
        placement: 'bottom'
    }] : []),
    {
        path: '/schedule',
        target: '.schedule-toolbar, .schedule-page-header',
        title: 'Schedule duties',
        text: 'Browse the duty calendar, open event details, register your availability, and manage teams or reminders when your role allows it.',
        placement: 'bottom'
    },
    {
        path: '/attendance',
        target: '.stats-grid, .page-header',
        title: 'Record attendance',
        text: 'Use this live-duty workspace for check-ins, check-outs, and attendance status.',
        placement: 'bottom'
    },
    {
        path: '/records',
        target: '.duty-summary-grid, .page-header',
        title: 'Review duty history',
        text: 'See your service summary and grouped event attendance without splitting one event across separate tables.',
        placement: 'bottom'
    },
    {
        path: '/swaps',
        target: '.page-header',
        title: 'Manage shift swaps',
        text: 'Submit assignment exchanges and follow their approval status from one place.',
        placement: 'bottom'
    },
    {
        path: '/alerts',
        target: '.arc-module-header',
        title: 'Keep up with Alerts',
        text: 'This feed contains operational notices, new deployments, training updates, and council announcements.',
        placement: 'bottom'
    },
    {
        path: '/nexus',
        target: '.nexus-board-intro, .arc-module-header',
        title: 'Find resources in NEXUS',
        text: 'Search and open shared QR codes, links, files, and reference resources. Officers and administrators can maintain the board.',
        placement: 'bottom'
    },
    {
        path: '/core',
        target: '.core-meta-grid, .arc-module-header',
        title: 'Follow work in CORE',
        text: 'Review committee deliverables, progress, deadlines, and remarks in the shared officer workspace.',
        placement: 'bottom'
    },
    {
        path: '/settings',
        target: '[data-tour="page-info"]',
        title: 'Help is always nearby',
        text: 'Every page has this Info button. Open it whenever you need a quick explanation of that page and its main actions.',
        placement: 'left'
    }
];
