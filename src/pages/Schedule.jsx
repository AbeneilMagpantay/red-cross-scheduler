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
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [formData, setFormData] = useState({
        personnel_id: '',
        duty_date: '',
        start_time: '08:00',
        end_time: '17:00',
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

    const getSchedulesForDay = (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return schedules.filter(s => s.duty_date === dateStr);
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
            notes: ''
        });
        setIsModalOpen(true);
    };

    const handleEditSchedule = (schedule) => {
        setEditingSchedule(schedule);
        setFormData({
            personnel_id: schedule.personnel_id,
            duty_date: schedule.duty_date,
            start_time: schedule.start_time.slice(0, 5), // Ensure HH:MM format
            end_time: schedule.end_time.slice(0, 5),
            notes: schedule.notes || ''
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingSchedule) {
                const { error } = await db.updateSchedule(editingSchedule.id, formData);
                if (error) {
                    throw error;
                }
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
        // Removed native confirm to avoid browser blocking issues
        // if (!confirm('Are you sure you want to delete this schedule?')) return;

        try {
            const { error } = await db.deleteSchedule(id);
            if (error) {
                alert('Failed to delete schedule: ' + error.message);
                console.error('Delete error:', error);
                return;
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
                        const daySchedules = getSchedulesForDay(day);
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
                                {daySchedules.slice(0, view === 'week' ? 10 : 3).map(schedule => (
                                    <div
                                        key={schedule.id}
                                        className="calendar-event"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditSchedule(schedule);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{schedule.personnel?.name}</span>
                                        </div>
                                    </div>
                                ))}
                                {daySchedules.length > (view === 'week' ? 10 : 3) && (
                                    <div className="text-sm text-muted" style={{ padding: '2px 6px' }}>
                                        +{daySchedules.length - (view === 'week' ? 10 : 3)} more
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

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
