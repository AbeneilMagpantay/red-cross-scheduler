import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Calendar as CalendarIcon,
    Clock,
    User,
    Trash2
} from 'lucide-react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    addWeeks,
    subWeeks
} from 'date-fns';

export default function Schedule() {
    const { profile, isAdmin } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('month'); // 'month' | 'week'
    const [schedules, setSchedules] = useState([]);
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);

    // State
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [viewingEvent, setViewingEvent] = useState(null); // { title, date, schedules: [] }
    const [selectedDate, setSelectedDate] = useState(null);
    const [formData, setFormData] = useState({
        personnel_id: '',
        duty_date: '',
        start_time: '08:00',
        end_time: '17:00',
        title: '',
        notes: ''
    });

    // Check if current user can delete the editing schedule
    const canDeleteSchedule = isAdmin || (editingSchedule && editingSchedule.personnel_id === profile?.id);

    useEffect(() => {
        loadData();
    }, [currentDate, view]);

    const loadData = async () => {
        try {
            let startDate, endDate;

            if (view === 'month') {
                startDate = format(startOfMonth(currentDate), 'yyyy-MM-dd');
                endDate = format(endOfMonth(currentDate), 'yyyy-MM-dd');
            } else {
                startDate = format(startOfWeek(currentDate), 'yyyy-MM-dd');
                endDate = format(endOfWeek(currentDate), 'yyyy-MM-dd');
            }

            const [scheduleRes, personnelRes] = await Promise.all([
                db.getSchedules(startDate, endDate),
                db.getPersonnel()
            ]);

            setSchedules(scheduleRes.data || []);
            setPersonnel(personnelRes.data?.filter(p => p.is_active) || []);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const calendarDays = useMemo(() => {
        if (view === 'month') {
            const monthStart = startOfMonth(currentDate);
            const monthEnd = endOfMonth(currentDate);
            const startDate = startOfWeek(monthStart);
            const endDate = endOfWeek(monthEnd);
            return eachDayOfInterval({ start: startDate, end: endDate });
        } else {
            const weekStart = startOfWeek(currentDate);
            const weekEnd = endOfWeek(currentDate);
            return eachDayOfInterval({ start: weekStart, end: weekEnd });
        }
    }, [currentDate, view]);

    // Group schedules by Title (or Time if no title) for a specific day
    const getEventsForDay = (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const daySchedules = schedules.filter(s => s.duty_date === dateStr);

        const groups = {};

        daySchedules.forEach(schedule => {
            // Key: Title if exists, otherwise "Individual"
            const key = schedule.title ? schedule.title : 'Individual Duties';

            if (!groups[key]) {
                groups[key] = {
                    title: key,
                    date: date,
                    schedules: [],
                    isGroup: !!schedule.title
                };
            }
            groups[key].schedules.push(schedule);
        });

        return Object.values(groups);
    };

    const handlePrev = () => {
        if (view === 'month') {
            setCurrentDate(subMonths(currentDate, 1));
        } else {
            setCurrentDate(subWeeks(currentDate, 1));
        }
    };

    const handleNext = () => {
        if (view === 'month') {
            setCurrentDate(addMonths(currentDate, 1));
        } else {
            setCurrentDate(addWeeks(currentDate, 1));
        }
    };

    const handleDayClick = (date) => {
        setEditingSchedule(null);
        setSelectedDate(date);
        setFormData({
            personnel_id: '',
            duty_date: format(date, 'yyyy-MM-dd'),
            start_time: '08:00',
            end_time: '17:00',
            title: '',
            notes: ''
        });
        setIsModalOpen(true);
    };

    const handleEventClick = (event) => {
        setViewingEvent(event);
        setIsViewModalOpen(true);
    };

    const handleEditSchedule = (schedule) => {
        // Check if user can edit this schedule
        const canEdit = isAdmin || schedule.personnel_id === profile?.id;
        if (!canEdit) {
            alert('You can only view your own schedule entries.');
            return;
        }

        setEditingSchedule(schedule);
        setFormData({
            personnel_id: schedule.personnel_id,
            duty_date: schedule.duty_date,
            start_time: schedule.start_time.slice(0, 5),
            end_time: schedule.end_time.slice(0, 5),
            title: schedule.title || '',
            notes: schedule.notes || ''
        });
        setIsViewModalOpen(false); // Close view modal if open
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingSchedule) {
                const { error } = await db.updateSchedule(editingSchedule.id, formData);
                if (error) throw error;
            } else {
                await db.createSchedule(formData);
            }

            setIsModalOpen(false);
            setEditingSchedule(null);
            loadData();
        } catch (error) {
            console.error('Error saving schedule:', error);
            alert('Failed to save schedule: ' + error.message);
        }
    };

    const handleDeleteSchedule = async (id) => {
        try {
            const { error } = await db.deleteSchedule(id);
            if (error) {
                alert('Failed to delete schedule: ' + error.message);
                return;
            }
            // Update the viewingEvent list locally to reflect deletion immediately or close if empty
            if (viewingEvent) {
                const updatedSchedules = viewingEvent.schedules.filter(s => s.id !== id);
                if (updatedSchedules.length === 0) {
                    setIsViewModalOpen(false);
                    setViewingEvent(null);
                } else {
                    setViewingEvent({ ...viewingEvent, schedules: updatedSchedules });
                }
            }

            setIsModalOpen(false);
            loadData();
        } catch (error) {
            console.error('Error deleting schedule:', error);
            alert('An unexpected error occurred while deleting.');
        }
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '50vh' }}>
                <div className="loading" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div className="schedule-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Schedule</h1>
                    <p className="page-subtitle">Manage duty assignments and schedules</p>
                </div>
                <div className="flex gap-md">
                    <div className="flex gap-sm">
                        <button
                            className={`btn ${view === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setView('month')}
                        >
                            Month
                        </button>
                        <button
                            className={`btn ${view === 'week' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setView('week')}
                        >
                            Week
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar */}
            <div className="calendar">
                <div className="calendar-header">
                    <div className="calendar-nav">
                        <button onClick={handlePrev}>
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={() => setCurrentDate(new Date())} className="btn btn-secondary btn-sm">
                            Today
                        </button>
                        <button onClick={handleNext}>
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <h2 className="calendar-title">
                        {view === 'month'
                            ? format(currentDate, 'MMMM yyyy')
                            : `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`
                        }
                    </h2>
                    <div style={{ width: '120px' }}></div>
                </div>

                <div className="calendar-grid">
                    {weekDays.map(day => (
                        <div key={day} className="calendar-weekday">{day}</div>
                    ))}

                    {calendarDays.map(day => {
                        const events = getEventsForDay(day);
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isToday = isSameDay(day, new Date());

                        return (
                            <div
                                key={day.toISOString()}
                                className={`calendar-day ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''}`}
                                onClick={() => handleDayClick(day)}
                                style={{ minHeight: view === 'week' ? '200px' : '100px' }}
                            >
                                <div className="calendar-day-number">{format(day, 'd')}</div>
                                {events.slice(0, view === 'week' ? 10 : 3).map((event, idx) => (
                                    <div
                                        key={idx}
                                        className="calendar-event"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEventClick(event);
                                        }}
                                        style={{
                                            cursor: 'pointer',
                                            backgroundColor: event.isGroup ? 'var(--primary)' : 'var(--secondary)',
                                            color: event.isGroup ? 'white' : 'var(--text-primary)'
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{event.title} ({event.schedules.length})</span>
                                        </div>
                                    </div>
                                ))}
                                {events.length > (view === 'week' ? 10 : 3) && (
                                    <div className="text-sm text-muted" style={{ padding: '2px 6px' }}>
                                        +{events.length - (view === 'week' ? 10 : 3)} more
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* View Details Modal */}
            <Modal
                isOpen={isViewModalOpen}
                onClose={() => setIsViewModalOpen(false)}
                title={viewingEvent?.title || 'Details'}
            >
                <div className="flex flex-col gap-md">
                    <p className="text-muted">
                        {viewingEvent && format(new Date(viewingEvent.date), 'EEEE, MMMM d, yyyy')}
                    </p>

                    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {viewingEvent?.schedules.map(schedule => (
                            <div key={schedule.id} className="card p-md mb-sm flex justify-between items-center">
                                <div>
                                    <div className="font-bold">{schedule.personnel?.name}</div>
                                    <div className="text-sm text-muted">
                                        {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                                    </div>
                                    {schedule.notes && (
                                        <div className="text-sm mt-xs italic">{schedule.notes}</div>
                                    )}
                                </div>
                                {(isAdmin || schedule.personnel_id === profile?.id) && (
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => handleEditSchedule(schedule)}
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--space-md)' }}>
                        <button
                            className="btn btn-primary w-full"
                            onClick={() => setIsViewModalOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Add/Edit Schedule Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingSchedule(null);
                }}
                title={editingSchedule ? "Edit Duty Assignment" : "Assign Duty"}
            >
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Duty Event Title</label>
                        <input
                            type="text"
                            className="form-input"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="e.g. Medical Standby, Office Duty"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Date</label>
                        <input
                            type="date"
                            className="form-input"
                            value={formData.duty_date}
                            onChange={(e) => setFormData({ ...formData, duty_date: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Personnel *</label>
                        <select
                            className="form-select"
                            value={formData.personnel_id}
                            onChange={(e) => setFormData({ ...formData, personnel_id: e.target.value })}
                            required
                        >
                            <option value="">Select Personnel</option>
                            {personnel.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-md">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Start Time *</label>
                            <input
                                type="time"
                                className="form-input"
                                value={formData.start_time}
                                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">End Time *</label>
                            <input
                                type="time"
                                className="form-input"
                                value={formData.end_time}
                                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Notes</label>
                        <textarea
                            className="form-input"
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Optional notes..."
                        />
                    </div>

                    <div className="modal-footer" style={{
                        padding: 0,
                        border: 'none',
                        marginTop: 'var(--space-lg)',
                        display: 'flex',
                        justifyContent: 'space-between'
                    }}>
                        {editingSchedule && canDeleteSchedule ? (
                            <button
                                type="button"
                                className="btn"
                                onClick={() => handleDeleteSchedule(editingSchedule.id)}
                                style={{
                                    backgroundColor: 'var(--error)',
                                    color: 'white',
                                    border: 'none'
                                }}
                            >
                                <Trash2 size={18} style={{ marginRight: 8 }} />
                                Delete
                            </button>
                        ) : (
                            <div></div> // Spacer
                        )}

                        <div className="flex gap-sm">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingSchedule(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary">
                                {editingSchedule ? (
                                    <>
                                        <Clock size={18} style={{ marginRight: 8 }} /> Update
                                    </>
                                ) : (
                                    <>
                                        <Plus size={18} style={{ marginRight: 8 }} /> Assign
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
