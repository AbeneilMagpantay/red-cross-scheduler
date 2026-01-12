import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, isConfigured } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState(false);

    useEffect(() => {
        if (!isConfigured) {
            setLoading(false);
            return;
        }

        let mounted = true;

        async function loadUserSession() {
            try {
                const { data: { session } } = await auth.getSession();

                if (mounted && session?.user) {
                    setUser(session.user);
                    await loadProfile(session.user);
                } else if (mounted) {
                    setLoading(false);
                }
            } catch (error) {
                console.error('Session load error:', error);
                if (mounted) setLoading(false);
            }
        }

        async function loadProfile(currentUser) {
            if (!currentUser) return;
            try {
                // Try finding by ID first
                let { data } = await db.getPersonnelById(currentUser.id);

                // Fallback to email
                if (!data && currentUser.email) {
                    const { data: emailData } = await db.getPersonnelByEmail(currentUser.email);
                    data = emailData;
                }

                if (mounted) {
                    if (data && data.is_active !== false) {
                        // Valid active personnel record found
                        setProfile(data);
                        setAccessDenied(false);
                    } else {
                        // No personnel record or inactive - deny access
                        console.log('Access denied: No valid personnel record');
                        setProfile(null);
                        setAccessDenied(true);
                        // Sign out the user
                        await auth.signOut();
                        setUser(null);
                    }
                    setLoading(false);
                }
            } catch (error) {
                console.error('Profile load error:', error);
                if (mounted) setLoading(false);
            }
        }

        loadUserSession();

        const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
            console.log('Auth Change:', event);
            if (!mounted) return;

            if (session?.user) {
                setUser(session.user);
                if (event === 'SIGNED_IN') {
                    setLoading(true);
                    await loadProfile(session.user);
                }
            } else {
                setUser(null);
                setProfile(null);
                setLoading(false);
            }
        });

        return () => {
            mounted = false;
            subscription?.unsubscribe();
        };
    }, []);

    const value = {
        user,
        profile,
        loading,
        accessDenied,
        signIn: async (email, password) => {
            const result = await auth.signIn(email, password);
            return result;
        },
        signUp: (email, password, meta) => auth.signUp(email, password, meta),
        signOut: async () => {
            await auth.signOut();
            setUser(null);
            setProfile(null);
            setAccessDenied(false);
        },
        updatePassword: (newPassword) => auth.updatePassword(newPassword),
        isAdmin: profile?.role === 'admin'
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
