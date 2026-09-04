import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import {
    Bell,
    Calendar as CalendarIcon,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    FileText,
    LockKeyhole,
    MapPin,
    Navigation,
    Pencil,
    Phone,
    Plus,
    Sunrise,
    Sunset,
    Trash2,
    User,
    UserPlus,
    UserRoundCog,
    Users
} from 'lucide-react';
import {
    addMonths,
    addWeeks,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    startOfMonth,
    startOfWeek,
    subMonths,
    subWeeks
} from 'date-fns';
import {
    buildScheduleEvents,
    getEventStatus,
    getReminderLabel,
    hasCheckedOut,
    organizeEventAssignments,
    reminderHoursToMinutes
} from '../lib/schedule';

const createDraftId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const createTeamMember = () => ({
    id: createDraftId(),
    personnel_id: '',
    assignment_role: ''
});

const createTeam = () => ({
    id: createDraftId(),
    name: '',
    members: []
});

const CREATE_EVENT_STEPS = [
    { id: 'schedule', label: 'Date & Time' },
    { id: 'details', label: 'Duty Details' },
    { id: 'contact', label: 'Organization' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'reminders', label: 'Reminders' }
];

const EDIT_EVENT_STEPS = CREATE_EVENT_STEPS.filter((step) => step.id !== 'assignments');

const emptyEventForm = (date = new Date()) => ({
    title: '',
    duty_description: '',
    duty_date: format(date, 'yyyy-MM-dd'),
    precise_location: '',
    meetup_place: '',
    organization: '',
    coordinator: '',
    contact_person: '',
    contact_number: '',
    reminder_hours: ['24', '2'],
    teams: [],
    start_time: '08:00',
    end_time: '17:00'
});

const emptyAssignmentForm = () => ({
    personnel_id: '',
    team_id: '',
    team_station: '',
    assignment_role: '',
    start_time: '08:00',
    end_time: '17:00',
    notes: ''
});

const toLocalDate = (date) => new Date(`${date}T00:00:00`);
const getLastName = (name = '') => name.trim().split(/\s+/).filter(Boolean).at(-1) || 'Unknown';

const getEventTimeRange = (event) => {
    const startTimes = event.schedules.map((schedule) => schedule.start_time?.slice(0, 5)).filter(Boolean).sort();
    const endTimes = event.schedules.map((schedule) => schedule.end_time?.slice(0, 5)).filter(Boolean).sort();
    if (!startTimes.length || !endTimes.length) return 'Time to be announced';
    return `${startTimes[0]} – ${endTimes[endTimes.length - 1]}`;
};

const statusLabels = {
    upcoming: 'Upcoming',
    ongoing: 'In progress',
    concluded: 'Concluded'
};

