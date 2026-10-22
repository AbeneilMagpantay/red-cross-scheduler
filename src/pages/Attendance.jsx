import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/supabase';
import {
    Clock,
    LogIn,
    LogOut as LogOutIcon,
    Check,
    X,
    Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { getCheckInStatus } from '../lib/schedule';
import { getAttendanceBadge, getRoleLabel } from '../lib/status';
import { formatClockTime, formatDutyDate, formatTimeRange } from '../lib/format';
import { EmptyState, PageLoader, StatCard, StatusBadge } from '../components/ui';
import InlineAlert from '../components/InlineAlert';

const ATTENDANCE_STATUSES = [
    { value: 'present', label: 'Present' },
    { value: 'late', label: 'Late' },
    { value: 'absent', label: 'Absent' },
    { value: 'excused', label: 'Excused' }
];

export default function Attendance() {
    const { profile, isAdmin } = useAuth();
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [schedules, setSchedules] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState('');
    const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');

    const loadData = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        try {
            const { data: scheduleData, error: schedulesError } = await db.getSchedules(selectedDate, selectedDate);
            const { data: attendanceData, error: attendanceError } = await db.getAttendance(selectedDate);
            if (schedulesError || attendanceError) throw schedulesError || attendanceError;

            setSchedules(scheduleData || []);
            setAttendance(attendanceData || []);
            setError('');
        } catch (error) {
            console.error('Error loading data:', error);
            setError(error.message || 'Attendance could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const getAttendanceForSchedule = (scheduleId) => {
        return attendance.find(a => a.schedule_id === scheduleId);
    };

    // Runs one attendance write for a row, keeping its buttons disabled until done.
    const saveRow = async (scheduleId, write, failureMessage) => {
        if (savingId) return;
        setSavingId(scheduleId);
        setError('');
        try {
            const { error: saveError } = await write();
            if (saveError) throw saveError;
            await loadData({ quiet: true });
        } catch (saveError) {
            console.error(failureMessage, saveError);
            if (saveError.code === '23505') {
                setError('Attendance was already recorded for this duty.');
                await loadData({ quiet: true });
            } else {
                setError(saveError.message || failureMessage);
            }
        } finally {
            setSavingId(null);
        }
    };

    const handleCheckIn = (schedule) => saveRow(schedule.id, () => db.createAttendance({
        schedule_id: schedule.id,
        personnel_id: schedule.personnel_id,
        check_in: new Date().toISOString(),
        status: getCheckInStatus(schedule.duty_date, schedule.start_time)
    }), 'Attendance could not be recorded.');

    const handleCheckOut = (schedule, attendanceId) => saveRow(schedule.id, () => db.updateAttendance(attendanceId, {
        check_out: new Date().toISOString()
    }), 'Check-out could not be recorded.');

    const handleSetStatus = (schedule, record, status) => saveRow(schedule.id, () => (
        record
            ? db.updateAttendance(record.id, { status })
            : db.createAttendance({ schedule_id: schedule.id, personnel_id: schedule.personnel_id, status })
    ), 'Attendance status could not be recorded.');

    const stats = {
        total: schedules.length,
        present: attendance.filter(a => a.status === 'present').length,
        late: attendance.filter(a => a.status === 'late').length,
        absent: attendance.filter(a => a.status === 'absent').length
    };

    if (loading) return <PageLoader label="Loading attendance…" />;

    return (
        <div className="attendance-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Attendance</h1>
                    <p className="page-subtitle">Track check-ins and attendance status</p>
                </div>
                <div className="flex items-center gap-md attendance-date-picker">
                    <Calendar size={20} className="text-muted" aria-hidden="true" />
                    <input
                        type="date"
                        className="form-input"
                        value={selectedDate}
                        onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value); }}
                        aria-label="Duty date"
                    />
                </div>
            </div>

            {error && (
                <InlineAlert type="error">{error}</InlineAlert>
            )}

            <div className="stats-grid mb-xl">
                <StatCard icon={Calendar} tone="blue" value={stats.total} label={isToday ? 'Scheduled Today' : 'Scheduled'} />
                <StatCard icon={Check} tone="green" value={stats.present} label="Present" />
                <StatCard icon={Clock} tone="orange" value={stats.late} label="Late" />
                <StatCard icon={X} tone="red" value={stats.absent} label="Absent" />
            </div>

            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        {formatDutyDate(selectedDate)}
                    </h3>
                </div>

                {schedules.length === 0 ? (
                    <EmptyState icon={Calendar} title="No Schedules">There are no personnel scheduled for this date.</EmptyState>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Personnel</th>
                                    <th>Scheduled Time</th>
                                    <th>Check In</th>
                                    <th>Check Out</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedules.map((schedule) => {
                                    const att = getAttendanceForSchedule(schedule.id);
                                    const canManageAttendance = isAdmin || schedule.personnel_id === profile?.id;
                                    const isSaving = savingId === schedule.id;
                                    const canCheckIn = canManageAttendance && isToday && !att;
                                    const canCheckOut = canManageAttendance && att?.check_in && !att.check_out
                                        && (att.status === 'present' || att.status === 'late');
                                    const idleLabel = !canManageAttendance ? 'View only'
                                        : att ? 'Recorded'
                                            : selectedDate > format(new Date(), 'yyyy-MM-dd') ? 'Opens on duty day' : 'Not recorded';

                                    return (
                                        <tr key={schedule.id}>
                                            <td data-label="Personnel">
                                                <div className="flex items-center gap-md">
                                                    <div className="user-avatar sm">{schedule.personnel?.name?.charAt(0).toUpperCase()}</div>
                                                    <div>
                                                        <div>{schedule.personnel?.name}</div>
                                                        <div className="text-sm text-muted">{getRoleLabel(schedule.personnel?.role)}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="Scheduled">
                                                <div className="flex items-center gap-sm">
                                                    <Clock size={14} />
                                                    {formatTimeRange(schedule.start_time, schedule.end_time)}
                                                </div>
                                            </td>
                                            <td data-label="Check In">
                                                {formatClockTime(att?.check_in)}
                                            </td>
                                            <td data-label="Check Out">
                                                {formatClockTime(att?.check_out)}
                                            </td>
                                            <td data-label="Status">
                                                <StatusBadge {...getAttendanceBadge(att?.status)} />
                                            </td>
                                            <td data-label="Actions">
                                                <div className="attendance-actions">
                                                    {canCheckIn && (
                                                        <button className="btn btn-sm btn-primary" onClick={() => handleCheckIn(schedule)} disabled={isSaving}>
                                                            <LogIn size={14} />
                                                            Check In
                                                        </button>
                                                    )}
                                                    {canCheckOut && (
                                                        <button className="btn btn-sm btn-secondary" onClick={() => handleCheckOut(schedule, att.id)} disabled={isSaving}>
                                                            <LogOutIcon size={14} />
                                                            Check Out
                                                        </button>
                                                    )}
                                                    {isAdmin ? (
                                                        <select
                                                            className="form-select attendance-status-select"
                                                            value={att?.status || ''}
                                                            onChange={(e) => { if (e.target.value) handleSetStatus(schedule, att, e.target.value); }}
                                                            disabled={isSaving}
                                                            aria-label={`Attendance status for ${schedule.personnel?.name || 'this volunteer'}`}
                                                        >
                                                            {!att && <option value="">Set status…</option>}
                                                            {ATTENDANCE_STATUSES.map((status) => (
                                                                <option key={status.value} value={status.value}>{status.label}</option>
                                                            ))}
                                                        </select>
                                                    ) : !canCheckIn && !canCheckOut && (
                                                        <span className="text-muted text-sm">{idleLabel}</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
