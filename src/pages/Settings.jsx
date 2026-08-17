import { useState } from 'react';
import {
    AlertCircle,
    Bell,
    BellOff,
    BellRing,
    Check,
    Eye,
    EyeOff,
    Lock,
    Send,
    Smartphone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    disableDeploymentNotifications,
    enableDeploymentNotifications,
    getNotificationCapability,
    showTestNotification
} from '../lib/notifications';

export default function Settings() {
    const { user, profile, updatePassword } = useAuth();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [notificationState, setNotificationState] = useState(() => getNotificationCapability(user?.id));
    const [notificationLoading, setNotificationLoading] = useState(false);
    const [notificationMessage, setNotificationMessage] = useState({ type: '', text: '' });

    const handlePasswordChange = async (event) => {
        event.preventDefault();
        setMessage({ type: '', text: '' });

        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match.' });
            return;
        }

        setLoading(true);

        try {
            const { error } = await updatePassword(newPassword);

            if (error) {
                setMessage({ type: 'error', text: error.message });
            } else {
                setMessage({ type: 'success', text: 'Password updated successfully!' });
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch {
            setMessage({ type: 'error', text: 'An unexpected error occurred.' });
        } finally {
            setLoading(false);
        }
    };

    const handleEnableNotifications = async () => {
        setNotificationLoading(true);
        setNotificationMessage({ type: '', text: '' });

        try {
            const state = await enableDeploymentNotifications(user?.id);
            setNotificationState(state);
            setNotificationMessage({
                type: 'success',
                text: state.mode === 'background'
                    ? 'Background deployment notifications are enabled.'
                    : 'Live deployment notifications are enabled while the app is running.'
            });
        } catch (error) {
            setNotificationState(getNotificationCapability(user?.id));
            setNotificationMessage({ type: 'error', text: error.message });
        } finally {
            setNotificationLoading(false);
        }
    };

    const handleDisableNotifications = async () => {
        setNotificationLoading(true);
        setNotificationMessage({ type: '', text: '' });

        try {
            const state = await disableDeploymentNotifications(user?.id);
            setNotificationState(state);
            setNotificationMessage({ type: 'success', text: 'Deployment notifications are turned off.' });
        } catch (error) {
            setNotificationMessage({ type: 'error', text: error.message });
        } finally {
            setNotificationLoading(false);
        }
    };

    const handleTestNotification = async () => {
        setNotificationMessage({ type: '', text: '' });
        try {
            await showTestNotification(user?.id);
            setNotificationMessage({ type: 'success', text: 'Test notification sent to this device.' });
        } catch (error) {
            setNotificationMessage({ type: 'error', text: error.message });
        }
    };

    const notificationStatus = !notificationState.supported
        ? 'Unsupported'
        : notificationState.enabled
            ? 'Enabled'
            : notificationState.permission === 'denied'
                ? 'Blocked'
                : 'Off';

    return (
        <div className="settings-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">Manage your account and notification preferences</p>
                </div>
            </div>

            <div className="settings-grid mb-lg">
                <section className="card">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title">Account Information</h2>
                            <p className="card-subtitle">Your organization profile</p>
                        </div>
                    </div>
                    <dl className="account-details">
                        <div>
                            <dt>Email</dt>
                            <dd>{user?.email || 'Not available'}</dd>
                        </div>
                        <div>
                            <dt>Name</dt>
                            <dd>{profile?.name || 'Not set'}</dd>
                        </div>
                        <div>
                            <dt>Role</dt>
                            <dd className="capitalize">{profile?.role || 'Staff'}</dd>
                        </div>
                    </dl>
                </section>

                <section className="card notification-settings">
                    <div className="card-header">
                        <div>
                            <h2 className="card-title icon-title"><Bell size={20} /> Deployment Notifications</h2>
                            <p className="card-subtitle">Get notified when administrators add new duties</p>
                        </div>
                        <span className={`badge ${notificationState.enabled ? 'badge-success' : 'badge-neutral'}`}>
                            {notificationStatus}
                        </span>
                    </div>

                    <div className="notification-explainer">
                        <div className="notification-device-icon">
                            {notificationState.enabled ? <BellRing size={24} /> : <Smartphone size={24} />}
                        </div>
                        <p>
                            {!notificationState.supported
                                ? 'This browser does not support web notifications.'
                                : notificationState.backgroundConfigured
                                    ? 'Background alerts are available, even when the app is not open.'
                                    : 'Live alerts are available while the app is open. Background delivery requires the Web Push server keys.'}
                        </p>
                    </div>

                    {notificationMessage.text && (
                        <div className={`inline-alert ${notificationMessage.type}`} role="status">
                            {notificationMessage.type === 'success' ? <Check size={17} /> : <AlertCircle size={17} />}
                            {notificationMessage.text}
                        </div>
                    )}

                    <div className="settings-actions">
                        {notificationState.enabled ? (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleDisableNotifications}
                                disabled={notificationLoading}
                            >
                                <BellOff size={17} /> Turn Off
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleEnableNotifications}
                                disabled={notificationLoading || !notificationState.supported}
                            >
                                {notificationLoading ? <span className="loading" /> : <Bell size={17} />}
                                Enable Notifications
                            </button>
                        )}
                        {notificationState.enabled && (
                            <button type="button" className="btn btn-ghost" onClick={handleTestNotification}>
                                <Send size={17} /> Send Test
                            </button>
                        )}
                    </div>

                    <p className="settings-hint">
                        On iPhone or iPad, install the site to your Home Screen to receive background Web Push alerts.
                    </p>
                </section>
            </div>

            <section className="card password-card">
                <div className="card-header">
                    <div>
                        <h2 className="card-title icon-title"><Lock size={20} /> Change Password</h2>
                        <p className="card-subtitle">Use at least six characters</p>
                    </div>
                </div>

                {message.text && (
                    <div className={`inline-alert ${message.type}`} role="status">
                        {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                        {message.text}
                    </div>
                )}

                <form onSubmit={handlePasswordChange}>
                    <div className="password-fields">
                        <div className="form-group">
                            <label className="form-label">New Password</label>
                            <div className="password-input">
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    className="form-input"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    placeholder="Enter new password"
                                    autoComplete="new-password"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                                >
                                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirm New Password</label>
                            <div className="password-input">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    className="form-input"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    placeholder="Confirm new password"
                                    autoComplete="new-password"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                                >
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? <span className="loading" /> : <Lock size={18} />}
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                </form>
            </section>
        </div>
    );
}
