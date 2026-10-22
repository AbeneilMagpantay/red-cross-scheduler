import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/supabase';
import { Cross, Lock, Eye, EyeOff } from 'lucide-react';
import InlineAlert from '../components/InlineAlert';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isValidSession, setIsValidSession] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // A valid recovery link signs the user in with a temporary session.
        const checkSession = async () => {
            const { session } = await auth.getSession();
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

        if (password.length < 12) {
            setMessage({ type: 'error', text: 'Password must be at least 12 characters.' });
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
        } catch {
            setMessage({ type: 'error', text: 'An unexpected error occurred.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container is-single">
                <div className="login-card">
                    <div className="login-logo">
                        <div className="icon">
                            <Cross size={32} />
                        </div>
                        <h1>Reset Password</h1>
                        <p>Enter your new password below</p>
                    </div>

                    {message.text && <InlineAlert type={message.type} className="mb-lg">{message.text}</InlineAlert>}

                    {isValidSession && !message.text?.includes('successfully') && (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <div className="password-input">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        placeholder="Enter new password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={12}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                                    minLength={12}
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
