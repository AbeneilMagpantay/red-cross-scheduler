import { useState, useEffect } from 'react';
import { db } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import {
    ArrowLeftRight,
    Check,
    X,
    Clock,
    Calendar,
    User
} from 'lucide-react';
import { format } from 'date-fns';

export default function Swaps() {
    const { isAdmin, profile } = useAuth();
    const [swapRequests, setSwapRequests] = useState([]);
    const [mySchedules, setMySchedules] = useState([]);
    const [personnel, setPersonnel] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filter, setFilter] = useState('all');
    const [formData, setFormData] = useState({
        schedule_id: '',
        target_id: '',
        reason: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [swapsRes, personnelRes] = await Promise.all([
                db.getSwapRequests(),
                db.getPersonnel()
            ]);

            setSwapRequests(swapsRes.data || []);
            setPersonnel(personnelRes.data?.filter(p => p.is_active) || []);

            // Load user's schedules if not admin
            if (profile?.id) {
                const { data: schedules } = await db.getSchedulesByPersonnel(profile.id);
                setMySchedules(schedules || []);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id) => {
        try {
            await db.updateSwapRequest(id, 'approved');
            loadData();
        } catch (error) {
            console.error('Error approving swap:', error);
        }
    };

    const handleReject = async (id) => {
        try {
            await db.updateSwapRequest(id, 'rejected');
            loadData();
        } catch (error) {
            console.error('Error rejecting swap:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            await db.createSwapRequest({
                requester_id: profile.id,
                target_id: formData.target_id,
                schedule_id: formData.schedule_id,
                status: 'pending'
            });

            setIsModalOpen(false);
            setFormData({ schedule_id: '', target_id: '', reason: '' });
            loadData();
        } catch (error) {
            console.error('Error creating swap request:', error);
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: { class: 'badge-warning', label: 'Pending' },
            approved: { class: 'badge-success', label: 'Approved' },
            rejected: { class: 'badge-error', label: 'Rejected' }
        };
        return badges[status] || { class: 'badge-neutral', label: status };
    };

    const filteredRequests = swapRequests.filter(req => {
        if (filter === 'all') return true;
        return req.status === filter;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '50vh' }}>
                <div className="loading" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

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
                    <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                        <ArrowLeftRight size={18} />
                        Request Swap
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="card mb-lg">
                <div className="flex gap-md">
                    {['all', 'pending', 'approved', 'rejected'].map(status => (
                        <button
                            key={status}
                            className={`btn ${filter === status ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                            onClick={() => setFilter(status)}
                            style={{ textTransform: 'capitalize' }}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {/* Swap Requests */}
            <div className="card">
                {filteredRequests.length === 0 ? (
                    <div className="empty-state">
                        <ArrowLeftRight size={48} />
                        <h3>No Swap Requests</h3>
                        <p>
                            {filter === 'all'
                                ? 'There are no swap requests at the moment.'
                                : `No ${filter} swap requests.`
                            }
                        </p>
                    </div>
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
                                {filteredRequests.map((request) => {
                                    const statusInfo = getStatusBadge(request.status);

                                    return (
                                        <tr key={request.id}>
                                            <td>
                                                <div className="flex items-center gap-md">
                                                    <div className="user-avatar" style={{ width: 36, height: 36, fontSize: '0.85rem' }}>
                                                        {request.requester?.name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span>{request.requester?.name}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-md">
                                                    <User size={16} />
                                                    <span>{request.target?.name}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {request.schedules && (
                                                    <div className="flex flex-col gap-xs">
                                                        <div className="flex items-center gap-sm">
                                                            <Calendar size={14} />
                                                            {format(new Date(request.schedules.duty_date), 'MMM d, yyyy')}
                                                        </div>
                                                        <div className="flex items-center gap-sm text-muted text-sm">
                                                            <Clock size={14} />
                                                            {request.schedules.start_time} - {request.schedules.end_time}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-sm text-muted">
                                                {format(new Date(request.created_at), 'MMM d, h:mm a')}
                                            </td>
                                            <td>
                                                <span className={`badge ${statusInfo.class}`}>
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            {isAdmin && (
                                                <td>
                                                    {request.status === 'pending' && (
                                                        <div className="flex gap-sm">
                                                            <button
                                                                className="btn btn-sm btn-primary"
                                                                onClick={() => handleApprove(request.id)}
                                                            >
                                                                <Check size={14} />
                                                                Approve
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-danger"
                                                                onClick={() => handleReject(request.id)}
                                                            >
                                                                <X size={14} />
                                                                Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Request Swap Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Request Shift Swap"
            >
                <form onSubmit={handleSubmit}>
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
                                    {format(new Date(s.duty_date), 'MMM d')} - {s.start_time} to {s.end_time}
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

                    <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 'var(--space-lg)' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            <ArrowLeftRight size={18} />
                            Submit Request
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
