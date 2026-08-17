import { useState, useEffect } from 'react';
import { db, auth } from '../lib/supabase';
import Modal from '../components/Modal';
import {
    Plus,
    Search,
    Edit2,
    Archive,
    RotateCcw,
    Phone,
    Mail,
    User,
    Key,
    AlertCircle,
    CheckCircle
} from 'lucide-react';

const getPersonnelData = (formData) => {
    const personnelData = { ...formData };
    delete personnelData.password;
    delete personnelData.createAccount;
    if (personnelData.email) personnelData.email = personnelData.email.trim().toLowerCase();
    return personnelData;
};

export default function Personnel() {
    const [personnel, setPersonnel] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDept, setFilterDept] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPerson, setEditingPerson] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'volunteer',
        department_id: '',
        is_active: true,
        password: '',
        createAccount: true,
        license_type: '',
        license_expiry: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [personnelRes, deptRes] = await Promise.all([
                db.getPersonnel(),
                db.getDepartments()
            ]);

            setPersonnel(personnelRes.data || []);
            setDepartments(deptRes.data || []);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (person = null) => {
        setError('');
        setSuccess('');
        if (person) {
            setEditingPerson(person);
            setFormData({
                name: person.name,
                email: person.email || '',
                phone: person.phone || '',
                role: person.role,
                department_id: person.department_id || '',
                is_active: person.is_active,
                password: '',
                createAccount: false,
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
                password: '',
                createAccount: true,
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
        setSuccess('');
    };

    // Generate a random password
    const generatePassword = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
        let password = '';
        for (let i = 0; i < 12; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setFormData({ ...formData, password });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setSaving(true);

        try {
            if (editingPerson) {
                // Update existing personnel
                await db.updatePersonnel(editingPerson.id, getPersonnelData(formData));
                setSuccess('Personnel updated successfully!');
            } else {
                // Create new personnel
                if (formData.createAccount && formData.email) {
                    // First, create auth account
                    if (!formData.password) {
                        setError('Please enter a password for the account');
                        setSaving(false);
                        return;
                    }

                    // Call Auth SignUp
                    const { data: authData, error: authError } = await auth.signUp(
                        formData.email.trim().toLowerCase(),
                        formData.password,
                        { name: formData.name }
                    );

                    if (authError) {
                        setError(`Account creation failed: ${authError.message}`);
                        setSaving(false);
                        return;
                    }

                    // Create personnel record with the auth user's ID
                    const personnelWithId = {
                        ...getPersonnelData(formData),
                        id: authData.user?.id
                    };

                    const { error: dbError } = await db.createPersonnel(personnelWithId);
                    if (dbError) {
                        setError(`Personnel creation failed: ${dbError.message}`);
                        setSaving(false);
                        return;
                    }

                    setSuccess(`Account created! Temporary password: ${formData.password}`);
                } else {
                    // Create personnel without auth account
                    await db.createPersonnel(getPersonnelData(formData));
                    setSuccess('Personnel added successfully!');
                }
            }

            setTimeout(() => {
                if (!editingPerson || !formData.createAccount) { // Keep open if showing password
                    handleCloseModal();
                }
                loadData();
            }, 2000);
        } catch (error) {
            console.error('Error saving personnel:', error);
            setError('An error occurred. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleArchive = async (person) => {
        if (!confirm(`Archive ${person.name}? They will lose access, but all schedules and attendance history will be preserved.`)) return;

        try {
            const { error } = await db.archivePersonnel(person.id);
            if (error) {
                alert('Failed to archive personnel: ' + error.message);
                console.error('Archive error:', error);
                return;
            }
            loadData();
        } catch (error) {
            console.error('Error archiving personnel:', error);
            alert('An unexpected error occurred while archiving.');
        }
    };

    const handleRestore = async (person) => {
        if (!confirm(`Restore ${person.name} as active personnel?`)) return;

        try {
            const { error } = await db.restorePersonnel(person.id);
            if (error) {
                alert('Failed to restore personnel: ' + error.message);
                console.error('Restore error:', error);
                return;
            }
            loadData();
        } catch (error) {
            console.error('Error restoring personnel:', error);
            alert('An unexpected error occurred while restoring.');
        }
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

    if (loading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '50vh' }}>
                <div className="loading" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div className="personnel-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Personnel Management</h1>
                    <p className="page-subtitle">Manage active and archived volunteers and staff members</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} />
                    Add Personnel
                </button>
            </div>

            {/* Filters */}
            <div className="card mb-lg">
                <div className="flex gap-md personnel-filters" style={{ flexWrap: 'wrap' }}>
                    <div style={{ flex: '1', minWidth: '200px' }}>
                        <div style={{ position: 'relative' }}>
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
                                placeholder="Search by name or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ paddingLeft: '40px' }}
                            />
                        </div>
                    </div>
                    <select
                        className="form-select"
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                        style={{ width: '200px' }}
                    >
                        <option value="">All Batches</option>
                        {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                    </select>
                    <select
                        className="form-select"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        style={{ width: '160px' }}
                        aria-label="Filter personnel status"
                    >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>
            </div>

            {/* Personnel Table */}
            <div className="card">
                {filteredPersonnel.length === 0 ? (
                    <div className="empty-state">
                        <User size={48} />
                        <h3>No Personnel Found</h3>
                        <p>Add new personnel or adjust your filters.</p>
                    </div>
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
                                    <th style={{ width: '120px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPersonnel.map((person) => (
                                    <tr key={person.id}>
                                        <td data-label="Name">
                                            <div className="flex items-center gap-md">
                                                <div className="user-avatar" style={{ width: 36, height: 36, fontSize: '0.85rem' }}>
                                                    {person.name.charAt(0).toUpperCase()}
                                                </div>
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
                                            <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>
                                                {person.role}
                                            </span>
                                        </td>
                                        <td data-label="Batch">{person.departments?.name || '—'}</td>
                                        <td data-label="Status">
                                            <span className={`badge ${person.is_active ? 'badge-success' : 'badge-neutral'}`}>
                                                {person.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td data-label="Actions">
                                            <div className="flex gap-sm">
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleOpenModal(person)}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                {person.is_active ? (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => handleArchive(person)}
                                                        style={{ color: 'var(--warning)' }}
                                                        title="Archive personnel"
                                                        aria-label={`Archive ${person.name}`}
                                                    >
                                                        <Archive size={16} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => handleRestore(person)}
                                                        style={{ color: 'var(--success)' }}
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

            {/* Add/Edit Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingPerson ? 'Edit Personnel' : 'Add New Personnel'}
            >
                <form onSubmit={handleSubmit}>
                    {/* Error/Success Messages */}
                    {error && (
                        <div className="flex items-center gap-sm mb-md" style={{
                            padding: 'var(--space-md)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--error)'
                        }}>
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="flex items-center gap-sm mb-md" style={{
                            padding: 'var(--space-md)',
                            background: 'rgba(16, 185, 129, 0.1)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--success)'
                        }}>
                            <CheckCircle size={18} />
                            <span>{success}</span>
                        </div>
                    )}

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
                        <label className="form-label">Email Address {!editingPerson && formData.createAccount ? '*' : ''}</label>
                        <input
                            type="email"
                            className="form-input"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required={!editingPerson && formData.createAccount}
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
                            <option value="staff">Staff</option>
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
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">License Type</label>
                            <select
                                className="form-select"
                                value={formData.license_type}
                                onChange={(e) => setFormData({ ...formData, license_type: e.target.value })}
                            >
                                <option value="">Select License Type</option>
                                <option value="EMT">EMT</option>
                                <option value="BLS">BLS</option>
                                <option value="ALS">ALS</option>
                                <option value="N/A">N/A</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">License Expiry</label>
                            <label className="flex items-center gap-sm mb-sm" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.license_expiry === 'N/A'}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        license_expiry: e.target.checked ? 'N/A' : ''
                                    })}
                                    style={{ width: 16, height: 16 }}
                                />
                                <span>N/A</span>
                            </label>
                            {formData.license_expiry !== 'N/A' && (
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.license_expiry}
                                    onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                                />
                            )}
                        </div>
                    </div>

                    {/* Account Creation Section - Only for new personnel */}
                    {!editingPerson && (
                        <div className="form-group" style={{
                            padding: 'var(--space-md)',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            marginTop: 'var(--space-md)'
                        }}>
                            <label className="flex items-center gap-md mb-md" style={{ cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.createAccount}
                                    onChange={(e) => setFormData({ ...formData, createAccount: e.target.checked })}
                                    style={{ width: 18, height: 18 }}
                                />
                                <span style={{ fontWeight: 500 }}>
                                    <Key size={16} style={{ display: 'inline', marginRight: 8 }} />
                                    Create login account
                                </span>
                            </label>

                            {formData.createAccount && (
                                <div>
                                    <label className="form-label">Temporary Password *</label>
                                    <div className="flex gap-sm">
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="Enter password"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={generatePassword}
                                        >
                                            Generate
                                        </button>
                                    </div>
                                    <p className="text-sm text-muted mt-sm">
                                        Share this password with the new user. They can log in with their email and this password.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="flex items-center gap-md" style={{ cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={formData.is_active}
                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                style={{ width: 18, height: 18 }}
                            />
                            <span>Active Personnel</span>
                        </label>
                    </div>

                    <div className="modal-footer" style={{ padding: 0, border: 'none', marginTop: 'var(--space-lg)' }}>
                        <button type="button" className="btn btn-secondary" onClick={handleCloseModal} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? (
                                <>
                                    <div className="loading" style={{ width: 16, height: 16 }} />
                                    {editingPerson ? 'Saving...' : 'Creating...'}
                                </>
                            ) : (
                                editingPerson ? 'Save Changes' : 'Add Personnel'
                            )}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
