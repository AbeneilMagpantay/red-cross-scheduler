const FALLBACK_EVENT_TITLE = 'Individual Duty';

const normalizeTitle = (title) => title?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() || '';

const getFallbackEventKey = (schedule) => {
    if (!schedule.title?.trim()) return `schedule:${schedule.id}`;
    return `legacy:${schedule.duty_date}:${normalizeTitle(schedule.title)}`;
};

const getAssignmentTime = (schedule, field, fallback) => {
    const value = schedule?.[field];
    return value ? value.slice(0, 5) : fallback;
};

const localDateTime = (date, time) => new Date(`${date}T${time}:00`);

export const buildScheduleEvents = (schedules = [], dutyTeams = []) => {
    const groups = new Map();
    const teamsByEvent = new Map();

    dutyTeams.forEach((team) => {
        const teams = teamsByEvent.get(team.event_id) || [];
        teams.push(team);
        teamsByEvent.set(team.event_id, teams);
    });

    teamsByEvent.forEach((teams) => teams.sort((left, right) => (
        (left.sort_order ?? 0) - (right.sort_order ?? 0)
        || (left.created_at || '').localeCompare(right.created_at || '')
    )));

    schedules.forEach((schedule) => {
        const key = schedule.event_id || getFallbackEventKey(schedule);
        const existing = groups.get(key);

        if (existing) {
            existing.schedules.push(schedule);
            return;
        }

        groups.set(key, {
            id: key,
            eventId: schedule.event_id || null,
            title: schedule.title?.trim() || FALLBACK_EVENT_TITLE,
            dutyDescription: schedule.duty_description || '',
            date: schedule.duty_date,
            preciseLocation: schedule.precise_location || '',
            meetupPlace: schedule.meetup_place || '',
            organization: schedule.organization || schedule.organization_event_head || '',
            coordinator: schedule.coordinator || '',
            organizationEventHead: schedule.organization_event_head || '',
            contactPerson: schedule.contact_person || '',
            contactNumber: schedule.contact_number || '',
            reminderOffsets: schedule.reminder_offsets || [],
            teams: teamsByEvent.get(schedule.event_id) || [],
            schedules: [schedule]
        });
    });

    return [...groups.values()];
};

export const getEventStatus = (event, now = new Date()) => {
    if (!event?.date) return 'upcoming';

    const assignments = event.schedules?.length ? event.schedules : [{}];
    const windows = assignments.map((schedule) => {
        const startTime = getAssignmentTime(schedule, 'start_time', '00:00');
        const endTime = getAssignmentTime(schedule, 'end_time', '23:59');
        const start = localDateTime(event.date, startTime);
        const end = localDateTime(event.date, endTime);
        if (endTime < startTime) end.setDate(end.getDate() + 1);
        return { start, end };
    });
    const startsAt = new Date(Math.min(...windows.map((window) => window.start.getTime())));
    const endsAt = new Date(Math.max(...windows.map((window) => window.end.getTime())));

    if (now < startsAt) return 'upcoming';
    if (now > endsAt) return 'concluded';
    return 'ongoing';
};

export const hasCheckedOut = (schedule) => {
    const records = Array.isArray(schedule?.attendance)
        ? schedule.attendance
        : schedule?.attendance ? [schedule.attendance] : [];

    return records.some((record) => Boolean(record?.check_out));
};

const getShiftPeriod = (schedule) => {
    if (!schedule.start_time) return 'Unscheduled';
    const hour = Number(schedule.start_time.slice(0, 2));
    return hour < 12 ? 'AM' : 'PM';
};

const compareAssignments = (left, right) => {
    const leftTime = getAssignmentTime(left, 'start_time', '99:99');
    const rightTime = getAssignmentTime(right, 'start_time', '99:99');
    const timeComparison = leftTime.localeCompare(rightTime);
    if (timeComparison !== 0) return timeComparison;

    return (left.personnel?.name || '').localeCompare(right.personnel?.name || '');
};

export const organizeEventAssignments = (schedules = [], currentPersonnelId) => {
    const registered = schedules.filter((schedule) => schedule.personnel_id);
    const ownAssignment = registered.find((schedule) => schedule.personnel_id === currentPersonnelId) || null;
    const otherAssignments = registered.filter((schedule) => schedule.id !== ownAssignment?.id);
    const periods = ['AM', 'PM', 'Unscheduled'];

    const groups = periods
        .map((period) => ({
            period,
            assignments: otherAssignments.filter((schedule) => getShiftPeriod(schedule) === period).sort(compareAssignments)
        }))
        .filter((group) => group.assignments.length > 0);

    return { ownAssignment, groups, registeredCount: registered.length };
};

export const getReminderLabel = (minutes) => {
    if (minutes % 1440 === 0) {
        const days = minutes / 1440;
        return `${days} day${days === 1 ? '' : 's'} before`;
    }

    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours} hour${hours === 1 ? '' : 's'} before`;
    }

    return `${minutes} minutes before`;
};

export const reminderHoursToMinutes = (hours = []) => [
    ...new Set(hours
        .slice(0, 5)
        .map((value) => Math.round(Number(value) * 60))
        .filter((value) => Number.isFinite(value) && value > 0))
].sort((left, right) => right - left);
