import { useState, useEffect } from 'react';
import { db } from '../lib/supabase';
import Modal from '../components/Modal';
import InlineAlert from '../components/InlineAlert';
import { useConfirm, useToast } from '../components/feedback';
import {
    Plus,
    Search,
    Edit2,
    Archive,
    RotateCcw,
    Phone,
    Mail,
    User,
    Clock3,
    UserCheck,
    UserX
} from 'lucide-react';
import { format } from 'date-fns';
import { EmptyState, PageLoader, StatusBadge } from '../components/ui';
import { getRoleLabel } from '../lib/status';

const getPersonnelData = (formData) => ({
    ...formData,
    email: formData.email.trim().toLowerCase()
});

export default function Personnel() {
    const confirm = useConfirm();
    const toast = useToast();
    const [personnel, setPersonnel] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [accountRequests, setAccountRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDept, setFilterDept] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPerson, setEditingPerson] = useState(null);
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'volunteer',
        department_id: '',
        is_active: true,
        license_type: '',
        license_expiry: ''
    });

    useEffect(() => {
        loadData();
        return db.subscribeAccountRequests(loadData);
    }, []);

    const loadData = async () => {
        try {
            const [personnelRes, deptRes, requestRes] = await Promise.all([
                db.getPersonnel(),
                db.getDepartments(),
                db.getAccountRequests('pending')
            ]);

            const loadFailure = personnelRes.error || deptRes.error || requestRes.error;
            if (loadFailure) throw loadFailure;
            setPersonnel(personnelRes.data || []);
            setDepartments(deptRes.data || []);
            setAccountRequests(requestRes.data || []);
            setLoadError('');
        } catch (error) {
            console.error('Error loading data:', error);
            setLoadError(error.message || 'Personnel could not be loaded.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (person = null) => {
        setError('');
        if (person) {
            setEditingPerson(person);
            setFormData({
                name: person.name,
                email: person.email || '',
                phone: person.phone || '',
                role: person.role,
                department_id: person.department_id || '',
                is_active: person.is_active,
                license_type: person.license_type || '',
                license_expiry: person.license_expiry || ''
            });
        } else {
            setEditingPerson(null);
            setFormData({
                name: '',
                email: '',
                phone: '',
                role: 'volunteer',
                department_id: '',
                is_active: true,
                license_type: '',
                license_expiry: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingPerson(null);
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);

        try {
            if (editingPerson) {
                const { error: updateError } = await db.updatePersonnel(editingPerson.id, getPersonnelData(formData));
                if (updateError) throw updateError;
                toast.success(`${formData.name} was updated.`);
            } else {
                const { error: createError } = await db.createPersonnel(getPersonnelData(formData));
                if (createError) throw createError;
                toast.success('Personnel record added. They can request their own login from the sign-in page.');
            }
            handleCloseModal();
            loadData();
        } catch (error) {
            console.error('Error saving personnel:', error);
            setError(error.message || 'Changes could not be saved. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Runs a record action and reports the outcome as a toast.
    const runAction = async (action, successMessage, failureMessage) => {
        setSaving(true);
        try {
            const { error: actionError } = await action();
            if (actionError) throw actionError;
            toast.success(successMessage);
            await loadData();
        } catch (actionError) {
            console.error(failureMessage, actionError);
            toast.error(`${failureMessage} ${actionError.message || ''}`.trim());
        } finally {
            setSaving(false);
        }
    };

    const handleArchive = async (person) => {
        const confirmed = await confirm({
            title: `Archive ${person.name}?`,
            message: 'They will lose access, but all of their schedules and attendance history will be kept.',
            confirmLabel: 'Archive',
            tone: 'danger'
        });
        if (!confirmed) return;
        await runAction(() => db.archivePersonnel(person.id), `${person.name} was archived.`, 'Could not archive this person.');
    };

    const handleApproveRequest = async (request) => {
        const confirmed = await confirm({
            title: `Approve ${request.name || request.email}?`,
            message: 'They will join as a Volunteer. You can promote them to Officer afterward.',
            confirmLabel: 'Approve'
        });
        if (!confirmed) return;
        await runAction(() => db.approveAccountRequest(request.user_id), `${request.name || request.email} was approved.`, 'Could not approve this request.');
    };

    const handleRejectRequest = async (request) => {
        const confirmed = await confirm({
            title: `Decline ${request.name || request.email}?`,
            message: 'Their account request will be declined.',
            confirmLabel: 'Decline',
            tone: 'danger'
        });
        if (!confirmed) return;
        await runAction(() => db.rejectAccountRequest(request.user_id), 'The account request was declined.', 'Could not decline this request.');
    };

    const handleRestore = async (person) => {
        const confirmed = await confirm({
            title: `Restore ${person.name}?`,
            message: 'They will become active personnel again.',
            confirmLabel: 'Restore'
        });
        if (!confirmed) return;
        await runAction(() => db.restorePersonnel(person.id), `${person.name} was restored.`, 'Could not restore this person.');
    };

    const filteredPersonnel = personnel.filter(person => {
        const matchesSearch = person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            person.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = !filterDept || person.department_id === filterDept;
        const matchesStatus = filterStatus === 'all'
            || (filterStatus === 'active' && person.is_active)
            || (filterStatus === 'archived' && !person.is_active);
        return matchesSearch && matchesDept && matchesStatus;
    });

    if (loading) return <PageLoader label="Loading personnel…" />;

    return (
        <div className="personnel-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Personnel Management</h1>
                    <p className="page-subtitle">Manage active and archived volunteers, officers, and administrators</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} />
                    Add Personnel
                </button>
            </div>

            {loadError && <InlineAlert type="error" className="mb-lg">{loadError}</InlineAlert>}

            <div className="card mb-lg">
                <div className="flex gap-md personnel-filters">
                    <div className="search-field">
                        <Search size={18} aria-hidden="true" />
                        <input
                            type="search"
                            className="form-input"
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Search personnel"
                        />
                    </div>
                    <select
                        className="form-select filter-select"
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                        aria-label="Filter by batch"
                    >
                        <option value="">All Batches</option>
                        {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                    </select>
                    <select
                        className="form-select filter-select"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        aria-label="Filter personnel status"
                    >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>
            </div>

            {accountRequests.length > 0 && (
                <section className="card account-requests-card mb-lg">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title"><Clock3 size={20} /> Account approvals</h2>
                            <p className="card-subtitle">Review new members before they can enter the workspace.</p>
                        </div>
                        <span className="badge badge-warning">{accountRequests.length} pending</span>
                    </div>
                    <div className="account-request-list">
                        {accountRequests.map((request) => (
                            <article className="account-request-row" key={request.user_id}>
                                <div className="user-avatar">{request.name?.charAt(0).toUpperCase() || 'U'}</div>
                                <div className="account-request-copy">
                                    <strong>{request.name || 'New member'}</strong>
                                    <span>{request.email}</span>
                                    <small>Requested {format(new Date(request.created_at), 'MMM d, yyyy · h:mm a')}</small>
                                </div>
                                <div className="account-request-actions">
                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleApproveRequest(request)} disabled={saving}><UserCheck size={16} /> Approve</button>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRejectRequest(request)} disabled={saving}><UserX size={16} /> Decline</button>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            )}

            <div className="card">
                {filteredPersonnel.length === 0 ? (
                    <EmptyState icon={User} title="No Personnel Found">Add new personnel or adjust your filters.</EmptyState>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Contact</th>
                                    <th>Role</th>
                                    <th>Batch Name</th>
                                    <th>Status</th>
                                    <th className="col-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPersonnel.map((person) => (
                                    <tr key={person.id}>
                                        <td data-label="Name">
                                            <div className="flex items-center gap-md">
                                                <div className="user-avatar sm">{person.name.charAt(0).toUpperCase()}</div>
                                                <span>{person.name}</span>
                                            </div>
                                        </td>
                                        <td data-label="Contact">
                                            <div className="flex flex-col gap-xs">
                                                {person.email && (
                                                    <div className="flex items-center gap-sm text-sm">
                                                        <Mail size={14} />
                                                        {person.email}
                                                    </div>
                                                )}
                                                {person.phone && (
                                                    <div className="flex items-center gap-sm text-sm text-muted">
                                                        <Phone size={14} />
                                                        {person.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td data-label="Role">
                                            <StatusBadge tone="info" label={getRoleLabel(person.role)} />
                                        </td>
                                        <td data-label="Batch">{person.departments?.name || '—'}</td>
                                        <td data-label="Status">
                                            <StatusBadge tone={person.is_active ? 'success' : 'neutral'} label={person.is_active ? 'Active' : 'Archived'} />
                                        </td>
                                        <td data-label="Actions">
                                            <div className="flex gap-sm">
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleOpenModal(person)}
                                                    title="Edit personnel"
                                                    aria-label={`Edit ${person.name}`}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                {person.is_active ? (
                                                    <button
                                                        className="btn btn-ghost btn-sm tone-warning"
                                                        onClick={() => handleArchive(person)}
                                                        disabled={saving}
                                                        title="Archive personnel"
                                                        aria-label={`Archive ${person.name}`}
                                                    >
                                                        <Archive size={16} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn btn-ghost btn-sm tone-success"
                                                        onClick={() => handleRestore(person)}
                                                        disabled={saving}
                                                        title="Restore personnel"
                                                        aria-label={`Restore ${person.name}`}
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingPerson ? 'Edit Personnel' : 'Add New Personnel'}
            >
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name *</label>
                        <input
                            type="text"
                            className="form-input"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                            type="email"
                            className="form-input"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Phone Number</label>
                        <input
                            type="tel"
                            className="form-input"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Role *</label>
                        <select
                            className="form-select"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            required
                        >
                            <option value="volunteer">Volunteer</option>
                            <option value="officer">Officer</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Batch Name</label>
                        <select
                            className="form-select"
                            value={formData.department_id}
                            onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                        >
                            <option value="">Select Batch</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-md form-row">
                        <div className="form-group">
                            <label className="form-label">License Type</label>
                            <select
                                className="form-select"
                                value={formData.license_type}
                                onChange={(e) => setFormData({ ...formData, license_type: e.target.value })}
                            >
                                <option value="">Select License Type</option>
                                <option value="SFAT">SFAT</option>
                                <option value="EFAT">EFAT</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">License Expiry</label>
                            <label className="checkbox-field compact">
                                <input
                                    type="checkbox"
                                    checked={formData.license_expiry === 'N/A'}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        license_expiry: e.target.checked ? 'N/A' : ''
                                    })}
                                />
                                <span>N/A</span>
                            </label>
                            {formData.license_expiry !== 'N/A' && (
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.license_expiry}
                                    onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                                    aria-label="License expiry date"
                                />
                            )}
                        </div>
                    </div>

                    {!editingPerson && (
                        <p className="personnel-account-note">Login accounts are now created by members from the sign-in page and activated after administrator approval.</p>
                    )}

                    <div className="form-group">
                        <label className="checkbox-field">
                            <input
                                type="checkbox"
                                checked={formData.is_active}
                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                            />
                            <span>Active Personnel</span>
                        </label>
                    </div>

                    {error && <InlineAlert type="error">{error}</InlineAlert>}

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="loading" />}
                            {saving ? 'Saving…' : editingPerson ? 'Save Changes' : 'Add Personnel'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
