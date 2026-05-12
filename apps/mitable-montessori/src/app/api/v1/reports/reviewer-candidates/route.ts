import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Lookup: who can be assigned as a reviewer for reports in my school?
 *
 * Returns active teachers + admins in the requester's school. Used by the
 * /app/reports-v2 send-for-review drawer's reviewer multi-select. Excludes
 * the requester themselves (you don't review your own work).
 *
 * Auth: any authenticated school user. Read-only.
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  // `users` stores first_name + last_name separately; there's no full_name
  // column. We assemble it client-side and fall back to email when names
  // are missing (invited-but-not-yet-profiled accounts).
  const { data, error } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, school_id, status")
    .eq("school_id", auth.user.schoolId)
    .in("role", ["teacher", "admin"])
    .neq("id", auth.user.userId)
    .neq("status", "disabled")
    .order("last_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []).map((u) => {
    const row = u as {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      role: string;
    };
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return {
      userId: row.id,
      name: fullName || row.email || "Unnamed",
      email: row.email,
      role: row.role as "teacher" | "admin",
    };
  });

  return NextResponse.json({ candidates });
}
