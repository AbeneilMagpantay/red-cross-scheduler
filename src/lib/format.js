import { format, parseISO } from 'date-fns';

// '08:00:00' or '08:00' -> '8:00 AM'
export const formatTime = (value) => {
    if (!value) return '';
    const [hours, minutes] = String(value).split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return '';
    const period = hours < 12 ? 'AM' : 'PM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
};

export const formatTimeRange = (start, end, fallback = 'Time not set') => {
    const from = formatTime(start);
    const to = formatTime(end);
    if (from && to) return `${from} – ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Until ${to}`;
    return fallback;
};

// Duty dates are plain 'YYYY-MM-DD' values; parseISO reads them as local dates,
// while new Date('YYYY-MM-DD') reads them as UTC and can show the previous day.
export const formatDutyDate = (date, pattern = 'EEEE, MMMM d, yyyy') => (date ? format(parseISO(date), pattern) : '');

// Timestamps such as check-in times -> '8:05 AM'
export const formatClockTime = (timestamp) => (timestamp ? format(new Date(timestamp), 'h:mm a') : '—');
