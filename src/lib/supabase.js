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
            options: {
                data: metadata,
                emailRedirectTo: `${window.location.origin}/`
            }
        });
    },
    signIn: async (email, password) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.auth.signInWithPassword({ email, password });
    },
    signInWithGoogle: async () => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/`,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'select_account'
                }
            }
        });
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
    },
    resetPasswordForEmail: async (email) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password'
        });
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
            .maybeSingle();
    },

    getPersonnelByEmail: async (email) => {
        if (!supabase) return { data: null, error: null };
        return supabase
            .from('personnel')
            .select('*, departments(name)')
            .ilike('email', email.trim())
            .maybeSingle();
    },

    createPersonnel: async (personnel) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('personnel').insert(personnel).select().single();
    },

    updatePersonnel: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('personnel').update(updates).eq('id', id).select().single();
    },

    archivePersonnel: async (id) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('personnel')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
    },

    restorePersonnel: async (id) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('personnel')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
    },

    // ===== ACCOUNT APPROVALS =====
    getMyAccountRequest: async (userId) => {
        if (!supabase || !userId) return { data: null, error: null };
        return supabase
            .from('account_requests')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
    },

    getAccountRequests: async (status = 'pending') => {
        if (!supabase) return { data: [], error: null };
        let query = supabase
            .from('account_requests')
            .select('*')
            .order('created_at', { ascending: true });
        if (status) query = query.eq('status', status);
        return query;
    },

    approveAccountRequest: async (userId) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.rpc('approve_account_request', { target_user_id: userId });
    },

    rejectAccountRequest: async (userId) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.rpc('reject_account_request', { target_user_id: userId });
    },

    subscribeAccountRequests: (callback) => {
        if (!supabase) return () => {};
        const channel = supabase
            .channel(`account-requests-${globalThis.crypto?.randomUUID?.() || Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'account_requests' }, callback)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
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
    getSchedules: async (startDate, endDate, includeUnassigned = false) => {
        if (!supabase) return { data: [], error: null };
        let query = supabase
            .from('schedules')
            .select('*, personnel(name, role), attendance(id, status, check_in, check_out)');
        if (startDate) query = query.gte('duty_date', startDate);
        if (endDate) query = query.lte('duty_date', endDate);
        if (!includeUnassigned) query = query.not('personnel_id', 'is', null);
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
            .select('*, personnel(name, role), attendance(id, status, check_in, check_out)')
            .single();
    },

    createSchedules: async (schedules) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        if (!schedules?.length) return { data: [], error: null };
        return supabase
            .from('schedules')
            .insert(schedules)
            .select('*, personnel(name, role), attendance(id, status, check_in, check_out)');
    },

    getDutyTeams: async (eventIds = []) => {
        if (!supabase || !eventIds.length) return { data: [], error: null };
        return supabase
            .from('duty_teams')
            .select('*')
            .in('event_id', eventIds)
            .order('sort_order')
            .order('created_at');
    },

    createDutyTeams: async (teams) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        if (!teams?.length) return { data: [], error: null };
        return supabase
            .from('duty_teams')
            .insert(teams)
            .select('*');
    },

    createDutyTeam: async (team) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('duty_teams').insert(team).select('*').single();
    },

    updateDutyTeam: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('duty_teams').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    },

    deleteDutyTeam: async (id) => {
        if (!supabase) return { error: { message: 'Not configured' } };

        const { error: assignmentError } = await supabase
            .from('schedules')
            .update({ team_id: null, team_station: null, assignment_role: null })
            .eq('team_id', id);
        if (assignmentError) return { error: assignmentError };

        const { error } = await supabase.from('duty_teams').delete().eq('id', id);
        return { error };
    },

    sendDeploymentNotification: async (scheduleId) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.functions.invoke('send-deployment-notifications', {
            body: { schedule_id: scheduleId }
        });
    },

    sendArcAnnouncementNotification: async (announcementId) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.functions.invoke('send-deployment-notifications', {
            body: { announcement_id: announcementId }
        });
    },

    updateSchedule: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('schedules')
            .update(updates)
            .eq('id', id)
            .select('*, personnel(name, role), attendance(id, status, check_in, check_out)')
            .single();
    },

    updateEvent: async (eventId, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('schedules')
            .update(updates)
            .eq('event_id', eventId)
            .select('*, personnel(name, role), attendance(id, status, check_in, check_out)');
    },

    deleteSchedule: async (id) => {
        if (!supabase) return { error: { message: 'Not configured' } };
        const { error } = await supabase.from('schedules').delete().eq('id', id);
        return { error };
    },

    deleteEvent: async (eventId) => {
        if (!supabase) return { error: { message: 'Not configured' } };

        const { error } = await supabase.from('schedules').delete().eq('event_id', eventId);
        return { error };
    },

    // ===== ARC / NEXUS =====
    getArcResources: async () => {
        if (!supabase) return { data: [], error: null };
        return supabase
            .from('arc_resources')
            .select('*')
            .order('sort_order')
            .order('created_at');
    },

    createArcResource: async (resource) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('arc_resources').insert(resource).select('*').single();
    },

    upsertArcResource: async (resource) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('arc_resources')
            .upsert(resource, { onConflict: 'legacy_id' })
            .select('*')
            .single();
    },

    updateArcResource: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('arc_resources').update(updates).eq('id', id).select('*').single();
    },

    deleteArcResource: async (id) => {
        if (!supabase) return { error: { message: 'Not configured' } };
        const { error } = await supabase.from('arc_resources').delete().eq('id', id);
        return { error };
    },

    reorderArcResources: async (resources, personnelId) => {
        if (!supabase) return { error: { message: 'Not configured' } };
        const results = await Promise.all(resources.map((resource, index) => (
            supabase
                .from('arc_resources')
                .update({ sort_order: index, updated_by: personnelId || null })
                .eq('id', resource.id)
        )));
        return { error: results.find((result) => result.error)?.error || null };
    },

    uploadArcQrImage: async (resourceId, file, options = {}) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        const extensionByType = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/webp': 'webp'
        };
        const extension = extensionByType[file.type];
        if (!extension) return { data: null, error: { message: 'Only PNG, JPEG, and WebP images are allowed.' } };
        const path = options.path || `${resourceId}/${globalThis.crypto?.randomUUID?.() || Date.now()}.${extension}`;
        const { error } = await supabase.storage.from('arc-resource-qr').upload(path, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: Boolean(options.upsert)
        });
        return { data: error ? null : { path }, error };
    },

    deleteArcQrImage: async (path) => {
        if (!supabase || !path) return { error: null };
        const { error } = await supabase.storage.from('arc-resource-qr').remove([path]);
        return { error };
    },

    getArcQrImageUrl: async (path) => {
        if (!supabase || !path) return { data: null, error: null };
        return supabase.storage.from('arc-resource-qr').createSignedUrl(path, 3600);
    },

    subscribeArcResources: (callback) => {
        if (!supabase) return () => {};
        const channel = supabase
            .channel(`arc-resources-${globalThis.crypto?.randomUUID?.() || Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'arc_resources' }, callback)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    },

    // ===== ARC / CORE =====
    getArcCoreFields: async () => {
        if (!supabase) return { data: [], error: null };
        return supabase.from('arc_core_fields').select('*');
    },

    upsertArcCoreField: async (fieldKey, fieldValue, personnelId) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('arc_core_fields')
            .upsert({
                field_key: fieldKey,
                field_value: fieldValue ?? '',
                updated_by: personnelId || null
            }, { onConflict: 'field_key' })
            .select('*')
            .single();
    },

    upsertArcCoreFields: async (fields, personnelId) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        if (!fields?.length) return { data: [], error: null };
        return supabase
            .from('arc_core_fields')
            .upsert(fields.map(({ field_key, field_value }) => ({
                field_key,
                field_value: field_value ?? '',
                updated_by: personnelId || null
            })), { onConflict: 'field_key' })
            .select('*');
    },

    deleteArcCoreFields: async (fieldKeys) => {
        if (!supabase || !fieldKeys?.length) return { error: null };
        const { error } = await supabase.from('arc_core_fields').delete().in('field_key', fieldKeys);
        return { error };
    },

    subscribeArcCore: (callback) => {
        if (!supabase) return () => {};
        const channel = supabase
            .channel(`arc-core-${globalThis.crypto?.randomUUID?.() || Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'arc_core_fields' }, callback)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    },

    // ===== ARC / ALERTS =====
    getArcAnnouncements: async () => {
        if (!supabase) return { data: [], error: null };
        return supabase
            .from('arc_announcements')
            .select('*')
            .order('is_pinned', { ascending: false })
            .order('sort_order')
            .order('created_at', { ascending: false });
    },

    createArcAnnouncement: async (announcement) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('arc_announcements').insert(announcement).select('*').single();
    },

    upsertArcAnnouncement: async (announcement) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase
            .from('arc_announcements')
            .upsert(announcement, { onConflict: 'legacy_id' })
            .select('*')
            .single();
    },

    updateArcAnnouncement: async (id, updates) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('arc_announcements').update(updates).eq('id', id).select('*').single();
    },

    deleteArcAnnouncement: async (id) => {
        if (!supabase) return { error: { message: 'Not configured' } };
        const { error } = await supabase.from('arc_announcements').delete().eq('id', id);
        return { error };
    },

    reorderArcAnnouncements: async (announcements, personnelId) => {
        if (!supabase) return { error: { message: 'Not configured' } };
        const results = await Promise.all(announcements.map((announcement, index) => (
            supabase
                .from('arc_announcements')
                .update({ sort_order: index, updated_by: personnelId || null })
                .eq('id', announcement.id)
        )));
        return { error: results.find((result) => result.error)?.error || null };
    },

    subscribeArcAnnouncements: (callback) => {
        if (!supabase) return () => {};
        const channel = supabase
            .channel(`arc-announcements-${globalThis.crypto?.randomUUID?.() || Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'arc_announcements' }, callback)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    },

    // ===== ATTENDANCE =====
    getAttendance: async (date) => {
        if (!supabase) return { data: [], error: null };
        let query = supabase
            .from('attendance')
            .select('*, personnel(name), schedules(duty_date, start_time, end_time, title)');
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
        schedules(duty_date, start_time, end_time, title)
      `);
        if (status) query = query.eq('status', status);
        return query.order('created_at', { ascending: false });
    },

    createSwapRequest: async (request) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };
        return supabase.from('swap_requests').insert(request).select().single();
    },

    getScheduleById: async (id) => {
        if (!supabase) return { data: null, error: null };
        return supabase.from('schedules').select('*').eq('id', id).single();
    },

    updateSwapRequest: async (id, status) => {
        if (!supabase) return { data: null, error: { message: 'Not configured' } };

        // If approving, perform the actual swap of personnel_id
        if (status === 'approved') {
            try {
                // 1. Get the swap request details
                const { data: swapReq, error: fetchErr } = await supabase
                    .from('swap_requests')
                    .select('requester_id, target_id, schedule_id')
                    .eq('id', id)
                    .single();

                if (fetchErr || !swapReq) throw fetchErr || new Error('Swap request not found');

                // 2. Get the requester's schedule
                const { data: reqSchedule } = await supabase
                    .from('schedules')
                    .select('*')
                    .eq('id', swapReq.schedule_id)
                    .single();

                if (!reqSchedule) throw new Error('Schedule not found');

                // 3. Find the target's schedule on the same date
                const { data: targetSchedules } = await supabase
                    .from('schedules')
                    .select('*')
                    .eq('personnel_id', swapReq.target_id)
                    .eq('duty_date', reqSchedule.duty_date);

                // 4. Perform the swap
                // Update requester's schedule to point to target
                await supabase
                    .from('schedules')
                    .update({ personnel_id: swapReq.target_id })
                    .eq('id', swapReq.schedule_id);

                // If target has a schedule on the same date, swap it to requester
                if (targetSchedules && targetSchedules.length > 0) {
                    await supabase
                        .from('schedules')
                        .update({ personnel_id: swapReq.requester_id })
                        .eq('id', targetSchedules[0].id);
                }
            } catch (swapError) {
                console.error('Error performing schedule swap:', swapError);
                return { data: null, error: swapError };
            }
        }

        // Update the swap request status
        return supabase
            .from('swap_requests')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
    }
};

export default supabase;
