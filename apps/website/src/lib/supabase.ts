import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Browser Supabase client — use in "use client" components only.
 * Stores tokens in localStorage (default supabase-js behavior).
 */
export const supabase = createClient(supabaseUrl || "http://placeholder", supabaseAnonKey || "placeholder");

/**
 * Server Supabase client — use in Server Components, Route Handlers, and Server Actions.
 * Requires the `cookies()` async function from `next/headers`.
 *
 * Usage:
 *   import { cookies } from "next/headers";
 *   const cookieStore = await cookies();
 *   const supabase = createServerSupabaseClient(cookieStore);
 */
export function createServerSupabaseClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                    } catch {
                        // setAll can throw in Server Components (read-only).
                        // This is expected — the middleware handles session refresh.
                    }
                },
            },
        }
    );
}
