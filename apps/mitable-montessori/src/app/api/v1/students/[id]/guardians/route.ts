import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id: studentId } = await ctx.params;
  const url = new URL(req.url);
  const receivesOnly = url.searchParams.get("receivesReports") === "true";

  const supabase = createAdminClient();

  let query = supabase
    .from("student_guardians")
    .select(
      "guardian_id, relationship, receives_reports, guardians(id, first_name, last_name, email)"
    )
    .eq("student_id", studentId);

  if (receivesOnly) {
    query = query.eq("receives_reports", true);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const guardians = (data ?? []).map((row) => {
    const r = row as {
      guardian_id: string;
      relationship: string | null;
      receives_reports: boolean;
      guardians:
        | { id: string; first_name: string; last_name: string; email: string | null }
        | { id: string; first_name: string; last_name: string; email: string | null }[]
        | null;
    };
    const g = Array.isArray(r.guardians) ? r.guardians[0] : r.guardians;
    return {
      guardianId: r.guardian_id,
      name: g ? `${g.first_name} ${g.last_name}` : "Unknown",
      email: g?.email ?? null,
      relationship: r.relationship,
    };
  });

  return NextResponse.json({ guardians });
}
