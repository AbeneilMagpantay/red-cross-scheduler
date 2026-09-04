import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { auth, db, isConfigured } from '../lib/supabase';
import { roleCanEditArc, roleCanViewArc } from '../lib/arc';

const AuthContext = createContext({});

// The hook intentionally lives beside its provider to keep authentication
// consumption consistent throughout this small application.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [accountRequest, setAccountRequest] = useState(null);
    const [profileError, setProfileError] = useState('');
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);
    const activeUserIdRef = useRef(null);
    const activeUserRef = useRef(null);
    const profileUserIdRef = useRef(null);
    const profileRequestRef = useRef(null);
    const loadProfileRef = useRef(null);

    useEffect(() => {
        if (!isConfigured) {
            setLoading(false);
            return;
        }

        let mounted = true;

        async function loadUserSession() {
            try {
                const { session, error } = await auth.getSession();
                if (error) throw error;

                if (mounted && session?.user) {
                    activeUserIdRef.current = session.user.id;
                    activeUserRef.current = session.user;
                    setUser(session.user);
                    setLoading(false); // Stop main loading immediately
                    loadProfile(session.user, { blocking: true });
                } else if (mounted) {
                    activeUserIdRef.current = null;
                    activeUserRef.current = null;
                    setLoading(false);
                }
            } catch (error) {
                console.error('Session load error:', error);
                if (mounted) setLoading(false);
            }
        }

        const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

        async function fetchProfile(currentUser) {
            const byId = await db.getPersonnelById(currentUser.id);
            if (byId.error) throw byId.error;
            if (byId.data) return { profile: byId.data, accountRequest: null };

            if (currentUser.email) {
                const byEmail = await db.getPersonnelByEmail(currentUser.email);
                if (byEmail.error) throw byEmail.error;
                if (byEmail.data) return { profile: byEmail.data, accountRequest: null };
            }

            const requestResult = await db.getMyAccountRequest(currentUser.id);
            if (requestResult.error) throw requestResult.error;
            return { profile: null, accountRequest: requestResult.data || null };
        }

        async function loadProfile(currentUser, { blocking = false, force = false } = {}) {
            if (!currentUser) return;
            if (profileRequestRef.current?.userId === currentUser.id && !force) return;

            const shouldBlock = blocking || profileUserIdRef.current !== currentUser.id;
            const request = { userId: currentUser.id };
            profileRequestRef.current = request;
            if (shouldBlock) setProfileLoading(true);
            setProfileError('');

            try {
                let result;
                let lastError;

                // A profile lookup can briefly fail while a mobile browser is
                // restoring its connection. Retry before deciding that an
                // authenticated account has no Personnel record.
                for (let attempt = 0; attempt < 3; attempt += 1) {
                    try {
                        result = await fetchProfile(currentUser);
                        break;
                    } catch (error) {
                        lastError = error;
                        if (attempt < 2) await wait(400 * (attempt + 1));
                    }
                }
                if (!result) throw lastError || new Error('Unable to load your account profile.');

                if (mounted && activeUserIdRef.current === currentUser.id && profileRequestRef.current === request) {
                    setProfile(result.profile);
                    setAccountRequest(result.accountRequest);
                    profileUserIdRef.current = currentUser.id;
                }
            } catch (error) {
                console.error('Profile load error:', error);
                if (mounted && shouldBlock && activeUserIdRef.current === currentUser.id && profileRequestRef.current === request) {
                    setProfileError(error?.message || 'Your account could not be verified. Please try again.');
                }
            } finally {
                if (profileRequestRef.current === request) {
                    profileRequestRef.current = null;
                }
                if (mounted && shouldBlock && activeUserIdRef.current === currentUser.id && profileRequestRef.current === null) {
                    setProfileLoading(false);
                }
            }
        }

        loadProfileRef.current = loadProfile;

        loadUserSession();

        const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
            console.log('Auth Change:', event);
            if (!mounted) return;

            if (session?.user) {
                const hasCurrentProfile = profileUserIdRef.current === session.user.id;
                activeUserIdRef.current = session.user.id;
                activeUserRef.current = session.user;
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
                activeUserRef.current = null;
                profileUserIdRef.current = null;
                profileRequestRef.current = null;
                setUser(null);
                setProfile(null);
                setAccountRequest(null);
                setProfileError('');
                setProfileLoading(false);
            }
        });

        const unsubscribeAccountRequests = db.subscribeAccountRequests((payload) => {
            const currentUser = activeUserRef.current;
            const changedUserId = payload.new?.user_id || payload.old?.user_id;
            if (currentUser && changedUserId === currentUser.id) {
                loadProfile(currentUser, { blocking: true, force: true });
            }
        });

        const refreshVisibleProfile = () => {
            if (document.visibilityState !== 'visible' || !activeUserIdRef.current) return;
            const currentUser = activeUserRef.current;
            if (!currentUser) return;
            loadProfile(currentUser);
        };
        document.addEventListener('visibilitychange', refreshVisibleProfile);

        return () => {
            mounted = false;
            profileRequestRef.current = null;
            loadProfileRef.current = null;
            subscription?.unsubscribe();
            unsubscribeAccountRequests();
            document.removeEventListener('visibilitychange', refreshVisibleProfile);
        };
    }, []); // Session ownership is intentionally established once per app load.

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
            activeUserRef.current = null;
            profileUserIdRef.current = null;
            profileRequestRef.current = null;
            setUser(null);
            setProfile(null);
            setAccountRequest(null);
            setProfileError('');
            setProfileLoading(false);
        },
        updatePassword: (newPassword) => auth.updatePassword(newPassword),
        isAdmin,
        isOfficer,
        canManageSchedule: isAdmin || isOfficer,
        canAccessArc: roleCanViewArc(profile?.role),
        canEditArc: roleCanEditArc(profile?.role),
        accountRequest,
        profileError,
        refreshProfile: () => {
            if (!user || !loadProfileRef.current) return Promise.resolve();
            return loadProfileRef.current(user, { blocking: true, force: true });
        },
        configError: !isConfigured
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
