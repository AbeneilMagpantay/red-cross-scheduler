import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/supabase';
import { Cross, Lock, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isValidSession, setIsValidSession] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Check if user arrived via a recovery link (Supabase sets a session)
        const checkSession = async () => {
            const { data: { session } } = await auth.getSession();
            if (session) {
                setIsValidSession(true);
            } else {
                setMessage({
                    type: 'error',
                    text: 'Invalid or expired reset link. Please request a new one.'
                });
            }
        };
        checkSession();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (password.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }

        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        setLoading(true);

        try {
            const { error } = await auth.updatePassword(password);

            if (error) {
                setMessage({ type: 'error', text: error.message });
            } else {
                setMessage({ type: 'success', text: 'Password updated successfully! Redirecting...' });
                setTimeout(() => navigate('/'), 2000);
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'An unexpected error occurred.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-card">
                    <div className="login-logo">
                        <div className="icon">
                            <Cross size={32} />
                        </div>
                        <h1>Reset Password</h1>
                        <p>Enter your new password below</p>
                    </div>

                    {message.text && (
                        <div
                            style={{
                                padding: 'var(--space-md)',
                                marginBottom: 'var(--space-lg)',
                                borderRadius: 'var(--radius-md)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-sm)',
                                background: message.type === 'success'
                                    ? 'rgba(34, 197, 94, 0.15)'
                                    : 'rgba(239, 68, 68, 0.15)',
                                color: message.type === 'success'
                                    ? 'var(--success)'
                                    : 'var(--error)'
                            }}
                        >
                            {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                            {message.text}
                        </div>
                    )}

                    {isValidSession && !message.text?.includes('successfully') && (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        placeholder="Enter new password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: 'absolute',
                                            right: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-secondary)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Confirm Password</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="Confirm new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={6}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-full"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="loading" />
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <Lock size={18} />
                                        Set New Password
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {!isValidSession && (
                        <button
                            className="btn btn-secondary w-full"
                            onClick={() => navigate('/login')}
                        >
                            Back to Login
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
