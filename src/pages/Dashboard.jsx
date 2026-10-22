import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import {
    Users,
    Calendar,
    ClipboardCheck,
    ArrowLeftRight,
    Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { EmptyState, PageLoader, StatCard, StatusBadge } from '../components/ui';
import { formatTimeRange } from '../lib/format';
import { getDutyProgressBadge, getRoleLabel } from '../lib/status';
import InlineAlert from '../components/InlineAlert';

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
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            const today = format(new Date(), 'yyyy-MM-dd');
            const [personnelRes, schedulesRes, swapsRes] = await Promise.all([
                db.getPersonnel(),
                db.getSchedules(today, today),
                db.getSwapRequests('pending')
            ]);
            const loadFailure = personnelRes.error || schedulesRes.error || swapsRes.error;
            if (loadFailure) throw loadFailure;
            const personnel = personnelRes.data?.filter((person) => person.is_active);
            const schedules = schedulesRes.data;
            const swaps = swapsRes.data;

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
            setLoadError('');
        } catch (error) {
            console.error('Error loading dashboard:', error);
            setLoadError(error.message || 'The overview could not be loaded.');
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

    if (loading) return <PageLoader label="Loading overview…" />;

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

            {loadError && <InlineAlert type="error" className="mb-lg">{loadError}</InlineAlert>}

            <div className="stats-grid">
                <StatCard icon={Users} tone="red" value={stats.totalPersonnel} label="Active Personnel" />
                <StatCard icon={Calendar} tone="blue" value={stats.todayDuties} label="On Duty Today" />
                <StatCard icon={ArrowLeftRight} tone="orange" value={stats.pendingSwaps} label="Pending Swaps" />
                <StatCard icon={ClipboardCheck} tone="green" value={stats.attendanceRate === null ? '—' : `${stats.attendanceRate}%`} label="Attendance Today" />
            </div>

            <div className="card dashboard-roster">
                <div className="card-header">
                    <div>
                        <h3 className="card-title">Today's Duty Roster</h3>
                        <p className="card-subtitle">Personnel scheduled for today</p>
                    </div>
                </div>

                {todaySchedule.length === 0 ? (
                    <EmptyState icon={Calendar} title="No Duties Scheduled">There are no personnel scheduled for duty today.</EmptyState>
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
                                {todaySchedule.map((schedule) => {
                                    const progress = getDutyProgressBadge(schedule.attendance || []);
                                    return (
                                        <tr key={schedule.id}>
                                            <td data-label="Personnel">{schedule.personnel?.name}</td>
                                            <td data-label="Role">{getRoleLabel(schedule.personnel?.role)}</td>
                                            <td data-label="Time">
                                                <div className="flex items-center gap-sm">
                                                    <Clock size={14} />
                                                    {formatTimeRange(schedule.start_time, schedule.end_time)}
                                                </div>
                                            </td>
                                            <td data-label="Status">
                                                <StatusBadge {...progress} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {stats.pendingSwaps > 0 && (
                <InlineAlert type="warning" className="mt-lg">
                    <strong>{stats.pendingSwaps} pending swap request{stats.pendingSwaps === 1 ? '' : 's'}</strong> need attention.{' '}
                    <Link to="/swaps">Review swaps</Link>
                </InlineAlert>
            )}
        </div>
    );
}
