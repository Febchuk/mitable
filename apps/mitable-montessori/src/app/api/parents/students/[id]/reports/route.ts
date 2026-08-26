import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireGuardian } from "@/lib/api/guardian-auth";
import { createClient } from "@/utils/supabase/server";

/**
 * Reports explicitly sent to the guardian for one of their linked students.
 * RLS enforces the recipient relationship and sent status. We re-state
 * status='sent' here as defense-in-depth.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGuardian();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("reports")
    .select("id, report_type, period_start, period_end, title, body, sent_at")
    .eq("student_id", id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reports: data ?? [] });
}
