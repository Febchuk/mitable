import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

/**
 * Supabase Admin Client
 *
 * Use this client for server-side operations that require elevated privileges.
 * This client bypasses Row Level Security (RLS) policies.
 *
 * IMPORTANT: Never expose service role key to clients!
 */
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Supabase Client (Anon)
 *
 * Use this client for operations that respect Row Level Security (RLS).
 * This is safer for most operations.
 */
export const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
