import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
    Calendar,
    Clock,
    FileText,
    Percent,
    Search,
    Timer,
    User,
    UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import { groupAttendanceByEvent, summarizePersonnelAttendance } from '../lib/dutyRecords';

const getStatusClass = (status) => {
    if (status === 'present') return 'badge-success';
    if (status === 'late') return 'badge-warning';
    if (status === 'absent') return 'badge-error';
    if (status === 'excused') return 'badge-info';
    return 'badge-neutral';
};

const getStatusLabel = (status) => {
    const value = status || 'pending';
    return value.charAt(0).toUpperCase() + value.slice(1);
};

export default function Records() {
    const { profile } = useAuth();
    const [attendanceRecords, setAttendanceRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('all');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const { data, error } = await db.getAttendance();
            if (error) throw error;
            setAttendanceRecords(data || []);
        } catch (error) {
            console.error('Error loading records:', error);
        } finally {
            setLoading(false);
        }
    };

    const records = useMemo(
        () => groupAttendanceByEvent(attendanceRecords),
        [attendanceRecords]
    );

    const personalSummary = useMemo(
        () => summarizePersonnelAttendance(attendanceRecords, profile?.id),
        [attendanceRecords, profile?.id]
    );

    const filteredRecords = useMemo(() => {
        const query = searchTerm.trim().toLocaleLowerCase();

        return records
            .map((record) => ({
                ...record,
                attendees: viewMode === 'mine'
                    ? record.attendees.filter((attendee) => attendee.personnelId === profile?.id)
                    : record.attendees
            }))
            .filter((record) => {
                if (record.attendees.length === 0) return false;
                if (!query) return true;

                return record.title.toLocaleLowerCase().includes(query)
                    || record.date.includes(query)
                    || record.attendees.some((attendee) =>
                        attendee.name.toLocaleLowerCase().includes(query)
                    );
            });
    }, [profile?.id, records, searchTerm, viewMode]);

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '50vh' }}>
                <div className="loading" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div className="records-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Duty Records</h1>
                    <p className="page-subtitle">Event attendance history and your personal duty summary</p>
                </div>
            </div>

            <section className="card mb-lg" aria-labelledby="personal-duty-summary">
                <div className="card-header">
                    <div>
                        <h2 id="personal-duty-summary" className="card-title">My Duty Summary</h2>
                        <p className="card-subtitle">
                            {personalSummary.decided > 0
                                ? `${personalSummary.attendanceRate}% attendance rate across recorded duties`
                                : 'Your attendance totals will appear as duties are recorded'}
                        </p>
                    </div>
                </div>

                <div className="duty-summary-grid">
                    <div className="duty-summary-item">
                        <div className="stat-icon green duty-summary-icon">
                            <UserCheck size={20} />
                        </div>
                        <div>
                            <strong>{personalSummary.attended}</strong>
                            <span>Duties Attended</span>
                        </div>
                    </div>
                    <div className="duty-summary-item">
                        <div className="stat-icon blue duty-summary-icon">
                            <Percent size={20} />
                        </div>
                        <div>
                            <strong>{personalSummary.attendanceRate}%</strong>
                            <span>Attendance Rate</span>
                        </div>
                    </div>
                    <div className="duty-summary-item">
                        <div className="stat-icon orange duty-summary-icon">
                            <Clock size={20} />
                        </div>
                        <div>
                            <strong>{personalSummary.late}</strong>
                            <span>Late Arrivals</span>
                        </div>
                    </div>
                    <div className="duty-summary-item">
                        <div className="stat-icon red duty-summary-icon">
                            <Timer size={20} />
                        </div>
                        <div>
                            <strong>{personalSummary.loggedHours}</strong>
                            <span>Hours Logged</span>
                        </div>
                    </div>
                </div>

                <p className="duty-summary-details text-sm text-muted">
                    {personalSummary.present} on time · {personalSummary.absent} absent · {personalSummary.excused} excused · {personalSummary.pending} pending
                </p>
            </section>

            <div className="card mb-lg records-toolbar">
                <div className="records-search">
                    <Search size={18} aria-hidden="true" />
                    <input
                        type="search"
                        className="form-input"
                        placeholder="Search by event, date, or personnel..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                </div>

                <div className="records-view-toggle" role="group" aria-label="Attendance record view">
                    <button
                        type="button"
                        className={`btn btn-sm ${viewMode === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('all')}
                        aria-pressed={viewMode === 'all'}
                    >
                        All Attendance
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${viewMode === 'mine' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('mine')}
                        aria-pressed={viewMode === 'mine'}
                    >
                        <User size={16} />
                        My Attendance
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-md">
                {filteredRecords.length === 0 ? (
                    <div className="empty-state card">
                        <FileText size={48} />
                        <h3>No Records Found</h3>
                        <p>
                            {viewMode === 'mine'
                                ? 'No personal attendance records match your search.'
                                : 'Attendance records will appear here once duties are logged.'}
                        </p>
                    </div>
                ) : (
                    filteredRecords.map((record) => (
                        <article key={record.id} className="card duty-record-card">
                            <div className="duty-record-header">
                                <div>
                                    <h3>{record.title}</h3>
                                    <div className="duty-record-meta text-sm text-muted">
                                        <span className="flex items-center gap-xs">
                                            <Calendar size={14} />
                                            {format(parseISO(record.date), 'MMMM d, yyyy')}
                                        </span>
                                        <span className="record-time-ranges">
                                            <Clock size={14} />
                                            {record.timeRanges.map((time) => (
                                                <span key={time} className="badge badge-neutral">{time}</span>
                                            ))}
                                        </span>
                                    </div>
                                </div>
                                <div className="badge badge-info text-sm">
                                    {record.attendees.length} {record.attendees.length === 1 ? 'Record' : 'Records'}
                                </div>
                            </div>

                            <div className="table-container">
                                <table className="table duty-record-table">
                                    <thead>
                                        <tr>
                                            <th>Personnel</th>
                                            <th>Scheduled Time</th>
                                            <th>Check In</th>
                                            <th>Check Out</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {record.attendees.map((attendee) => (
                                            <tr key={attendee.id || `${attendee.scheduleId}-${attendee.personnelId}`}>
                                                <td data-label="Personnel">
                                                    <div className="flex items-center gap-sm">
                                                        <User size={16} />
                                                        {attendee.name}
                                                    </div>
                                                </td>
                                                <td data-label="Scheduled">{attendee.scheduledTime}</td>
                                                <td data-label="Check In">
                                                    {attendee.checkIn
                                                        ? format(new Date(attendee.checkIn), 'h:mm a')
                                                        : '—'}
                                                </td>
                                                <td data-label="Check Out">
                                                    {attendee.checkOut
                                                        ? format(new Date(attendee.checkOut), 'h:mm a')
                                                        : '—'}
                                                </td>
                                                <td data-label="Status">
                                                    <span className={`badge ${getStatusClass(attendee.status)}`}>
                                                        {getStatusLabel(attendee.status)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </article>
                    ))
                )}
            </div>
        </div>
    );
}
