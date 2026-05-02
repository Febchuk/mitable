import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export interface AuthedGuardian {
  authUserId: string;
  guardianId: string;
  email: string;
}

/**
 * Phase 5 guardian gate. Resolves the auth user → the canonical `guardians`
 * row via `guardians.auth_user_id`. Returns either an AuthedGuardian or an
 * early NextResponse to short-circuit the route.
 *
 * RLS still does the ultimate enforcement at the table level (see
 * 0007_guardian_invitations.sql); this is defense-in-depth so we get clean
 * 401/403 responses with auditable context before queries fire.
 */
export async function requireGuardian(): Promise<
  { ok: true; guardian: AuthedGuardian } | { ok: false; response: NextResponse }
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }
  const { data: guardian, error } = await supabase
    .from("guardians")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || !guardian) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No guardian profile linked" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    guardian: {
      authUserId: user.id,
      guardianId: (guardian as { id: string }).id,
      email: (guardian as { email: string }).email,
    },
  };
}
