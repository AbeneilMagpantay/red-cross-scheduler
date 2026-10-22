import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import {
    Users,
    Calendar,
    ClipboardCheck,
    ArrowLeftRight,
    Clock,
    AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
    const { profile } = useAuth();
    const [stats, setStats] = useState({
        totalPersonnel: 0,
        todayDuties: 0,
        pendingSwaps: 0,
        attendanceRate: null
    });
    const [todaySchedule, setTodaySchedule] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const today = format(new Date(), 'yyyy-MM-dd');
            const [{ data: personnel }, { data: schedules }, { data: swaps }] = await Promise.all([
                db.getPersonnel(),
                db.getSchedules(today, today),
                db.getSwapRequests('pending')
            ]);

            const statuses = (schedules || []).flatMap((schedule) => schedule.attendance || []).map((record) => record.status);
            const attended = statuses.filter((status) => status === 'present' || status === 'late').length;
            const decided = attended + statuses.filter((status) => status === 'absent').length;

            setStats({
                totalPersonnel: personnel?.length || 0,
                todayDuties: schedules?.length || 0,
                pendingSwaps: swaps?.length || 0,
                attendanceRate: decided ? Math.round((attended / decided) * 100) : null
            });

            setTodaySchedule(schedules || []);
        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '50vh' }}>
                <div className="loading" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div className="dashboard">
            <div className="page-header dashboard-hero">
                <div>
                    <span className="page-eyebrow">Operations overview</span>
                    <h1 className="page-title">{getGreeting()}, {profile?.name?.split(' ')[0] || 'User'}</h1>
                    <p className="page-subtitle">
                        {format(new Date(), 'EEEE, MMMM d, yyyy')}
                    </p>
                </div>
                <div className="workspace-status"><span /> Live workspace</div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon red">
                        <Users size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.totalPersonnel}</h3>
                        <p>Total Personnel</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon blue">
                        <Calendar size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.todayDuties}</h3>
                        <p>On Duty Today</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon orange">
                        <ArrowLeftRight size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.pendingSwaps}</h3>
                        <p>Pending Swaps</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon green">
                        <ClipboardCheck size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{stats.attendanceRate === null ? '—' : `${stats.attendanceRate}%`}</h3>
                        <p>Attendance Today</p>
                    </div>
                </div>
            </div>

            <div className="card dashboard-roster">
                <div className="card-header">
                    <div>
                        <h3 className="card-title">Today's Duty Roster</h3>
                        <p className="card-subtitle">Personnel scheduled for today</p>
                    </div>
                </div>

                {todaySchedule.length === 0 ? (
                    <div className="empty-state">
                        <Calendar size={48} />
                        <h3>No Duties Scheduled</h3>
                        <p>There are no personnel scheduled for duty today.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Personnel</th>
                                    <th>Role</th>
                                    <th>Time</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {todaySchedule.map((schedule) => (
                                    <tr key={schedule.id}>
                                        <td data-label="Personnel">{schedule.personnel?.name}</td>
                                        <td data-label="Role">{schedule.personnel?.role}</td>
                                        <td data-label="Time">
                                            <div className="flex items-center gap-sm">
                                                <Clock size={14} />
                                                {schedule.start_time} - {schedule.end_time}
                                            </div>
                                        </td>
                                        <td data-label="Status">
                                            <span className="badge badge-success">Scheduled</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {stats.pendingSwaps > 0 && (
                <div className="card mt-lg" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                    <div className="flex items-center gap-md">
                        <AlertCircle size={24} style={{ color: 'var(--warning)' }} />
                        <div>
                            <h4 style={{ color: 'var(--warning)' }}>Pending Shift Swap Requests</h4>
                            <p className="text-muted text-sm">
                                You have {stats.pendingSwaps} pending swap request(s) that need attention.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
