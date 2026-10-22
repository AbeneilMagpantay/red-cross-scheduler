import { UNTITLED_DUTY } from './schedule.js';
import { formatTimeRange } from './format.js';

const normalizeTitle = (title) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

const getScheduledTime = (schedule) => {
    const start = schedule.start_time?.slice(0, 5);
    const end = schedule.end_time?.slice(0, 5);

    if (start && end) return `${start} - ${end}`;
    if (start) return `From ${start}`;
    if (end) return `Until ${end}`;
    return 'Time not set';
};

export const groupAttendanceByEvent = (attendanceRecords = []) => {
    const grouped = new Map();

    attendanceRecords.forEach((record) => {
        const schedule = record.schedules;
        if (!schedule?.duty_date) return;

        const rawTitle = schedule.title?.trim() || '';
        const title = rawTitle || UNTITLED_DUTY;
        const date = schedule.duty_date;
        const scheduledTime = getScheduledTime(schedule);

        // Group titled duties by date + title; untitled ones have no shared identity.
        const key = rawTitle
            ? `${date}::${normalizeTitle(rawTitle)}`
            : `${date}::untitled::${record.schedule_id}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                id: key,
                title,
                date,
                timeRanges: new Map(),
                attendees: []
            });
        }

        const event = grouped.get(key);
        // Sort and group on HH:MM keys; show 12-hour labels.
        const timeLabel = formatTimeRange(schedule.start_time, schedule.end_time);
        event.timeRanges.set(scheduledTime, timeLabel);
        event.attendees.push({
            id: record.id,
            personnelId: record.personnel_id,
            scheduleId: record.schedule_id,
            name: record.personnel?.name || 'Unknown',
            scheduledTime,
            timeLabel,
            checkIn: record.check_in,
            checkOut: record.check_out,
            status: record.status || 'pending',
            notes: record.notes
        });
    });

    return Array.from(grouped.values())
        .map((event) => ({
            ...event,
            timeRanges: Array.from(event.timeRanges.keys()).sort(),
            timeLabels: Array.from(event.timeRanges.keys()).sort().map((range) => event.timeRanges.get(range)),
            attendees: event.attendees.sort((a, b) =>
                a.scheduledTime.localeCompare(b.scheduledTime) || a.name.localeCompare(b.name)
            )
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
};

const emptySummary = () => ({
    attended: 0,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    pending: 0,
    decided: 0,
    attendanceRate: 0,
    loggedHours: 0
});

export const summarizePersonnelAttendance = (attendanceRecords = [], personnelId) => {
    if (!personnelId) return emptySummary();

    // Count only the latest attendance row per duty.
    const duties = new Map();
    attendanceRecords
        .filter((record) => record.personnel_id === personnelId)
        .forEach((record) => {
            const key = record.schedule_id || record.id;
            const existing = duties.get(key);
            const recordTime = new Date(record.created_at || 0).getTime();
            const existingTime = new Date(existing?.created_at || 0).getTime();

            if (!existing || recordTime >= existingTime) duties.set(key, record);
        });

    const summary = emptySummary();
    let loggedMinutes = 0;

    duties.forEach((record) => {
        const status = record.status || 'pending';
        if (Object.hasOwn(summary, status)) summary[status] += 1;

        if (status === 'present' || status === 'late') summary.attended += 1;

        if (record.check_in && record.check_out) {
            const duration = new Date(record.check_out).getTime() - new Date(record.check_in).getTime();
            if (Number.isFinite(duration) && duration > 0) loggedMinutes += duration / 60000;
        }
    });

    summary.decided = summary.attended + summary.absent;
    summary.attendanceRate = summary.decided
        ? Math.round((summary.attended / summary.decided) * 100)
        : 0;
    summary.loggedHours = Math.round((loggedMinutes / 60) * 10) / 10;

    return summary;
};
