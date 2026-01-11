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
import { format, isToday, parseISO } from 'date-fns';

export default function Dashboard() {
    const { profile } = useAuth();
    const [stats, setStats] = useState({
        totalPersonnel: 0,
        todayDuties: 0,
        pendingSwaps: 0,
        attendanceRate: 0
    });
    const [todaySchedule, setTodaySchedule] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const today = format(new Date(), 'yyyy-MM-dd');

            // Get personnel count
            const { data: personnel } = await db.getPersonnel();

            // Get today's schedules
            const { data: schedules } = await db.getSchedules(today, today);

            // Get pending swap requests
            const { data: swaps } = await db.getSwapRequests('pending');

            setStats({
                totalPersonnel: personnel?.length || 0,
                todayDuties: schedules?.length || 0,
                pendingSwaps: swaps?.length || 0,
                attendanceRate: 95 // Placeholder - would calculate from actual attendance
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
            <div className="page-header">
                <div>
                    <h1 className="page-title">{getGreeting()}, {profile?.name?.split(' ')[0] || 'User'}</h1>
                    <p className="page-subtitle">
                        {format(new Date(), 'EEEE, MMMM d, yyyy')}
                    </p>
                </div>
            </div>

            {/* Stats Grid */}
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
                        <h3>{stats.attendanceRate}%</h3>
                        <p>Attendance Rate</p>
                    </div>
                </div>
            </div>

            {/* Today's Schedule */}
            <div className="card">
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
                                        <td>{schedule.personnel?.name}</td>
                                        <td>{schedule.personnel?.role}</td>
                                        <td>
                                            <div className="flex items-center gap-sm">
                                                <Clock size={14} />
                                                {schedule.start_time} - {schedule.end_time}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-success">Scheduled</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Alerts Section */}
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
