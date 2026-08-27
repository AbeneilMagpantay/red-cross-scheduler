import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { auth, db, isConfigured } from '../lib/supabase';
import { roleCanAccessArc } from '../lib/arc';

const AuthContext = createContext({});

// The hook intentionally lives beside its provider to keep authentication
// consumption consistent throughout this small application.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);
    const activeUserIdRef = useRef(null);
    const profileUserIdRef = useRef(null);
    const profileRequestRef = useRef(null);

    useEffect(() => {
        if (!isConfigured) {
            setLoading(false);
            return;
        }

        let mounted = true;

        async function loadUserSession() {
            try {
                const { session } = await auth.getSession();

                if (mounted && session?.user) {
                    activeUserIdRef.current = session.user.id;
                    setUser(session.user);
                    setLoading(false); // Stop main loading immediately
                    loadProfile(session.user, { blocking: true });
                } else if (mounted) {
                    activeUserIdRef.current = null;
                    setLoading(false);
                }
            } catch (error) {
                console.error('Session load error:', error);
                if (mounted) setLoading(false);
            }
        }

        async function loadProfile(currentUser, { blocking = false } = {}) {
            if (!currentUser) return;
            if (profileRequestRef.current?.userId === currentUser.id) return;

            const shouldBlock = blocking || profileUserIdRef.current !== currentUser.id;
            const request = { userId: currentUser.id };
            profileRequestRef.current = request;
            if (shouldBlock) setProfileLoading(true);

            try {
                // Try finding by ID first
                let { data } = await db.getPersonnelById(currentUser.id);

                // Fallback to email
                if (!data && currentUser.email) {
                    const { data: emailData } = await db.getPersonnelByEmail(currentUser.email);
                    data = emailData;
                }

                if (mounted && activeUserIdRef.current === currentUser.id) {
                    setProfile(data);
                    profileUserIdRef.current = currentUser.id;
                }
            } catch (error) {
                console.error('Profile load error:', error);
                // Keep an already-loaded profile during a quiet refresh. A brief
                // network issue when returning to the tab should not unmount the
                // current page or close an in-progress dialog.
                if (mounted && shouldBlock && activeUserIdRef.current === currentUser.id) {
                    setProfile(null);
                }
            } finally {
                if (profileRequestRef.current === request) {
                    profileRequestRef.current = null;
                }
                if (mounted && shouldBlock && activeUserIdRef.current === currentUser.id) {
                    setProfileLoading(false);
                }
            }
        }

        loadUserSession();

        const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
            console.log('Auth Change:', event);
            if (!mounted) return;

            if (session?.user) {
                const hasCurrentProfile = profileUserIdRef.current === session.user.id;
                activeUserIdRef.current = session.user.id;
                setUser(session.user);

                if (!hasCurrentProfile) {
                    setProfile(null);
                    loadProfile(session.user, { blocking: true });
                } else if (event === 'SIGNED_IN') {
                    // Supabase also emits SIGNED_IN when an existing session is
                    // recovered after a tab becomes visible. Refresh quietly so
                    // the page and any open modal stay mounted.
                    loadProfile(session.user);
                }
            } else {
                activeUserIdRef.current = null;
                profileUserIdRef.current = null;
                profileRequestRef.current = null;
                setUser(null);
                setProfile(null);
                setProfileLoading(false);
            }
        });

        return () => {
            mounted = false;
            profileRequestRef.current = null;
            subscription?.unsubscribe();
        };
    }, []);

    const isAdmin = profile?.role === 'admin';
    const isOfficer = profile?.role === 'officer';

    const value = {
        user,
        profile,
        loading,
        profileLoading,
        signIn: async (email, password) => {
            const result = await auth.signIn(email, password);
            return result;
        },
        signInWithGoogle: () => auth.signInWithGoogle(),
        signUp: (email, password, meta) => auth.signUp(email, password, meta),
        signOut: async () => {
            await auth.signOut();
            activeUserIdRef.current = null;
            profileUserIdRef.current = null;
            profileRequestRef.current = null;
            setUser(null);
            setProfile(null);
            setProfileLoading(false);
        },
        updatePassword: (newPassword) => auth.updatePassword(newPassword),
        isAdmin,
        isOfficer,
        canAccessArc: roleCanAccessArc(profile?.role),
        configError: !isConfigured
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
