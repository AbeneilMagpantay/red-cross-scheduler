import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if Supabase is configured
export const isConfigured = !!(supabaseUrl && supabaseAnonKey &&
    supabaseUrl !== 'YOUR_SUPABASE_URL' &&
    supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY');

// Create client
export const supabase = isConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Auth helper functions
export const auth = {
    signUp: async (email, password, metadata = {}) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.auth.signUp({
            email,
            password,
            options: { data: metadata }
        });
    },
    signIn: async (email, password) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.auth.signInWithPassword({ email, password });
    },
    signOut: async () => {
        if (!supabase) return { error: null };
        return supabase.auth.signOut();
    },
    getUser: async () => {
        if (!supabase) return { user: null, error: null };
        const { data, error } = await supabase.auth.getUser();
        return { user: data.user, error };
    },
    getSession: async () => {
        if (!supabase) return { session: null, error: null };
        const { data, error } = await supabase.auth.getSession();
        return { session: data.session, error };
    },
    onAuthStateChange: (callback) => {
        if (!supabase) return { data: { subscription: { unsubscribe: () => { } } } };
        return supabase.auth.onAuthStateChange(callback);
    },
    updatePassword: async (newPassword) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.auth.updateUser({ password: newPassword });
    }
};

// Database helper functions
export const db = {
    // ===== USERS / PERSONNEL =====
    getPersonnel: async () => {
        if (!supabase) return { data: [], error: null };
        return supabase
            .from('personnel')
            .select('*, departments(name)')
            .order('name');
    },

    getPersonnelById: async (id) => {
        if (!supabase) return { data: null, error: null };
        return supabase
            .from('personnel')
            .select('*, departments(name)')
            .eq('id', id)
            .single();
    },

    getPersonnelByEmail: async (email) => {
        if (!supabase) return { data: null, error: null };
        return supabase
            .from('personnel')
            .select('*, departments(name)')
            .eq('email', email)
            .single();
    },

    createPersonnel: async (personnel) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('personnel').insert(personnel).select().single();
    },

    updatePersonnel: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('personnel').update(updates).eq('id', id).select().single();
    },

    deletePersonnel: async (id) => {
        if (!supabase) return { error: { message: 'Not configured' } };

        // Manual Cascade Delete
        try {
            // 1. Delete associated Swap Requests (as requester or target)
            await supabase.from('swap_requests').delete().or(`requester_id.eq.${id},target_id.eq.${id}`);

            // 2. Delete Attendance records
            await supabase.from('attendance').delete().eq('personnel_id', id);

            // 3. Delete Schedules (which will trigger its own cascade if we did it recursively, but let's be explicit)
            // First delete attendance/swaps linked to these schedules
            const { data: schedules } = await supabase.from('schedules').select('id').eq('personnel_id', id);
            if (schedules && schedules.length > 0) {
                const scheduleIds = schedules.map(s => s.id);
                await supabase.from('attendance').delete().in('schedule_id', scheduleIds);
                await supabase.from('swap_requests').delete().in('schedule_id', scheduleIds);
                await supabase.from('schedules').delete().in('id', scheduleIds);
            }

            // 4. Finally delete the personnel
            const { error } = await supabase.from('personnel').delete().eq('id', id);
            return { error };
        } catch (err) {
            console.error('Manual cascade delete error:', err);
            // Fallback to simple delete in case constraints are set up
            return supabase.from('personnel').delete().eq('id', id);
        }
    },

    // ===== DEPARTMENTS =====
    getDepartments: async () => {
        if (!supabase) return { data: [], error: null };
        return supabase.from('departments').select('*').order('name');
    },

    createDepartment: async (name) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('departments').insert({ name }).select().single();
    },

    // ===== SCHEDULES =====
    getSchedules: async (startDate, endDate) => {
        if (!supabase) return { data: [], error: null };
        let query = supabase.from('schedules').select('*, personnel(name, role)');
        if (startDate) query = query.gte('duty_date', startDate);
        if (endDate) query = query.lte('duty_date', endDate);
        return query.order('duty_date').order('start_time');
    },

    getSchedulesByPersonnel: async (personnelId) => {
        if (!supabase) return { data: [], error: null };
        return supabase
            .from('schedules')
            .select('*')
            .eq('personnel_id', personnelId)
            .order('duty_date');
    },

    createSchedule: async (schedule) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('schedules')
            .insert(schedule)
            .select('*, personnel(name, role)')
            .single();
    },

    updateSchedule: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('schedules').update(updates).eq('id', id).select().single();
    },

    deleteSchedule: async (id) => {
        if (!supabase) return { error: { message: 'Not configured' } };

        // Manual Cascade Delete
        try {
            await supabase.from('attendance').delete().eq('schedule_id', id);
            await supabase.from('swap_requests').delete().eq('schedule_id', id);
            const { error } = await supabase.from('schedules').delete().eq('id', id);
            return { error };
        } catch (err) {
            return supabase.from('schedules').delete().eq('id', id);
        }
    },

    // ===== ATTENDANCE =====
    getAttendance: async (date) => {
        if (!supabase) return { data: [], error: null };
        let query = supabase
            .from('attendance')
            .select('*, personnel(name), schedules(duty_date, start_time, end_time)');
        if (date) query = query.eq('schedules.duty_date', date);
        return query.order('created_at', { ascending: false });
    },

    createAttendance: async (attendance) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('attendance').insert(attendance).select().single();
    },

    updateAttendance: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('attendance').update(updates).eq('id', id).select().single();
    },

    // ===== SWAP REQUESTS =====
    getSwapRequests: async (status) => {
        if (!supabase) return { data: [], error: null };
        let query = supabase
            .from('swap_requests')
            .select(`
        *,
        requester:personnel!swap_requests_requester_id_fkey(name),
        target:personnel!swap_requests_target_id_fkey(name),
        schedules(duty_date, start_time, end_time)
      `);
        if (status) query = query.eq('status', status);
        return query.order('created_at', { ascending: false });
    },

    createSwapRequest: async (request) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('swap_requests').insert(request).select().single();
    },

    updateSwapRequest: async (id, status) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('swap_requests')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
    }
};

export default supabase;
