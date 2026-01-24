import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, isConfigured } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);

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
                    setUser(session.user);
                    setLoading(false); // Stop main loading immediately
                    // Load profile in background
                    loadProfile(session.user);
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
            setProfileLoading(true);
            try {
                // Try finding by ID first
                let { data } = await db.getPersonnelById(currentUser.id);

                // Fallback to email
                if (!data && currentUser.email) {
                    const { data: emailData } = await db.getPersonnelByEmail(currentUser.email);
                    data = emailData;
                }

                if (mounted) {
                    setProfile(data);
                }
            } catch (error) {
                console.error('Profile load error:', error);
                if (mounted) {
                    setProfile(null);
                }
            } finally {
                if (mounted) setProfileLoading(false);
            }
        }

        loadUserSession();

        const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
            console.log('Auth Change:', event);
            if (!mounted) return;

            if (session?.user) {
                setUser(session.user);
                if (event === 'SIGNED_IN') {
                    loadProfile(session.user);
                }
            } else {
                setUser(null);
                setProfile(null);
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
        profileLoading,
        signIn: async (email, password) => {
            const result = await auth.signIn(email, password);
            return result;
        },
        signUp: (email, password, meta) => auth.signUp(email, password, meta),
        signOut: async () => {
            await auth.signOut();
            setUser(null);
            setProfile(null);
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
