import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/supabase';
import { AlertTriangle, BellRing, CalendarCheck2, Check, ShieldCheck, Sparkles } from 'lucide-react';
import logoNew from '../assets/logo_new.png';

function GoogleIcon() {
    return (
        <svg className="google-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.29-2.65l-3.57-2.77c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.29-1.94-6.16-4.54H2.15v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.15A11 11 0 0 0 1 12c0 1.77.42 3.44 1.15 4.93l3.69-2.84Z" />
            <path fill="#EA4335" d="M12 5.37c1.62 0 3.06.56 4.2 1.64l3.15-3.15A10.55 10.55 0 0 0 12 1 11 11 0 0 0 2.15 7.07l3.69 2.84c.87-2.6 3.3-4.54 6.16-4.54Z" />
        </svg>
    );
}

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const { signIn, signInWithGoogle, configError } = useAuth();
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
        } catch {
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
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setGoogleLoading(true);

        try {
            const { error: googleError } = await signInWithGoogle();
            if (googleError) setError(googleError.message);
        } catch {
            setError('Google sign-in could not be started. Please try again.');
        } finally {
            setGoogleLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <section className="login-story" aria-label="Platform highlights">
                    <div className="login-story-badge">
                        <Sparkles size={15} /> Volunteer operations, simplified
                    </div>
                    <h2>Ready when every second counts.</h2>
                    <p>
                        One calm, connected workspace for schedules, attendance, and the people
                        who make every deployment possible.
                    </p>
                    <div className="login-story-features">
                        <div>
                            <CalendarCheck2 size={20} />
                            <span><strong>Clear schedules</strong>Know where you need to be.</span>
                        </div>
                        <div>
                            <BellRing size={20} />
                            <span><strong>Timely alerts</strong>Never miss a new deployment.</span>
                        </div>
                        <div>
                            <ShieldCheck size={20} />
                            <span><strong>Protected access</strong>Only registered members get in.</span>
                        </div>
                    </div>
                </section>

                <div className="login-card">
                    <div className="login-logo">
                        <img
                            src={logoNew}
                            alt="Ateneo College Red Cross Youth"
                            className="login-logo-image"
                        />
                        <span className="login-eyebrow">Member portal</span>
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
                        <div>
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

                            <button
                                type="button"
                                className="btn btn-google btn-lg w-full"
                                onClick={handleGoogleSignIn}
                                disabled={googleLoading || loading || configError}
                            >
                                {googleLoading ? (
                                    <>
                                        <div className="loading" />
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        <GoogleIcon />
                                        <span>Continue with Google</span>
                                    </>
                                )}
                            </button>

                            <p className="login-access-note">
                                Use the same email as your registered personnel account. Your duty history stays connected.
                            </p>

                            <div className="login-divider"><span>or use your password</span></div>

                            <form onSubmit={handleSubmit}>
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
                                        autoComplete="current-password"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="btn btn-primary btn-lg w-full"
                                    disabled={loading || googleLoading || configError}
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
                        </div>
                    )}

                    <p className="text-center text-muted text-sm mt-lg">
                        Contact your administrator for access
                    </p>
                </div>
            </div>
        </div>
    );
}
