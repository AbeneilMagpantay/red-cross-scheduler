import { useState, useEffect } from 'react';
import { db } from '../lib/supabase';
import Modal from '../components/Modal';
import {
    Clock,
    LogIn,
    LogOut as LogOutIcon,
    Check,
    X,
    AlertCircle,
    Calendar
} from 'lucide-react';
import { format } from 'date-fns';

export default function Attendance() {
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [schedules, setSchedules] = useState([]);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: scheduleData } = await db.getSchedules(selectedDate, selectedDate);
            const { data: attendanceData } = await db.getAttendance(selectedDate);

            setSchedules(scheduleData || []);
            setAttendance(attendanceData || []);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getAttendanceForSchedule = (scheduleId) => {
        return attendance.find(a => a.schedule_id === scheduleId);
    };

    const handleCheckIn = async (scheduleId, personnelId) => {
        try {
            await db.createAttendance({
                schedule_id: scheduleId,
                personnel_id: personnelId,
                check_in: new Date().toISOString(),
                status: 'present'
            });
            loadData();
        } catch (error) {
            console.error('Error recording check-in:', error);
        }
    };

    const handleCheckOut = async (attendanceId) => {
        try {
            await db.updateAttendance(attendanceId, {
                check_out: new Date().toISOString()
            });
            loadData();
        } catch (error) {
            console.error('Error recording check-out:', error);
        }
    };

    const handleMarkStatus = async (scheduleId, personnelId, status) => {
        try {
            await db.createAttendance({
                schedule_id: scheduleId,
                personnel_id: personnelId,
                status: status
            });
            loadData();
        } catch (error) {
            console.error('Error marking status:', error);
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            present: { class: 'badge-success', label: 'Present' },
            late: { class: 'badge-warning', label: 'Late' },
            absent: { class: 'badge-error', label: 'Absent' },
            excused: { class: 'badge-info', label: 'Excused' }
        };
        return badges[status] || { class: 'badge-neutral', label: 'Pending' };
    };

    const stats = {
        total: schedules.length,
        present: attendance.filter(a => a.status === 'present').length,
        late: attendance.filter(a => a.status === 'late').length,
        absent: attendance.filter(a => a.status === 'absent').length
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '50vh' }}>
                <div className="loading" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div className="attendance-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Attendance</h1>
                    <p className="page-subtitle">Track check-ins and attendance status</p>
                </div>
                <div className="flex items-center gap-md">
                    <Calendar size={20} style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="date"
                        className="form-input"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ width: 'auto' }}
                    />
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid mb-xl">
                <div className="stat-card">
                    <div className="stat-icon blue">
                        <Calendar size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.total}</h3>
                        <p>Scheduled Today</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green">
                        <Check size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.present}</h3>
                        <p>Present</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon orange">
                        <Clock size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.late}</h3>
                        <p>Late</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon red">
                        <X size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.absent}</h3>
                        <p>Absent</p>
                    </div>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
                    </h3>
                </div>

                {schedules.length === 0 ? (
                    <div className="empty-state">
                        <Calendar size={48} />
                        <h3>No Schedules</h3>
                        <p>There are no personnel scheduled for this date.</p>
                    </div>
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
                                    const statusInfo = att ? getStatusBadge(att.status) : getStatusBadge(null);

                                    return (
                                        <tr key={schedule.id}>
                                            <td>
                                                <div className="flex items-center gap-md">
                                                    <div className="user-avatar" style={{ width: 36, height: 36, fontSize: '0.85rem' }}>
                                                        {schedule.personnel?.name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div>{schedule.personnel?.name}</div>
                                                        <div className="text-sm text-muted">{schedule.personnel?.role}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-sm">
                                                    <Clock size={14} />
                                                    {schedule.start_time} - {schedule.end_time}
                                                </div>
                                            </td>
                                            <td>
                                                {att?.check_in
                                                    ? format(new Date(att.check_in), 'h:mm a')
                                                    : '—'
                                                }
                                            </td>
                                            <td>
                                                {att?.check_out
                                                    ? format(new Date(att.check_out), 'h:mm a')
                                                    : '—'
                                                }
                                            </td>
                                            <td>
                                                <span className={`badge ${statusInfo.class}`}>
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td>
                                                {!att ? (
                                                    <div className="flex gap-sm">
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => handleCheckIn(schedule.id, schedule.personnel_id)}
                                                        >
                                                            <LogIn size={14} />
                                                            Check In
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-secondary"
                                                            onClick={() => handleMarkStatus(schedule.id, schedule.personnel_id, 'absent')}
                                                        >
                                                            Absent
                                                        </button>
                                                    </div>
                                                ) : !att.check_out && att.status === 'present' ? (
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleCheckOut(att.id)}
                                                    >
                                                        <LogOutIcon size={14} />
                                                        Check Out
                                                    </button>
                                                ) : (
                                                    <span className="text-muted text-sm">Recorded</span>
                                                )}
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
