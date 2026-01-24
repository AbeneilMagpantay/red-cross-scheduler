import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isConfigured, auth } from '../lib/supabase';
import { AlertTriangle, Check } from 'lucide-react';
import logoNew from '../assets/logo_new.png';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const { signIn, configError } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const normalizedEmail = email.trim().toLowerCase();

        try {
            const { error: signInError } = await signIn(normalizedEmail, password);

            if (signInError) {
                setError(signInError.message);
            } else {
                navigate('/');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
            setError('Please enter your email address');
            setLoading(false);
            return;
        }

        try {
            const { error } = await auth.resetPasswordForEmail(normalizedEmail);
            if (error) {
                setError(error.message);
            } else {
                setSuccess('Password reset email sent! Check your inbox.');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-card">
                    <div className="login-logo">
                        <img
                            src={logoNew}
                            alt="Logo"
                            style={{
                                height: 80,
                                marginBottom: 'var(--space-md)',
                                margin: '0 auto var(--space-md) auto',
                                display: 'block'
                            }}
                        />
                        <h1>Ateneo College</h1>
                        <p>Red Cross Youth</p>
                    </div>

                    {configError && (
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            padding: 'var(--space-md)',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-lg)',
                            color: 'var(--warning)'
                        }}>
                            <div className="flex items-center gap-sm mb-sm">
                                <AlertTriangle size={18} />
                                <strong>Setup Required</strong>
                            </div>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Configure Supabase credentials in .env.local file.
                            </p>
                        </div>
                    )}

                    {showForgotPassword ? (
                        <form onSubmit={handleForgotPassword}>
                            <h3 style={{ marginBottom: 'var(--space-md)' }}>Reset Password</h3>

                            {error && (
                                <div className="form-error mb-lg" style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    padding: 'var(--space-md)',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center'
                                }}>
                                    {error}
                                </div>
                            )}

                            {success && (
                                <div style={{
                                    background: 'rgba(34, 197, 94, 0.15)',
                                    padding: 'var(--space-md)',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: 'var(--space-lg)',
                                    color: 'var(--success)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-sm)'
                                }}>
                                    <Check size={18} />
                                    {success}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-full mb-md"
                                disabled={loading}
                            >
                                {loading ? 'Sending...' : 'Send Reset Link'}
                            </button>

                            <button
                                type="button"
                                className="btn btn-ghost w-full"
                                onClick={() => {
                                    setShowForgotPassword(false);
                                    setError('');
                                    setSuccess('');
                                }}
                            >
                                Back to Login
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {error && (
                                <div className="form-error mb-lg" style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    padding: 'var(--space-md)',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center'
                                }}>
                                    {error}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    autoComplete="email"
                                    spellCheck="false"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Password</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-full"
                                disabled={loading || configError}
                            >
                                {loading ? (
                                    <>
                                        <div className="loading" />
                                        Signing in...
                                    </>
                                ) : (
                                    'Sign In'
                                )}
                            </button>

                            <button
                                type="button"
                                className="btn btn-ghost w-full mt-md"
                                onClick={() => {
                                    setShowForgotPassword(true);
                                    setError('');
                                }}
                            >
                                Forgot Password?
                            </button>
                        </form>
                    )}

                    <p className="text-center text-muted text-sm mt-lg">
                        Contact your administrator for access
                    </p>
                </div>
            </div>
        </div>
    );
}
