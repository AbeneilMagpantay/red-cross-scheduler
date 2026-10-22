import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import InlineAlert from '../components/InlineAlert';
import { useToast } from '../components/feedback';
import { EmptyState, PageLoader, StatusBadge } from '../components/ui';
import {
    ArrowLeftRight,
    Check,
    X,
    Clock,
    Calendar,
    User
} from 'lucide-react';
import { format } from 'date-fns';
import { formatDutyDate, formatTimeRange } from '../lib/format';
import { getSwapBadge } from '../lib/status';
import { UNTITLED_DUTY } from '../lib/schedule';

const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' }
];

export default function Swaps() {
    const { isAdmin, profile } = useAuth();
    const toast = useToast();
    const [swapRequests, setSwapRequests] = useState([]);
    const [mySchedules, setMySchedules] = useState([]);
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filter, setFilter] = useState('all');
    const [loadError, setLoadError] = useState('');
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [updatingId, setUpdatingId] = useState(null);
    const [formData, setFormData] = useState({
        schedule_id: '',
        target_id: '',
        reason: ''
    });

    const loadData = useCallback(async () => {
        try {
            const today = format(new Date(), 'yyyy-MM-dd');
            const [swapsRes, personnelRes, schedulesRes] = await Promise.all([
                db.getSwapRequests(),
                db.getPersonnel(),
                profile?.id ? db.getSchedulesByPersonnel(profile.id, today) : Promise.resolve({ data: [], error: null })
            ]);
            const loadFailure = swapsRes.error || personnelRes.error || schedulesRes.error;
            if (loadFailure) throw loadFailure;

            setSwapRequests(swapsRes.data || []);
            setPersonnel(personnelRes.data?.filter(p => p.is_active) || []);
            setMySchedules(schedulesRes.data || []);
            setLoadError('');
        } catch (error) {
            console.error('Error loading data:', error);
            setLoadError(error.message || 'Swap requests could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [profile?.id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const updateRequest = async (id, status) => {
        setUpdatingId(id);
        try {
            const { error } = await db.updateSwapRequest(id, status);
            if (error) throw error;
            toast.success(status === 'approved'
                ? 'Swap approved. The schedules have been swapped.'
                : 'Swap request rejected.');
            await loadData();
        } catch (error) {
            console.error(`Error updating swap to ${status}:`, error);
            toast.error(`Could not ${status === 'approved' ? 'approve' : 'reject'} this swap. ${error.message || ''}`.trim());
        } finally {
            setUpdatingId(null);
        }
    };

    const openRequestModal = () => {
        setFormError('');
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setSubmitting(true);

        try {
            const { error } = await db.createSwapRequest({
                requester_id: profile.id,
                target_id: formData.target_id,
                schedule_id: formData.schedule_id,
                reason: formData.reason || null,
                status: 'pending'
            });
            if (error) throw error;

            setIsModalOpen(false);
            setFormData({ schedule_id: '', target_id: '', reason: '' });
            toast.success('Swap request sent for approval.');
            loadData();
        } catch (error) {
            console.error('Error creating swap request:', error);
            setFormError(error.message || 'Your swap request could not be sent.');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredRequests = swapRequests.filter(req => filter === 'all' || req.status === filter);

    if (loading) return <PageLoader label="Loading shift swaps…" />;

    return (
        <div className="swaps-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Shift Swaps</h1>
                    <p className="page-subtitle">
                        {isAdmin ? 'Manage swap requests from personnel' : 'Request to swap your shifts'}
                    </p>
                </div>
                {!isAdmin && (
                    <button className="btn btn-primary" onClick={openRequestModal}>
                        <ArrowLeftRight size={18} />
                        Request Swap
                    </button>
                )}
            </div>

            {loadError && <InlineAlert type="error" className="mb-lg">{loadError}</InlineAlert>}

            <div className="card mb-lg">
                <div className="flex gap-md status-filter-grid" role="group" aria-label="Filter swap requests">
                    {FILTERS.map(({ value, label }) => (
                        <button
                            key={value}
                            className={`btn ${filter === value ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setFilter(value)}
                            aria-pressed={filter === value}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card">
                {filteredRequests.length === 0 ? (
                    <EmptyState icon={ArrowLeftRight} title="No Swap Requests">
                        {filter === 'all' ? 'There are no swap requests at the moment.' : `No ${filter} swap requests.`}
                    </EmptyState>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Requester</th>
                                    <th>Target</th>
                                    <th>Schedule</th>
                                    <th>Requested</th>
                                    <th>Status</th>
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRequests.map((request) => (
                                    <tr key={request.id}>
                                        <td data-label="Requester">
                                            <div className="flex items-center gap-md">
                                                <div className="user-avatar sm">{request.requester?.name?.charAt(0).toUpperCase()}</div>
                                                <span>{request.requester?.name}</span>
                                            </div>
                                        </td>
                                        <td data-label="Target">
                                            <div className="flex items-center gap-md">
                                                <User size={16} />
                                                <span>{request.target?.name}</span>
                                            </div>
                                        </td>
                                        <td data-label="Schedule">
                                            {request.schedules && (
                                                <div className="flex flex-col gap-xs">
                                                    <div className="flex items-center gap-sm">
                                                        <Calendar size={14} />
                                                        {formatDutyDate(request.schedules.duty_date, 'MMM d, yyyy')}
                                                    </div>
                                                    <div className="flex items-center gap-sm text-muted text-sm">
                                                        <Clock size={14} />
                                                        {formatTimeRange(request.schedules.start_time, request.schedules.end_time)}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td data-label="Requested" className="text-sm text-muted">
                                            {format(new Date(request.created_at), 'MMM d, h:mm a')}
                                        </td>
                                        <td data-label="Status">
                                            <StatusBadge {...getSwapBadge(request.status)} />
                                        </td>
                                        {isAdmin && (
                                            <td data-label="Actions">
                                                {request.status === 'pending' && (
                                                    <div className="flex gap-sm">
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => updateRequest(request.id, 'approved')}
                                                            disabled={updatingId === request.id}
                                                        >
                                                            <Check size={14} />
                                                            Approve
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            onClick={() => updateRequest(request.id, 'rejected')}
                                                            disabled={updatingId === request.id}
                                                        >
                                                            <X size={14} />
                                                            Reject
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Request Shift Swap"
            >
                <form onSubmit={handleSubmit}>
                    {!mySchedules.length && (
                        <InlineAlert type="info">You have no upcoming duties to swap.</InlineAlert>
                    )}
                    <div className="form-group">
                        <label className="form-label">Your Schedule to Swap *</label>
                        <select
                            className="form-select"
                            value={formData.schedule_id}
                            onChange={(e) => setFormData({ ...formData, schedule_id: e.target.value })}
                            required
                        >
                            <option value="">Select your schedule</option>
                            {mySchedules.map(s => (
                                <option key={s.id} value={s.id}>
                                    {formatDutyDate(s.duty_date, 'MMM d')} · {s.title || UNTITLED_DUTY} · {formatTimeRange(s.start_time, s.end_time)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Swap With *</label>
                        <select
                            className="form-select"
                            value={formData.target_id}
                            onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                            required
                        >
                            <option value="">Select personnel</option>
                            {personnel.filter(p => p.id !== profile?.id).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Reason</label>
                        <textarea
                            className="form-input"
                            rows={3}
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            placeholder="Why do you need to swap this shift?"
                        />
                    </div>

                    {formError && <InlineAlert type="error">{formError}</InlineAlert>}

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting || !mySchedules.length}>
                            <ArrowLeftRight size={18} />
                            {submitting ? 'Sending…' : 'Submit Request'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
