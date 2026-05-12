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
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, school_id")
    .eq("school_id", auth.user.schoolId)
    .in("role", ["teacher", "admin"])
    .neq("id", auth.user.userId)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []).map((u) => {
    const row = u as { id: string; email: string | null; full_name: string | null; role: string };
    return {
      userId: row.id,
      name: row.full_name?.trim() || row.email || "Unnamed",
      email: row.email,
      role: row.role as "teacher" | "admin",
    };
  });

  return NextResponse.json({ candidates });
}