export default function Schedule() {
    const { profile, isAdmin, canManageSchedule } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [view, setView] = useState('month');
    const [schedules, setSchedules] = useState([]);
    const [dutyTeams, setDutyTeams] = useState([]);
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);

    const [viewingEventId, setViewingEventId] = useState(null);
    const [registeringEventId, setRegisteringEventId] = useState(null);
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [assignmentEventId, setAssignmentEventId] = useState(null);
    const [teamManagerEventId, setTeamManagerEventId] = useState(null);
    const [teamRoleDrafts, setTeamRoleDrafts] = useState({});
    const [updatingTeamMemberId, setUpdatingTeamMemberId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [eventStep, setEventStep] = useState(0);

    const [eventForm, setEventForm] = useState(() => emptyEventForm());
    const [registerForm, setRegisterForm] = useState({
        start_time: '08:00',
        end_time: '17:00',
        notes: ''
    });
    const [assignmentForm, setAssignmentForm] = useState(() => emptyAssignmentForm());

    const loadData = useCallback(async () => {
        try {
            const rangeStart = view === 'month'
                ? startOfWeek(startOfMonth(currentDate))
                : startOfWeek(currentDate);
            const rangeEnd = view === 'month'
                ? endOfWeek(endOfMonth(currentDate))
                : endOfWeek(currentDate);

            const [scheduleRes, personnelRes] = await Promise.all([
                db.getSchedules(format(rangeStart, 'yyyy-MM-dd'), format(rangeEnd, 'yyyy-MM-dd'), true),
                db.getPersonnel()
            ]);

            if (scheduleRes.error) throw scheduleRes.error;
            const loadedSchedules = scheduleRes.data || [];
            const eventIds = [...new Set(loadedSchedules.map((schedule) => schedule.event_id).filter(Boolean))];
            const teamRes = await db.getDutyTeams(eventIds);

            if (teamRes.error) {
                console.warn('Duty teams could not be loaded. Apply the latest migration if this is a new deployment:', teamRes.error);
            }

            setSchedules(loadedSchedules);
            setDutyTeams(teamRes.data || []);
            setPersonnel(personnelRes.data?.filter((person) => person.is_active) || []);
        } catch (error) {
            console.error('Error loading schedule:', error);
        } finally {
            setLoading(false);
        }
    }, [currentDate, view]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const calendarDays = useMemo(() => {
        if (view === 'week') {
            return eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
        }

        return eachDayOfInterval({
            start: startOfWeek(startOfMonth(currentDate)),
            end: endOfWeek(endOfMonth(currentDate))
        });
    }, [currentDate, view]);

    const events = useMemo(() => buildScheduleEvents(schedules, dutyTeams), [schedules, dutyTeams]);
    const viewingEvent = events.find((event) => event.id === viewingEventId) || null;
    const registeringEvent = events.find((event) => event.id === registeringEventId) || null;
    const assignmentEvent = events.find((event) => event.id === assignmentEventId) || null;
    const teamManagerEvent = events.find((event) => event.id === teamManagerEventId) || null;

    useEffect(() => {
        if (viewingEventId && !viewingEvent) setViewingEventId(null);
    }, [viewingEvent, viewingEventId]);

    const getEventsForDay = useCallback((date) => {
        const dateString = format(date, 'yyyy-MM-dd');
        return events
            .filter((event) => event.date === dateString)
            .sort((left, right) => {
                const leftTime = left.schedules[0]?.start_time || '99:99';
                const rightTime = right.schedules[0]?.start_time || '99:99';
                return leftTime.localeCompare(rightTime) || left.title.localeCompare(right.title);
            });
    }, [events]);

    const selectedDayEvents = getEventsForDay(selectedDate);
    const myUpcomingCount = events.filter((event) => (
        getEventStatus(event) !== 'concluded'
        && event.schedules.some((schedule) => schedule.personnel_id === profile?.id)
    )).length;
    const eventSteps = editingEvent ? EDIT_EVENT_STEPS : CREATE_EVENT_STEPS;
    const activeEventStep = eventSteps[eventStep] || eventSteps[0];

    const handlePrev = () => {
        const nextDate = view === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1);
        setCurrentDate(nextDate);
        setSelectedDate(nextDate);
    };

    const handleNext = () => {
        const nextDate = view === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1);
        setCurrentDate(nextDate);
        setSelectedDate(nextDate);
    };

    const handleToday = () => {
        const today = new Date();
        setCurrentDate(today);
        setSelectedDate(today);
    };

    const handleDayClick = (date) => {
        setSelectedDate(date);
        if (view === 'month' && !isSameMonth(date, currentDate)) setCurrentDate(date);
    };

    const openCreateEvent = (date = selectedDate) => {
        if (!canManageSchedule) return;
        setEditingEvent(null);
        setEventForm(emptyEventForm(date));
        setEventStep(0);
        setIsEventModalOpen(true);
    };

    const openEditEvent = (event) => {
        if (!canManageSchedule || getEventStatus(event) === 'concluded') return;

        const eventStartTimes = event.schedules.map((schedule) => schedule.start_time?.slice(0, 5)).filter(Boolean).sort();
        const eventEndTimes = event.schedules.map((schedule) => schedule.end_time?.slice(0, 5)).filter(Boolean).sort();

        setEditingEvent(event);
        setEventForm({
            ...emptyEventForm(toLocalDate(event.date)),
            title: event.title,
            duty_description: event.dutyDescription,
            duty_date: event.date,
            precise_location: event.preciseLocation,
            meetup_place: event.meetupPlace,
            organization: event.organization,
            coordinator: event.coordinator,
            contact_person: event.contactPerson,
            contact_number: event.contactNumber,
            reminder_hours: (event.reminderOffsets || []).map((minutes) => String(minutes / 60)),
            start_time: eventStartTimes[0] || '08:00',
            end_time: eventEndTimes[eventEndTimes.length - 1] || '17:00'
        });
        setEventStep(0);
        setViewingEventId(null);
        setIsEventModalOpen(true);
    };

    const closeEventModal = () => {
        if (saving) return;
        setIsEventModalOpen(false);
        setEditingEvent(null);
        setEventStep(0);
    };

    const handleEventNext = (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        setEventStep((current) => Math.min(current + 1, eventSteps.length - 1));
    };

    const addTeam = () => setEventForm((current) => ({ ...current, teams: [...current.teams, createTeam()] }));

    const setTeamCount = (value) => {
        const requestedCount = Math.max(0, Math.floor(Number(value) || 0));
        setEventForm((current) => {
            if (requestedCount === current.teams.length) return current;
            if (requestedCount < current.teams.length) {
                return { ...current, teams: current.teams.slice(0, requestedCount) };
            }
            return {
                ...current,
                teams: [
                    ...current.teams,
                    ...Array.from({ length: requestedCount - current.teams.length }, () => createTeam())
                ]
            };
        });
    };

    const updateTeam = (teamId, updates) => setEventForm((current) => ({
        ...current,
        teams: current.teams.map((team) => team.id === teamId ? { ...team, ...updates } : team)
    }));

    const removeTeam = (teamId) => setEventForm((current) => ({
        ...current,
        teams: current.teams.filter((team) => team.id !== teamId)
    }));

    const addTeamMember = (teamId) => setEventForm((current) => ({
        ...current,
        teams: current.teams.map((team) => team.id === teamId
            ? { ...team, members: [...team.members, createTeamMember()] }
            : team)
    }));

    const updateTeamMember = (teamId, memberId, updates) => setEventForm((current) => ({
        ...current,
        teams: current.teams.map((team) => team.id === teamId
            ? {
                ...team,
                members: team.members.map((member) => member.id === memberId ? { ...member, ...updates } : member)
            }
            : team)
    }));

    const removeTeamMember = (teamId, memberId) => setEventForm((current) => ({
        ...current,
        teams: current.teams.map((team) => team.id === teamId
            ? { ...team, members: team.members.filter((member) => member.id !== memberId) }
            : team)
    }));

    const addReminder = () => {
        if (eventForm.reminder_hours.length >= 5) return;
        setEventForm((current) => ({ ...current, reminder_hours: [...current.reminder_hours, '1'] }));
    };

    const updateReminder = (index, value) => setEventForm((current) => ({
        ...current,
        reminder_hours: current.reminder_hours.map((hours, reminderIndex) => reminderIndex === index ? value : hours)
    }));

    const removeReminder = (index) => setEventForm((current) => ({
        ...current,
        reminder_hours: current.reminder_hours.filter((_, reminderIndex) => reminderIndex !== index)
    }));

    const handleEventSubmit = async (event) => {
        event.preventDefault();

        setSaving(true);

        try {
            const reminderOffsets = reminderHoursToMinutes(eventForm.reminder_hours);
            const dutyDate = eventForm.duty_date || editingEvent?.date || format(new Date(), 'yyyy-MM-dd');
            const startTime = eventForm.start_time || '00:00';
            const endTime = eventForm.end_time || '23:59';
            const eventDetails = {
                title: eventForm.title.trim() || null,
                duty_description: eventForm.duty_description.trim() || null,
                duty_date: dutyDate,
                precise_location: eventForm.precise_location.trim() || null,
                meetup_place: eventForm.meetup_place.trim() || null,
                organization_event_head: eventForm.organization.trim() || null,
                organization: eventForm.organization.trim() || null,
                coordinator: eventForm.coordinator.trim() || null,
                contact_person: eventForm.contact_person.trim() || null,
                contact_number: eventForm.contact_number.trim() || null,
                reminder_offsets: reminderOffsets,
                start_time: startTime,
                end_time: endTime
            };

            if (editingEvent) {
                const { error } = await db.updateEvent(editingEvent.eventId, eventDetails);
                if (error) throw error;
            } else {
                const { data: createdSchedule, error } = await db.createSchedule({
                    ...eventDetails,
                    personnel_id: null,
                    team_station: null,
                    notes: null,
                    is_deployment_event: true,
                    is_event_anchor: true
                });
                if (error) throw error;

                const { data: createdTeams, error: teamError } = await db.createDutyTeams(
                    eventForm.teams.map((team, index) => ({
                        event_id: createdSchedule.event_id,
                        event_anchor_id: createdSchedule.id,
                        name: team.name.trim() || null,
                        sort_order: index
                    }))
                );
                if (teamError) {
                    await db.deleteEvent(createdSchedule.event_id);
                    throw new Error(`The duty was not created because its teams could not be saved: ${teamError.message}`);
                }

                const teamsByOrder = [...(createdTeams || [])].sort((left, right) => left.sort_order - right.sort_order);

                const assignments = eventForm.teams.flatMap((team, teamIndex) => team.members
                    .filter((member) => member.personnel_id)
                    .map((member) => ({
                        ...eventDetails,
                        event_id: createdSchedule.event_id,
                        personnel_id: member.personnel_id,
                        team_id: teamsByOrder[teamIndex]?.id || null,
                        team_station: team.name.trim() || null,
                        assignment_role: member.assignment_role.trim() || null,
                        notes: null,
                        is_deployment_event: true,
                        is_event_anchor: false
                    })));

                if (assignments.length) {
                    const { error: assignmentError } = await db.createSchedules(assignments);
                    if (assignmentError) {
                        await db.deleteEvent(createdSchedule.event_id);
                        throw new Error(`The duty was not created because its assignments could not be saved: ${assignmentError.message}`);
                    }
                }

                db.sendDeploymentNotification(createdSchedule.id)
                    .then(({ error: notificationError }) => {
                        if (notificationError) console.warn('Event saved, but its notification failed:', notificationError);
                    })
                    .catch((notificationError) => console.warn('Event saved, but its notification failed:', notificationError));
            }

            setIsEventModalOpen(false);
            setEditingEvent(null);
            setEventStep(0);
            await loadData();
        } catch (error) {
            console.error('Error saving event:', error);
            window.alert(`Failed to save event: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteEvent = async (targetEvent = editingEvent) => {
        if (!isAdmin || !targetEvent) return;
        if (!window.confirm(`Delete “${targetEvent.title}” and all of its assignments? Linked attendance and swap records will also be permanently removed.`)) return;

        setSaving(true);
        try {
            const { error } = await db.deleteEvent(targetEvent.eventId);
            if (error) throw error;
            setIsEventModalOpen(false);
            setEditingEvent(null);
            setViewingEventId(null);
            await loadData();
        } catch (error) {
            window.alert(`Failed to delete event: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const openRegister = (event) => {
        if (getEventStatus(event) === 'concluded') return;
        setRegisteringEventId(event.id);
        setRegisterForm({ start_time: '08:00', end_time: '17:00', notes: '' });
        setViewingEventId(null);
        setIsRegisterModalOpen(true);
    };

    const handleRegisterSubmit = async (event) => {
        event.preventDefault();
        if (!registeringEvent || !profile) return;
        setSaving(true);

        try {
            if (getEventStatus(registeringEvent) === 'concluded') throw new Error('This event has already concluded.');

            const { error } = await db.createSchedule({
                event_id: registeringEvent.eventId,
                personnel_id: profile.id,
                duty_date: registeringEvent.date,
                title: registeringEvent.title,
                duty_description: registeringEvent.dutyDescription || null,
                start_time: registerForm.start_time,
                end_time: registerForm.end_time,
                notes: registerForm.notes.trim() || null,
                precise_location: registeringEvent.preciseLocation || null,
                meetup_place: registeringEvent.meetupPlace || null,
                organization_event_head: registeringEvent.organization || null,
                organization: registeringEvent.organization || null,
                coordinator: registeringEvent.coordinator || null,
                contact_person: registeringEvent.contactPerson || null,
                contact_number: registeringEvent.contactNumber || null,
                reminder_offsets: registeringEvent.reminderOffsets,
                is_deployment_event: true
            });
            if (error) throw error;

            setIsRegisterModalOpen(false);
            setRegisteringEventId(null);
            await loadData();
        } catch (error) {
            window.alert(`Failed to register: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const openEditAssignment = (schedule, event) => {
        const isOwner = schedule.personnel_id === profile?.id;
        const isLocked = getEventStatus(event) === 'concluded' || hasCheckedOut(schedule);
        if ((!canManageSchedule && !isOwner) || isLocked) return;

        setEditingSchedule(schedule);
        setAssignmentEventId(event.id);
        setAssignmentForm({
            personnel_id: schedule.personnel_id || '',
            team_id: schedule.team_id || '',
            team_station: schedule.team_station || '',
            assignment_role: schedule.assignment_role || '',
            start_time: schedule.start_time?.slice(0, 5) || '',
            end_time: schedule.end_time?.slice(0, 5) || '',
            notes: schedule.notes || ''
        });
        setViewingEventId(null);
        setIsAssignmentModalOpen(true);
    };

    const openAddAssignment = (event) => {
        if (!canManageSchedule || getEventStatus(event) === 'concluded') return;
        setEditingSchedule(null);
        setAssignmentEventId(event.id);
        setAssignmentForm(emptyAssignmentForm());
        setViewingEventId(null);
        setIsAssignmentModalOpen(true);
    };

    const handleAssignmentSubmit = async (event) => {
        event.preventDefault();
        if (!assignmentEvent) return;
        setSaving(true);

        try {
            if (getEventStatus(assignmentEvent) === 'concluded') throw new Error('This event has already concluded.');

            const isOwnAssignment = editingSchedule?.personnel_id === profile?.id;
            const personalUpdates = {
                start_time: assignmentForm.start_time,
                end_time: assignmentForm.end_time,
                notes: assignmentForm.notes.trim() || null
            };
            const selectedTeam = assignmentEvent.teams.find((team) => team.id === assignmentForm.team_id) || null;
            const teamUpdates = {
                team_id: selectedTeam?.id || null,
                team_station: selectedTeam?.name?.trim() || null,
                assignment_role: assignmentForm.assignment_role.trim() || null
            };

            if (editingSchedule) {
                const updates = isOwnAssignment
                    ? personalUpdates
                    : {
                        ...personalUpdates,
                        personnel_id: assignmentForm.personnel_id,
                        ...teamUpdates
                    };
                const { error } = await db.updateSchedule(editingSchedule.id, updates);
                if (error) throw error;
            } else {
                const { error } = await db.createSchedule({
                    event_id: assignmentEvent.eventId,
                    personnel_id: assignmentForm.personnel_id,
                    duty_date: assignmentEvent.date,
                    title: assignmentEvent.title,
                    duty_description: assignmentEvent.dutyDescription || null,
                    precise_location: assignmentEvent.preciseLocation || null,
                    meetup_place: assignmentEvent.meetupPlace || null,
                    organization_event_head: assignmentEvent.organization || null,
                    organization: assignmentEvent.organization || null,
                    coordinator: assignmentEvent.coordinator || null,
                    contact_person: assignmentEvent.contactPerson || null,
                    contact_number: assignmentEvent.contactNumber || null,
                    reminder_offsets: assignmentEvent.reminderOffsets,
                    is_deployment_event: true,
                    ...teamUpdates,
                    ...personalUpdates
                });
                if (error) throw error;
            }

            setIsAssignmentModalOpen(false);
            setEditingSchedule(null);
            setAssignmentEventId(null);
            await loadData();
        } catch (error) {
            window.alert(`Failed to save assignment: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAssignment = async () => {
        if (!editingSchedule || !assignmentEvent) return;
        const isOwner = editingSchedule.personnel_id === profile?.id;
        const action = isOwner ? 'leave this event' : 'remove this volunteer';
        if (!window.confirm(`Are you sure you want to ${action}?`)) return;

        setSaving(true);
        try {
            const { error } = await db.deleteSchedule(editingSchedule.id);
            if (error) throw error;
            setIsAssignmentModalOpen(false);
            setEditingSchedule(null);
            setAssignmentEventId(null);
            await loadData();
        } catch (error) {
            window.alert(`Failed to update registration: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const getTeamDisplayName = (team, event) => {
        const index = event?.teams.findIndex((item) => item.id === team.id) ?? -1;
        return team.name?.trim() || `Team ${index + 1}`;
    };

    const openTeamManager = (event) => {
        if (!event) return;
        setTeamManagerEventId(event.id);
        setTeamRoleDrafts(Object.fromEntries(
            event.schedules
                .filter((schedule) => schedule.personnel_id)
                .map((schedule) => [schedule.id, schedule.assignment_role || ''])
        ));
        setViewingEventId(null);
    };

    const closeTeamManager = () => {
        if (saving) return;
        setTeamManagerEventId(null);
        setTeamRoleDrafts({});
    };

    const handleAddManagedTeam = async () => {
        if (!canManageSchedule || !teamManagerEvent || getEventStatus(teamManagerEvent) === 'concluded') return;
        const anchor = teamManagerEvent.schedules.find((schedule) => schedule.is_event_anchor)
            || teamManagerEvent.schedules[0];
        if (!anchor) return;

        setSaving(true);
        try {
            const { error } = await db.createDutyTeam({
                event_id: teamManagerEvent.eventId,
                event_anchor_id: anchor.id,
                name: null,
                sort_order: teamManagerEvent.teams.length
            });
            if (error) throw error;
            await loadData();
        } catch (error) {
            window.alert(`Failed to add team: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleRenameTeam = async (team, name) => {
        if (!canManageSchedule || !teamManagerEvent || getEventStatus(teamManagerEvent) === 'concluded') return;
        const nextName = name.trim() || null;
        if (nextName === (team.name?.trim() || null)) return;

        setSaving(true);
        try {
            const { error } = await db.updateDutyTeam(team.id, { name: nextName });
            if (error) throw error;
            await loadData();
        } catch (error) {
            window.alert(`Failed to rename team: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteManagedTeam = async (team) => {
        if (!canManageSchedule || !teamManagerEvent || getEventStatus(teamManagerEvent) === 'concluded') return;
        if (!window.confirm(`Delete ${getTeamDisplayName(team, teamManagerEvent)}? Its volunteers will become unassigned.`)) return;

        setSaving(true);
        try {
            const { error } = await db.deleteDutyTeam(team.id);
            if (error) throw error;
            await loadData();
        } catch (error) {
            window.alert(`Failed to delete team: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleMoveTeamMember = async (schedule, teamId) => {
        if (!canManageSchedule || !teamManagerEvent || hasCheckedOut(schedule) || getEventStatus(teamManagerEvent) === 'concluded') return;
        const targetTeam = teamManagerEvent.teams.find((team) => team.id === teamId) || null;
        const previousSchedules = schedules;
        const optimisticUpdates = {
            team_id: targetTeam?.id || null,
            team_station: targetTeam?.name?.trim() || null
        };

        setUpdatingTeamMemberId(schedule.id);
        setSchedules((current) => current.map((item) => item.id === schedule.id ? { ...item, ...optimisticUpdates } : item));
        try {
            const { error } = await db.updateSchedule(schedule.id, optimisticUpdates);
            if (error) throw error;
        } catch (error) {
            setSchedules(previousSchedules);
            window.alert(`Failed to move volunteer: ${error.message}`);
        } finally {
            setUpdatingTeamMemberId(null);
        }
    };

    const handleRoleSave = async (schedule) => {
        if (!canManageSchedule || !teamManagerEvent || getEventStatus(teamManagerEvent) === 'concluded') return;
        const nextRole = teamRoleDrafts[schedule.id]?.trim() || null;
        if (nextRole === (schedule.assignment_role?.trim() || null) || hasCheckedOut(schedule)) return;

        setSaving(true);
        try {
            const { error } = await db.updateSchedule(schedule.id, { assignment_role: nextRole });
            if (error) throw error;
            await loadData();
        } catch (error) {
            window.alert(`Failed to update role: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const renderTeamManagerMember = (schedule, event) => {
        const locked = hasCheckedOut(schedule);
        const roleValue = teamRoleDrafts[schedule.id] ?? schedule.assignment_role ?? '';
        const canManage = canManageSchedule && getEventStatus(event) !== 'concluded';
        const isUpdatingTeam = updatingTeamMemberId === schedule.id;

        return (
            <article
                key={schedule.id}
                className={`schedule-team-member-card ${locked ? 'is-locked' : ''}`}
            >
                <div className="schedule-team-member-avatar" aria-hidden="true">{schedule.personnel?.name?.charAt(0).toLocaleUpperCase() || '?'}</div>
                <div className="schedule-team-member-identity">
                    <strong>{schedule.personnel?.name || 'Unknown volunteer'}</strong>
                    <span>{schedule.start_time?.slice(0, 5)} – {schedule.end_time?.slice(0, 5)}{locked ? ' · Checked out' : ''}</span>
                    {!canManage && <small>{roleValue || 'Role not assigned'}</small>}
                </div>
                {canManage && (
                    <div className="schedule-team-member-controls">
                        <label>
                            <span>Team</span>
                            <select className="form-select" value={schedule.team_id || ''} onChange={(changeEvent) => handleMoveTeamMember(schedule, changeEvent.target.value)} disabled={locked || isUpdatingTeam}>
                                <option value="">Unassigned</option>
                                {event.teams.map((team) => <option key={team.id} value={team.id}>{getTeamDisplayName(team, event)}</option>)}
                            </select>
                        </label>
                        <label>
                            <span>Role</span>
                            <input
                                className="form-input"
                                value={roleValue}
                                onChange={(changeEvent) => setTeamRoleDrafts((current) => ({ ...current, [schedule.id]: changeEvent.target.value }))}
                                onBlur={() => handleRoleSave(schedule)}
                                onKeyDown={(keyEvent) => { if (keyEvent.key === 'Enter') keyEvent.currentTarget.blur(); }}
                                disabled={locked || saving}
                            />
                        </label>
                    </div>
                )}
            </article>
        );
    };

    const renderAssignment = (schedule, event, isOwn = false) => {
        const checkedOut = hasCheckedOut(schedule);
        const locked = getEventStatus(event) === 'concluded' || checkedOut;
        const canEdit = !locked && (canManageSchedule || schedule.personnel_id === profile?.id);
        const assignedTeam = event.teams.find((team) => team.id === schedule.team_id);

        return (
            <article key={schedule.id} className={`schedule-assignment-card ${isOwn ? 'is-own' : ''}`}>
                <div className="schedule-assignment-avatar" aria-hidden="true">
                    {schedule.personnel?.name?.charAt(0).toLocaleUpperCase() || '?'}
                </div>
                <div className="schedule-assignment-main">
                    <div className="schedule-assignment-heading">
                        <strong>{schedule.personnel?.name || 'Unassigned'}</strong>
                        {isOwn && <span className="badge badge-info">You</span>}
                        {checkedOut && <span className="badge badge-success">Checked out</span>}
                    </div>
                    <div className="schedule-assignment-meta">
                        <span><Clock size={14} /> {schedule.start_time?.slice(0, 5)} – {schedule.end_time?.slice(0, 5)}</span>
                        <span><Users size={14} /> {assignedTeam ? getTeamDisplayName(assignedTeam, event) : schedule.team_station || 'Team not assigned'}</span>
                        {schedule.assignment_role && <span><UserRoundCog size={14} /> {schedule.assignment_role}</span>}
                    </div>
                    {schedule.notes && (canManageSchedule || schedule.personnel_id === profile?.id) && <p className="schedule-assignment-note">{schedule.notes}</p>}
                </div>
                {canEdit ? (
                    <button type="button" className="btn btn-sm btn-secondary schedule-assignment-edit" onClick={() => openEditAssignment(schedule, event)} aria-label={`Edit ${schedule.personnel?.name || 'assignment'}`}>
                        <Pencil size={15} /> Edit
                    </button>
                ) : (
                    locked && <LockKeyhole className="schedule-assignment-lock" size={16} aria-label="Editing locked" />
                )}
            </article>
        );
    };

    const renderEventDetails = (event) => {
        const status = getEventStatus(event);
        const roster = organizeEventAssignments(event.schedules, profile?.id);
        const teamRoster = event.teams.map((team) => ({
            id: team.id,
            name: getTeamDisplayName(team, event),
            members: event.schedules
                .filter((schedule) => schedule.personnel_id && schedule.team_id === team.id)
                .map((schedule) => ({
                    name: schedule.personnel?.name || 'Unknown volunteer',
                    role: schedule.assignment_role || 'Role not assigned'
                }))
        }));
        const unmatchedAssignments = event.schedules.filter((schedule) => (
            schedule.personnel_id && !event.teams.some((team) => team.id === schedule.team_id)
        ));
        const unassignedAssignments = unmatchedAssignments.filter((schedule) => !schedule.team_station);
        const legacyTeamNames = [...new Set(unmatchedAssignments.map((schedule) => schedule.team_station).filter(Boolean))];
        legacyTeamNames.forEach((name) => {
            teamRoster.push({
                id: `legacy-${name}`,
                name,
                members: unmatchedAssignments
                    .filter((schedule) => (schedule.team_station || 'Unassigned') === name)
                    .map((schedule) => ({
                        name: schedule.personnel?.name || 'Unknown volunteer',
                        role: schedule.assignment_role || 'Role not assigned'
                    }))
            });
        });
        const isRegistered = Boolean(roster.ownAssignment);

        return (
            <div className="schedule-detail">
                <section className="schedule-detail-hero">
                    <div>
                        <span className={`schedule-status status-${status}`}>{statusLabels[status]}</span>
                        <p><CalendarIcon size={17} /> {format(toLocalDate(event.date), 'EEEE, MMMM d, yyyy')}</p>
                        <p><Clock size={17} /> {getEventTimeRange(event)}</p>
                    </div>
                    <div className="schedule-detail-count"><strong>{roster.registeredCount}</strong><span>registered</span></div>
                </section>

                {status === 'concluded' && (
                    <div className="schedule-lock-notice">
                        <LockKeyhole size={18} />
                        <div><strong>This event has concluded.</strong><span>Its details and duty assignments are now read-only.</span></div>
                    </div>
                )}

                <div className="schedule-detail-layout">
                    <div className="schedule-detail-info">
                        <section className="schedule-info-section schedule-description-section">
                            <h3><FileText size={17} /> Duty description</h3>
                            <p>{event.dutyDescription || 'No additional instructions were provided for this duty.'}</p>
                        </section>

                        <section className="schedule-info-section">
                            <h3>Event information</h3>
                            <div className="schedule-info-list">
                                <div className="schedule-info-item">
                                    <MapPin size={19} />
                                    <div>
                                        <span>Location</span>
                                        <strong>{event.preciseLocation || 'Not provided'}</strong>
                                        {event.preciseLocation && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.preciseLocation)}`} target="_blank" rel="noreferrer">Open in Maps <Navigation size={13} /></a>}
                                    </div>
                                </div>
                                <div className="schedule-info-item"><Navigation size={19} /><div><span>Meetup place</span><strong>{event.meetupPlace || 'Same as event location'}</strong></div></div>
                                <div className="schedule-info-item"><UserRoundCog size={19} /><div><span>Organization</span><strong>{event.organization || 'Not provided'}</strong></div></div>
                                <div className="schedule-info-item"><User size={19} /><div><span>Coordinator</span><strong>{event.coordinator || 'Not provided'}</strong></div></div>
                                <div className="schedule-info-item"><Phone size={19} /><div><span>Contact person</span><strong>{event.contactPerson || 'Not provided'}</strong>{event.contactNumber && <a href={`tel:${event.contactNumber}`}>{event.contactNumber}</a>}</div></div>
                            </div>
                        </section>

                        <section className="schedule-info-section">
                            <h3><Bell size={17} /> Duty reminders</h3>
                            <div className="schedule-reminder-list">
                                {event.reminderOffsets?.length ? event.reminderOffsets.map((minutes) => <span key={minutes}><CheckCircle2 size={15} /> {getReminderLabel(minutes)}</span>) : <p className="text-muted text-sm">No automatic reminders are scheduled.</p>}
                            </div>
                        </section>

                        <section className="schedule-info-section">
                            <div className="schedule-team-section-heading">
                                <h3><Users size={17} /> Teams</h3>
                                <button type="button" className="btn btn-sm btn-secondary" onClick={() => openTeamManager(event)}><Users size={15} /> {canManageSchedule && status !== 'concluded' ? 'Manage' : 'View'}</button>
                            </div>
                            <div className="schedule-unassigned-summary">
                                <div><span>Unassigned</span><strong>{unassignedAssignments.length}</strong></div>
                                <p>{unassignedAssignments.length ? unassignedAssignments.map((schedule) => getLastName(schedule.personnel?.name)).join(', ') : 'No unassigned volunteers'}</p>
                            </div>
                            <div className="schedule-team-summary-divider"><span>Assigned teams</span></div>
                            {teamRoster.length ? (
                                <div className="schedule-team-list">
                                    {teamRoster.map((team) => (
                                        <div key={team.id}>
                                            <strong>{team.name}</strong>
                                            <span>{team.members.length ? team.members.map((member) => getLastName(member.name)).join(', ') : 'No volunteers assigned'}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-muted text-sm">No teams have been prepared yet.</p>}
                        </section>
                    </div>

                    <section className="schedule-roster-panel">
                        <div className="schedule-roster-header">
                            <div><span>Duty roster</span><strong>{roster.registeredCount} volunteer{roster.registeredCount === 1 ? '' : 's'}</strong></div>
                            {canManageSchedule && status !== 'concluded' && <button type="button" className="btn btn-sm btn-secondary" onClick={() => openAddAssignment(event)}><UserPlus size={15} /> Add</button>}
                        </div>

                        <div className="schedule-roster-scroll">
                            {roster.ownAssignment && (
                                <div className="schedule-own-assignment">
                                    <span className="schedule-roster-period"><User size={14} /> Your duty</span>
                                    {renderAssignment(roster.ownAssignment, event, true)}
                                </div>
                            )}

                            {roster.groups.map((group) => (
                                <div key={group.period} className="schedule-roster-group">
                                    <span className="schedule-roster-period">
                                        {group.period === 'AM' ? <Sunrise size={14} /> : <Sunset size={14} />}
                                        {group.period === 'Unscheduled' ? 'Time not set' : `${group.period} shift`}
                                    </span>
                                    {group.assignments.map((schedule) => renderAssignment(schedule, event))}
                                </div>
                            ))}

                            {!roster.registeredCount && <div className="schedule-roster-empty"><Users size={34} /><strong>No volunteers yet</strong><span>Be the first to register for this duty.</span></div>}
                        </div>

                        <div className="schedule-detail-actions">
                            {isAdmin && <button type="button" className="btn btn-danger" onClick={() => handleDeleteEvent(event)} disabled={saving}><Trash2 size={17} /> Delete event</button>}
                            {canManageSchedule && status !== 'concluded' && <button type="button" className="btn btn-secondary" onClick={() => openEditEvent(event)}><Pencil size={17} /> Edit event</button>}
                            {!isRegistered && status !== 'concluded' && <button type="button" className="btn btn-primary" onClick={() => openRegister(event)}><UserPlus size={17} /> Register</button>}
                        </div>
                    </section>
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="flex items-center justify-center" style={{ height: '50vh' }}><div className="loading" style={{ width: 40, height: 40 }} /></div>;
    }

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const selectedTeamPersonnelIds = eventForm.teams.flatMap((team) => (
        team.members.map((member) => member.personnel_id).filter(Boolean)
    ));
    const teamManagerMembers = teamManagerEvent?.schedules.filter((schedule) => schedule.personnel_id) || [];
    const unassignedTeamMembers = teamManagerMembers.filter((schedule) => !schedule.team_id && !schedule.team_station);

    return (
        <div className="schedule-page">
            <header className="schedule-page-header">
                <div>
                    <span className="schedule-eyebrow"><CalendarIcon size={15} /> Duty calendar</span>
                    <h1 className="page-title">Schedule</h1>
                    <p className="page-subtitle">{canManageSchedule ? 'Plan deployments and keep every duty detail in one place.' : 'Find upcoming duties, view full details, and manage your own time.'}</p>
                </div>
                <div className="schedule-header-actions">
                    {profile && <div className="schedule-my-duty-count"><strong>{myUpcomingCount}</strong><span>Your upcoming duties</span></div>}
                    {canManageSchedule && <button type="button" className="btn btn-primary" onClick={() => openCreateEvent()}><Plus size={18} /> Create event</button>}
                </div>
            </header>

            <section className="schedule-toolbar" aria-label="Calendar controls">
                <div className="calendar-nav">
                    <button type="button" onClick={handlePrev} aria-label="Previous period"><ChevronLeft size={20} /></button>
                    <button type="button" onClick={handleToday} className="btn btn-secondary btn-sm">Today</button>
                    <button type="button" onClick={handleNext} aria-label="Next period"><ChevronRight size={20} /></button>
                </div>
                <h2 className="calendar-title">{view === 'month' ? format(currentDate, 'MMMM yyyy') : `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`}</h2>
                <div className="schedule-view-toggle" role="group" aria-label="Calendar view">
                    <button type="button" className={view === 'month' ? 'is-active' : ''} onClick={() => setView('month')}>Month</button>
                    <button type="button" className={view === 'week' ? 'is-active' : ''} onClick={() => setView('week')}>Week</button>
                </div>
            </section>

            <div className={`calendar schedule-calendar ${view}-view`}>
                <div className="calendar-grid">
                    {weekDays.map((day) => <div key={day} className="calendar-weekday">{day}</div>)}

                    {calendarDays.map((day) => {
                        const dayEvents = getEventsForDay(day);
                        const isToday = isSameDay(day, new Date());
                        const isSelected = isSameDay(day, selectedDate);

                        return (
                            <div key={day.toISOString()} className={`calendar-day ${dayEvents.length ? 'has-events' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${!isSameMonth(day, currentDate) ? 'other-month' : ''}`} onClick={() => handleDayClick(day)}>
                                <div className="calendar-day-number">
                                    <span className="calendar-day-week-label">{format(day, 'EEE, MMM')}</span>
                                    <span>{format(day, 'd')}</span>
                                    {dayEvents.length > 0 && <span className="calendar-day-event-total">{dayEvents.length}</span>}
                                </div>
                                <div className="calendar-day-events">
                                    {dayEvents.slice(0, view === 'week' ? 10 : 3).map((event) => {
                                        const registered = event.schedules.filter((schedule) => schedule.personnel_id).length;
                                        const status = getEventStatus(event);
                                        const isMine = event.schedules.some((schedule) => schedule.personnel_id === profile?.id);

                                        return (
                                            <button type="button" key={event.id} className={`calendar-event status-${status} ${isMine ? 'is-mine' : ''}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); setViewingEventId(event.id); }} aria-label={`${event.title}, ${registered} registered, ${statusLabels[status]}`}>
                                                <span className="calendar-event-content"><span className="calendar-event-title">{event.title}</span><span className="calendar-event-count">{registered}</span></span>
                                                {view === 'week' && event.preciseLocation && <span className="calendar-event-location"><MapPin size={12} /> {event.preciseLocation}</span>}
                                            </button>
                                        );
                                    })}
                                    {dayEvents.length > (view === 'week' ? 10 : 3) && <span className="calendar-more-events">+{dayEvents.length - (view === 'week' ? 10 : 3)} more</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <section className="schedule-mobile-agenda">
                <div className="schedule-mobile-agenda-header">
                    <div><span>Selected day</span><strong>{format(selectedDate, 'EEEE, MMMM d')}</strong></div>
                    {canManageSchedule && <button type="button" className="btn btn-sm btn-primary" onClick={() => openCreateEvent(selectedDate)}><Plus size={16} /> Add</button>}
                </div>
                {selectedDayEvents.length ? selectedDayEvents.map((event) => (
                    <button type="button" key={event.id} className="schedule-agenda-event" onClick={() => setViewingEventId(event.id)}>
                        <span className={`schedule-agenda-accent status-${getEventStatus(event)}`} />
                        <span><strong>{event.title}</strong><small>{getEventTimeRange(event)}{event.preciseLocation ? ` • ${event.preciseLocation}` : ''}</small></span>
                        <ChevronRight size={18} />
                    </button>
                )) : <div className="schedule-agenda-empty"><CalendarIcon size={26} /><span>No duties scheduled for this day.</span></div>}
            </section>

            <Modal isOpen={Boolean(viewingEvent)} onClose={() => setViewingEventId(null)} title={viewingEvent?.title || 'Event details'} size="xl" className="schedule-detail-modal">
                {viewingEvent && renderEventDetails(viewingEvent)}
            </Modal>

            <Modal isOpen={isRegisterModalOpen} onClose={() => { setIsRegisterModalOpen(false); setRegisteringEventId(null); }} title={`Register for ${registeringEvent?.title || 'event'}`} size="lg" className="schedule-form-modal">
                <form onSubmit={handleRegisterSubmit}>
                    <div className="schedule-form-context"><CalendarIcon size={18} /><div><strong>{registeringEvent && format(toLocalDate(registeringEvent.date), 'EEEE, MMMM d, yyyy')}</strong><span>You can update your time and personal notes later.</span></div></div>
                    <div className="form-group"><label className="form-label">Volunteer</label><input className="form-input" value={profile?.name || ''} disabled /></div>
                    <div className="schedule-form-grid two-columns">
                        <div className="form-group"><label className="form-label">Your start time *</label><input type="time" className="form-input" value={registerForm.start_time} onChange={(event) => setRegisterForm({ ...registerForm, start_time: event.target.value })} required /></div>
                        <div className="form-group"><label className="form-label">Your end time *</label><input type="time" className="form-input" value={registerForm.end_time} onChange={(event) => setRegisterForm({ ...registerForm, end_time: event.target.value })} required /></div>
                    </div>
                    <div className="form-group"><label className="form-label">Personal notes</label><textarea className="form-input" rows={3} value={registerForm.notes} onChange={(event) => setRegisterForm({ ...registerForm, notes: event.target.value })} placeholder="Anything you want to remember for this duty" /></div>
                    <div className="modal-footer schedule-form-actions"><button type="button" className="btn btn-secondary" onClick={() => setIsRegisterModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><UserPlus size={17} /> {saving ? 'Registering…' : 'Register'}</button></div>
                </form>
            </Modal>

            <Modal isOpen={isEventModalOpen} onClose={closeEventModal} title={editingEvent ? 'Edit event details' : 'Create a deployment duty'} size="xl" className="schedule-form-modal schedule-wizard-modal">
                <form onSubmit={handleEventSubmit} className="schedule-wizard">
                    <nav className="schedule-wizard-steps" aria-label="Duty creation progress">
                        {eventSteps.map((step, index) => (
                            <button
                                type="button"
                                key={step.id}
                                className={`schedule-wizard-step ${index === eventStep ? 'is-active' : ''} ${index < eventStep ? 'is-complete' : ''}`}
                                onClick={() => {
                                    if (index <= eventStep) {
                                        setEventStep(index);
                                    }
                                }}
                                disabled={index > eventStep}
                                aria-current={index === eventStep ? 'step' : undefined}
                            >
                                <span>{index < eventStep ? <CheckCircle2 size={16} /> : index + 1}</span>
                                <small>{step.label}</small>
                            </button>
                        ))}
                    </nav>

                    <div className="schedule-wizard-heading">
                        <span>Step {eventStep + 1} of {eventSteps.length}</span>
                        <h2>{activeEventStep.label}</h2>
                    </div>

                    {activeEventStep.id === 'schedule' && (
                        <section className="schedule-form-section schedule-wizard-panel">
                            <div className="schedule-form-section-title"><CalendarIcon size={19} /><div><strong>When will the duty happen?</strong><span>Set the shared schedule for this deployment.</span></div></div>
                            <div className="form-group"><label className="form-label">Duty date</label><input type="date" className="form-input" value={eventForm.duty_date} onChange={(event) => setEventForm({ ...eventForm, duty_date: event.target.value })} /></div>
                            <div className="schedule-form-grid two-columns">
                                <div className="form-group"><label className="form-label">Start time</label><input type="time" className="form-input" value={eventForm.start_time} onChange={(event) => setEventForm({ ...eventForm, start_time: event.target.value })} /></div>
                                <div className="form-group"><label className="form-label">End time</label><input type="time" className="form-input" value={eventForm.end_time} onChange={(event) => setEventForm({ ...eventForm, end_time: event.target.value })} /></div>
                            </div>
                            <p className="schedule-builder-note">For overnight duties, choose an end time earlier than the start time; it will be treated as the next day.</p>
                        </section>
                    )}

                    {activeEventStep.id === 'details' && (
                        <section className="schedule-form-section schedule-wizard-panel">
                            <div className="schedule-form-section-title"><MapPin size={19} /><div><strong>Duty details</strong><span>Tell volunteers what the duty is and where to go.</span></div></div>
                            <div className="form-group"><label className="form-label">Duty name</label><input className="form-input" value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Duty description</label><textarea className="form-input" rows={5} value={eventForm.duty_description} onChange={(event) => setEventForm({ ...eventForm, duty_description: event.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={eventForm.precise_location} onChange={(event) => setEventForm({ ...eventForm, precise_location: event.target.value })} /></div>
                            <div className="form-group"><label className="form-label">Meetup place</label><input className="form-input" value={eventForm.meetup_place} onChange={(event) => setEventForm({ ...eventForm, meetup_place: event.target.value })} /></div>
                        </section>
                    )}

                    {activeEventStep.id === 'contact' && (
                        <section className="schedule-form-section schedule-wizard-panel">
                            <div className="schedule-form-section-title"><UserRoundCog size={19} /><div><strong>Organization and contacts</strong><span>Add the people volunteers can coordinate with.</span></div></div>
                            <div className="schedule-form-grid two-columns">
                                <div className="form-group"><label className="form-label">Organization</label><input className="form-input" value={eventForm.organization} onChange={(event) => setEventForm({ ...eventForm, organization: event.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Coordinator</label><input className="form-input" value={eventForm.coordinator} onChange={(event) => setEventForm({ ...eventForm, coordinator: event.target.value })} /></div>
                            </div>
                            <div className="schedule-form-grid two-columns">
                                <div className="form-group"><label className="form-label">Contact person</label><input className="form-input" value={eventForm.contact_person} onChange={(event) => setEventForm({ ...eventForm, contact_person: event.target.value })} /></div>
                                <div className="form-group"><label className="form-label">Contact number</label><input type="tel" className="form-input" value={eventForm.contact_number} onChange={(event) => setEventForm({ ...eventForm, contact_number: event.target.value })} /></div>
                            </div>
                        </section>
                    )}

                    {activeEventStep.id === 'reminders' && (
                        <section className="schedule-form-section schedule-wizard-panel">
                            <div className="schedule-form-section-title"><Bell size={19} /><div><strong>Duty reminders</strong><span>Choose when registered volunteers should be notified.</span></div></div>
                            <div className="schedule-reminder-builder">
                                <header><div><strong>Notification times</strong><span>You can add zero to five reminders.</span></div><span className="schedule-reminder-count">{eventForm.reminder_hours.length} / 5</span></header>
                                {eventForm.reminder_hours.map((hours, index) => (
                                    <div className="schedule-reminder-row" key={`${index}-${eventForm.reminder_hours.length}`}>
                                        <Bell size={18} />
                                        <label>
                                            <span className="sr-only">Reminder {index + 1} hours before duty</span>
                                            <input type="number" className="form-input" step="any" value={hours} onChange={(event) => updateReminder(index, event.target.value)} />
                                            <small>hours before duty</small>
                                        </label>
                                        <button type="button" onClick={() => removeReminder(index)} aria-label={`Remove reminder ${index + 1}`}><Trash2 size={17} /></button>
                                    </div>
                                ))}
                                {!eventForm.reminder_hours.length && <div className="schedule-empty-builder"><Bell size={25} /><strong>No reminders</strong><span>This duty will not send an automatic reminder.</span></div>}
                                <button type="button" className="btn btn-secondary" onClick={addReminder} disabled={eventForm.reminder_hours.length >= 5}><Plus size={16} /> Add reminder</button>
                                <p className="schedule-builder-note">Volunteers must enable notifications on their device to receive these alerts.</p>
                            </div>
                        </section>
                    )}

                    {activeEventStep.id === 'assignments' && (
                        <section className="schedule-form-section schedule-wizard-panel schedule-assignment-builder-panel">
                            <div className="schedule-form-section-title schedule-assignment-builder-title"><Users size={19} /><div><strong>Team assignments</strong><span>Create as many teams as needed, then give every member a role.</span></div></div>
                            <p className="schedule-builder-note">Prepare empty teams now and assign volunteers later, or optionally add members before creating the duty.</p>
                            <div className="form-group schedule-team-count-field"><label className="form-label">Number of teams</label><input type="number" className="form-input" min="0" step="1" value={eventForm.teams.length} onChange={(event) => setTeamCount(event.target.value)} /></div>
                            <div className="schedule-team-builder">
                                {eventForm.teams.map((team, teamIndex) => (
                                    <article className="schedule-team-card" key={team.id}>
                                        <header>
                                            <div><span>Team {teamIndex + 1}</span><strong>{team.name.trim() || 'New team'}</strong></div>
                                            <button type="button" className="btn btn-sm btn-danger" onClick={() => removeTeam(team.id)} aria-label={`Remove team ${teamIndex + 1}`}><Trash2 size={15} /> Remove team</button>
                                        </header>
                                        <div className="form-group"><label className="form-label">Team name</label><input className="form-input" value={team.name} onChange={(event) => updateTeam(team.id, { name: event.target.value })} /></div>
                                        <div className="schedule-team-members">
                                            <div className="schedule-team-members-heading"><strong>Members</strong><span>{team.members.length} member{team.members.length === 1 ? '' : 's'}</span></div>
                                            {team.members.map((member, memberIndex) => (
                                                <div className="schedule-team-member-row" key={member.id}>
                                                    <div className="form-group">
                                                        <label className="form-label">Member {memberIndex + 1}</label>
                                                        <select className="form-select" value={member.personnel_id} onChange={(event) => updateTeamMember(team.id, member.id, { personnel_id: event.target.value })}>
                                                            <option value="">Select personnel</option>
                                                            {personnel.map((person) => <option key={person.id} value={person.id} disabled={selectedTeamPersonnelIds.includes(person.id) && member.personnel_id !== person.id}>{person.name} ({person.role})</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="form-group"><label className="form-label">Role</label><input className="form-input" value={member.assignment_role} onChange={(event) => updateTeamMember(team.id, member.id, { assignment_role: event.target.value })} /></div>
                                                    <button type="button" className="schedule-member-remove" onClick={() => removeTeamMember(team.id, member.id)} aria-label={`Remove member ${memberIndex + 1}`}><Trash2 size={17} /></button>
                                                </div>
                                            ))}
                                            {!team.members.length && <div className="schedule-empty-builder"><UserPlus size={22} /><span>This team has no members yet.</span></div>}
                                            <button type="button" className="btn btn-sm btn-secondary schedule-add-member" onClick={() => addTeamMember(team.id)}><UserPlus size={15} /> Add member</button>
                                        </div>
                                    </article>
                                ))}
                                {!eventForm.teams.length && <div className="schedule-empty-builder"><Users size={30} /><strong>No teams added</strong><span>You can leave the duty open or start building its roster now.</span></div>}
                                <button type="button" className="btn btn-secondary schedule-add-team" onClick={addTeam}><Plus size={17} /> Add team</button>
                            </div>
                        </section>
                    )}

                    <div className="modal-footer schedule-form-actions split-actions schedule-wizard-actions">
                        <div>{editingEvent && <button type="button" className="btn btn-danger" onClick={() => handleDeleteEvent(editingEvent)} disabled={saving}><Trash2 size={17} /> Delete event</button>}</div>
                        <div className="schedule-wizard-navigation">
                            <button type="button" className="btn btn-secondary" onClick={closeEventModal} disabled={saving}>Cancel</button>
                            {eventStep > 0 && <button type="button" className="btn btn-secondary" onClick={() => setEventStep((current) => current - 1)} disabled={saving}><ChevronLeft size={17} /> Back</button>}
                            {eventStep < eventSteps.length - 1
                                ? <button key="wizard-next" type="button" className="btn btn-primary" onClick={handleEventNext} disabled={saving}>Next <ChevronRight size={17} /></button>
                                : <button key="wizard-submit" type="submit" className="btn btn-primary" disabled={saving}>{editingEvent ? <Pencil size={17} /> : <Plus size={17} />}{saving ? 'Saving…' : editingEvent ? 'Save changes' : 'Create duty'}</button>}
                        </div>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={Boolean(teamManagerEvent)} onClose={closeTeamManager} title={`${canManageSchedule && teamManagerEvent && getEventStatus(teamManagerEvent) !== 'concluded' ? 'Manage teams' : 'Teams'}${teamManagerEvent?.title ? ` — ${teamManagerEvent.title}` : ''}`} size="xl" className="schedule-team-manager-modal">
                {teamManagerEvent && (
                    <div className="schedule-team-manager">
                        <header className="schedule-team-manager-header">
                            <div>
                                <span>{format(toLocalDate(teamManagerEvent.date), 'EEEE, MMMM d, yyyy')}</span>
                                <strong>{teamManagerEvent.teams.length} team{teamManagerEvent.teams.length === 1 ? '' : 's'} · {teamManagerMembers.length} registered</strong>
                            </div>
                            {canManageSchedule && getEventStatus(teamManagerEvent) !== 'concluded' && <button type="button" className="btn btn-primary" onClick={handleAddManagedTeam} disabled={saving}><Plus size={17} /> Add team</button>}
                        </header>

                        <div className="schedule-team-manager-tip"><Users size={17} /><span>{canManageSchedule && getEventStatus(teamManagerEvent) !== 'concluded' ? 'Use the Team menu to move volunteers and edit their role beside it.' : 'Full team assignments, duty times, and roles are shown below.'}</span></div>

                        <section className="schedule-unassigned-panel">
                            <header>
                                <div><span>No team assigned</span><strong>Unassigned</strong></div>
                                <span>{unassignedTeamMembers.length} volunteer{unassignedTeamMembers.length === 1 ? '' : 's'}</span>
                            </header>
                            <div className="schedule-unassigned-members">
                                {unassignedTeamMembers.map((schedule) => renderTeamManagerMember(schedule, teamManagerEvent))}
                                {!unassignedTeamMembers.length && <div className="schedule-team-column-empty"><CheckCircle2 size={23} /><span>Everyone has a team.</span></div>}
                            </div>
                        </section>

                        <div className="schedule-team-board-heading">
                            <div><span>Assigned groups</span><strong>Teams</strong></div>
                            <span>{teamManagerEvent.teams.length} total</span>
                        </div>

                        <div className="schedule-team-board">

                            {teamManagerEvent.teams.map((team) => {
                                const members = teamManagerMembers.filter((schedule) => (
                                    schedule.team_id === team.id
                                    || (!schedule.team_id && schedule.team_station && schedule.team_station === team.name)
                                ));
                                return (
                                    <section key={team.id} className="schedule-team-column">
                                        <header>
                                            <div>
                                                <span>Team</span>
                                                {canManageSchedule && getEventStatus(teamManagerEvent) !== 'concluded'
                                                    ? <input className="schedule-team-name-input" defaultValue={getTeamDisplayName(team, teamManagerEvent)} onBlur={(blurEvent) => handleRenameTeam(team, blurEvent.target.value)} aria-label={`Name for ${getTeamDisplayName(team, teamManagerEvent)}`} disabled={saving} />
                                                    : <strong>{getTeamDisplayName(team, teamManagerEvent)}</strong>}
                                            </div>
                                            <div className="schedule-team-column-actions">
                                                <span>{members.length}</span>
                                                {canManageSchedule && getEventStatus(teamManagerEvent) !== 'concluded' && <button type="button" onClick={() => handleDeleteManagedTeam(team)} disabled={saving} aria-label={`Delete ${getTeamDisplayName(team, teamManagerEvent)}`}><Trash2 size={15} /></button>}
                                            </div>
                                        </header>
                                        <div className="schedule-team-column-members">
                                            {members.map((schedule) => renderTeamManagerMember(schedule, teamManagerEvent))}
                                            {!members.length && <div className="schedule-team-column-empty"><Users size={23} /><span>Assign volunteers here.</span></div>}
                                        </div>
                                    </section>
                                );
                            })}
                            {!teamManagerEvent.teams.length && <div className="schedule-team-board-empty"><Users size={26} /><strong>No teams prepared</strong><span>Admins can add teams using the button above.</span></div>}
                        </div>

                        <div className="modal-footer schedule-form-actions"><button type="button" className="btn btn-secondary" onClick={closeTeamManager} disabled={saving}>Done</button></div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={isAssignmentModalOpen} onClose={() => { setIsAssignmentModalOpen(false); setEditingSchedule(null); setAssignmentEventId(null); }} title={editingSchedule ? 'Edit duty assignment' : 'Add volunteer assignment'} size="md" className="schedule-form-modal">
                <form onSubmit={handleAssignmentSubmit}>
                    <div className="schedule-form-context"><Clock size={18} /><div><strong>{assignmentEvent?.title}</strong><span>{assignmentEvent && format(toLocalDate(assignmentEvent.date), 'EEEE, MMMM d, yyyy')}</span></div></div>
                    {editingSchedule?.personnel_id === profile?.id && <div className="schedule-permission-note"><LockKeyhole size={17} /><span>You are editing your own duty. Only your time and personal notes can be changed.</span></div>}
                    {(!editingSchedule || editingSchedule.personnel_id !== profile?.id) && canManageSchedule && (
                        <div className="schedule-form-grid two-columns schedule-assignment-admin-fields">
                            <div className="form-group"><label className="form-label">Personnel *</label><select className="form-select" value={assignmentForm.personnel_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, personnel_id: event.target.value })} required><option value="">Select personnel</option>{personnel.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.role})</option>)}</select></div>
                            <div className="form-group"><label className="form-label">Team</label><select className="form-select" value={assignmentForm.team_id} onChange={(event) => setAssignmentForm({ ...assignmentForm, team_id: event.target.value })}><option value="">Unassigned</option>{assignmentEvent?.teams.map((team) => <option key={team.id} value={team.id}>{getTeamDisplayName(team, assignmentEvent)}</option>)}</select></div>
                            <div className="form-group schedule-assignment-role-field"><label className="form-label">Role</label><input className="form-input" value={assignmentForm.assignment_role} onChange={(event) => setAssignmentForm({ ...assignmentForm, assignment_role: event.target.value })} /></div>
                        </div>
                    )}
                    <div className="schedule-form-grid two-columns">
                        <div className="form-group"><label className="form-label">Start time *</label><input type="time" className="form-input" value={assignmentForm.start_time} onChange={(event) => setAssignmentForm({ ...assignmentForm, start_time: event.target.value })} required /></div>
                        <div className="form-group"><label className="form-label">End time *</label><input type="time" className="form-input" value={assignmentForm.end_time} onChange={(event) => setAssignmentForm({ ...assignmentForm, end_time: event.target.value })} required /></div>
                    </div>
                    <div className="form-group"><label className="form-label">{editingSchedule?.personnel_id === profile?.id ? 'Your personal notes' : 'Assignment notes'}</label><textarea className="form-input" rows={3} value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} placeholder="Optional notes for this duty" /></div>
                    <div className="modal-footer schedule-form-actions split-actions">
                        {editingSchedule ? <button type="button" className="btn btn-danger" onClick={handleDeleteAssignment} disabled={saving}><Trash2 size={17} /> {editingSchedule.personnel_id === profile?.id ? 'Leave event' : 'Remove'}</button> : <span />}
                        <div><button type="button" className="btn btn-secondary" onClick={() => setIsAssignmentModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><CheckCircle2 size={17} /> {saving ? 'Saving…' : 'Save assignment'}</button></div>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
