import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, isConfigured } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Initialize state from existing session if available (before effect)
    // This helps react fast on reload
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (!isConfigured) {
            setLoading(false);
            return;
        }

        let mounted = true;

        async function loadUserSession() {
            try {
                // 1. Get session
                const { data: { session } } = await auth.getSession();

                if (mounted && session?.user) {
                    setUser(session.user);
                    // 2. Fetch profile in background
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
                    // Only set loading to false after we attempted profile load
                    setLoading(false);
                }
            } catch (error) {
                console.error('Profile load error:', error);
                if (mounted) setLoading(false);
            }
        }

        // Start loading
        loadUserSession();

        // Listen for changes
        const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
            console.log('Auth Change:', event);
            if (!mounted) return;

            if (session?.user) {
                setUser(session.user);
                // On initial load, loadUserSession handles profile. 
                // We only need to trigger loadProfile here for SIGNED_IN or TOKEN_REFRESHED explicitly if needed
                // But for simplicity, let's just re-fetch profile if we have a user and no profile, or if it changed
                if (event === 'SIGNED_IN') {
                    setLoading(true);
                    loadProfile(session.user);
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
        signIn: (email, password) => auth.signIn(email, password),
        signUp: (email, password, meta) => auth.signUp(email, password, meta),
        signOut: async () => {
            await auth.signOut();
            setUser(null);
            setProfile(null);
        },
        isAdmin: profile?.role === 'admin'
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
