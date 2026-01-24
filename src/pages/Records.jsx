import { useState, useEffect } from 'react';
import { db } from '../lib/supabase';
import { format } from 'date-fns';
import { FileText, Search, Clock, Calendar, User } from 'lucide-react';

export default function Records() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const { data, error } = await db.getAttendance();
            if (error) throw error;

            // Group by Schedule (Event)
            // Key: schedule_id or (date + title + time)
            const grouped = {};

            data.forEach(record => {
                if (!record.schedules) return; // Skip if schedule deleted

                const scheduleId = record.schedule_id;
                const dateStr = record.schedules.duty_date;
                const title = record.schedules.title || 'Untitled Duty';
                const time = `${record.schedules.start_time.slice(0, 5)} - ${record.schedules.end_time.slice(0, 5)}`;

                const key = `${dateStr}-${title}-${time}`; // grouping key

                if (!grouped[key]) {
                    grouped[key] = {
                        id: scheduleId, // using one id, but really it's a generated group
                        title: title,
                        date: dateStr,
                        time: time,
                        attendees: []
                    };
                }

                grouped[key].attendees.push({
                    name: record.personnel?.name || 'Unknown',
                    checkIn: record.check_in,
                    checkOut: record.check_out,
                    status: record.status,
                    notes: record.notes
                });
            });

            // Convert back to array
            setRecords(Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date)));

        } catch (error) {
            console.error('Error loading records:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredRecords = records.filter(record =>
        record.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.date.includes(searchTerm)
    );

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
                    <p className="page-subtitle">History of duties and attendance</p>
                </div>
            </div>

            <div className="card mb-lg">
                <div className="flex gap-md">
                    <div style={{ flex: '1', position: 'relative' }}>
                        <Search size={18} style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)'
                        }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search by event title or date..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-md">
                {filteredRecords.length === 0 ? (
                    <div className="empty-state card">
                        <FileText size={48} />
                        <h3>No Records Found</h3>
                        <p>Attendance records will appear here once duties are logs.</p>
                    </div>
                ) : (
                    filteredRecords.map((record, index) => (
                        <div key={index} className="card">
                            <div className="flex justify-between items-start mb-md pb-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{record.title}</h3>
                                    <div className="flex gap-md text-sm text-muted">
                                        <span className="flex items-center gap-xs">
                                            <Calendar size={14} />
                                            {format(new Date(record.date), 'MMMM d, yyyy')}
                                        </span>
                                        <span className="flex items-center gap-xs">
                                            <Clock size={14} />
                                            {record.time}
                                        </span>
                                    </div>
                                </div>
                                <div className="badge badge-info text-sm">
                                    {record.attendees.length} Attendees
                                </div>
                            </div>

                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Personnel</th>
                                            <th>Check In</th>
                                            <th>Check Out</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {record.attendees.map((attendee, idx) => (
                                            <tr key={idx}>
                                                <td>
                                                    <div className="flex items-center gap-sm">
                                                        <User size={16} />
                                                        {attendee.name}
                                                    </div>
                                                </td>
                                                <td>
                                                    {attendee.checkIn ? format(new Date(attendee.checkIn), 'h:mm a') : '—'}
                                                </td>
                                                <td>
                                                    {attendee.checkOut ? format(new Date(attendee.checkOut), 'h:mm a') : '—'}
                                                </td>
                                                <td>
                                                    <span className={`badge ${attendee.status === 'present' ? 'badge-success' :
                                                            attendee.status === 'late' ? 'badge-warning' :
                                                                attendee.status === 'absent' ? 'badge-error' :
                                                                    'badge-neutral'
                                                        }`}>
                                                        {attendee.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
