import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { TickReviewerSchema } from "@/lib/schemas/report";
import { auditLog } from "@/lib/audit/log";

/**
 * The current user marks themselves as having reviewed this report.
 * Idempotent: re-ticking just updates the existing row.
 *
 * This is the per-reviewer ✓, distinct from the admin's final /approve.
 * Once all assigned reviewers have ticked, the UI surfaces "Ready to
 * promote" and admins can hit /approve to make it official.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id: reportId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = TickReviewerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the user is actually assigned as a reviewer for this report.
  // No assignment = no tick.
  const { data: assignment } = await supabase
    .from("report_reviewers")
    .select("id, status")
    .eq("report_id", reportId)
    .eq("reviewer_user_id", auth.user.userId)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json(
      { error: "You are not assigned as a reviewer for this report" },
      { status: 403 }
    );
  }

  const { error: updateErr } = await supabase
    .from("report_reviewers")
    .update({
      status: parsed.data.status,
      acted_at: new Date().toISOString(),
      note: parsed.data.note ?? null,
    })
    .eq("id", (assignment as { id: string }).id);
  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to record tick", details: updateErr.message },
      { status: 500 }
    );
  }

  // Mirror the action in the chronological log so existing review history
  // surfaces still show this tick. Maps the reviewer status onto the same
  // action_type values existing workflows use.
  await supabase.from("report_review_actions").insert({
    report_id: reportId,
    action_by_user_id: auth.user.userId,
    action_type: parsed.data.status === "approved" ? "approved" : "requested_changes",
    notes: parsed.data.note ?? null,
  });

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: parsed.data.status === "approved" ? "reviewer_tick_approved" : "reviewer_tick_changes",
    target_table: "reports",
    target_id: reportId,
  });

  revalidatePath("/app/reports-v2");
  revalidatePath("/admin/reports-v2");

  return NextResponse.json({ ok: true, status: parsed.data.status });
}
