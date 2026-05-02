import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — only use server-side for trusted writes
 * (audit log inserts, etc.). Never import in client code.
 */
export const createAdminClient = () =>
  createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
