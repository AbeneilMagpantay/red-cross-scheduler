import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), 'VITE_');
const supabaseUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
    console.error('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local before running this check.');
    process.exitCode = 1;
} else {
    const client = createClient(supabaseUrl, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
    const protectedTables = [
        'attendance',
        'swap_requests',
        'personnel',
        'schedules',
        'departments',
        'duty_teams',
        'arc_resources',
        'arc_core_fields',
        'arc_announcements',
        'push_subscriptions'
    ];
    let failed = false;

    console.log('Checking anonymous, count-only table access (no records are downloaded)...');
    for (const table of protectedTables) {
        const { count, error, status } = await client.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            const accessWasDenied = error.code === '42501'
                || status === 401
                || status === 403
                || /permission denied|row-level security/i.test(error.message || '');

            if (accessWasDenied) {
                console.log(`PASS ${table}: anonymous access was denied.`);
            } else {
                console.error(`FAIL ${table}: unexpected check error (${error.message}).`);
                failed = true;
            }
        } else if ((count ?? 0) > 0) {
            console.error(`FAIL ${table}: anonymous requests can see ${count} row(s).`);
            failed = true;
        } else {
            console.log(`PASS ${table}: no rows are visible anonymously.`);
        }
    }

    if (failed) {
        console.error('Security smoke check failed. Confirm that 20260828_security_hardening.sql was applied to this Supabase project.');
        process.exitCode = 1;
    } else {
        console.log('Anonymous read smoke check passed. This does not replace authenticated role testing or Supabase Advisors.');
    }
}
