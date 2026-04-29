import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for the Montessori app.
 *
 * Uses the same Supabase project as the rest of Mitable, configured via
 * NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (see
 * apps/montessori/.env.local.example). Session is persisted to
 * localStorage so users stay signed in across reloads, and Supabase
 * handles refresh-token rotation automatically.
 *
 * Server-side Supabase access is not configured here — backend calls
 * for the Montessori app go through apiRequest() in ./client.ts, which
 * pulls a fresh access token from this client and forwards it as a
 * Bearer token to the Express backend.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (typeof window !== "undefined" && (!supabaseUrl || !supabaseAnonKey)) {
    // Hard-fail fast in the browser so we don't render an app that can't
    // ever talk to the backend. The error will be visible in the console
    // during dev; production builds need both vars set at build time.
    // eslint-disable-next-line no-console
    console.error(
        "[montessori] Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/montessori/.env.local."
    );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
    },
});
