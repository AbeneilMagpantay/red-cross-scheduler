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
        const title = rawTitle || 'Untitled Duty';
        const date = schedule.duty_date;
        const scheduledTime = getScheduledTime(schedule);

        // A titled event is identified by its date and normalized title. Untitled
        // legacy duties stay separate because there is no reliable shared identity.
        const key = rawTitle
            ? `${date}::${normalizeTitle(rawTitle)}`
            : `${date}::untitled::${record.schedule_id}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                id: key,
                title,
                date,
                timeRanges: new Set(),
                attendees: []
            });
        }

        const event = grouped.get(key);
        event.timeRanges.add(scheduledTime);
        event.attendees.push({
            id: record.id,
            personnelId: record.personnel_id,
            scheduleId: record.schedule_id,
            name: record.personnel?.name || 'Unknown',
            scheduledTime,
            checkIn: record.check_in,
            checkOut: record.check_out,
            status: record.status || 'pending',
            notes: record.notes
        });
    });

    return Array.from(grouped.values())
        .map((event) => ({
            ...event,
            timeRanges: Array.from(event.timeRanges).sort(),
            attendees: event.attendees.sort((a, b) =>
                a.scheduledTime.localeCompare(b.scheduledTime) || a.name.localeCompare(b.name)
            )
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
};

export const summarizePersonnelAttendance = (attendanceRecords = [], personnelId) => {
    if (!personnelId) {
        return {
            attended: 0,
            present: 0,
            late: 0,
            absent: 0,
            excused: 0,
            pending: 0,
            decided: 0,
            attendanceRate: 0,
            loggedHours: 0
        };
    }

    // A schedule represents one duty. If duplicate attendance rows exist, only
    // the latest record for that duty should contribute to the personal summary.
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

    const summary = {
        attended: 0,
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
        pending: 0,
        decided: 0,
        attendanceRate: 0,
        loggedHours: 0
    };

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
