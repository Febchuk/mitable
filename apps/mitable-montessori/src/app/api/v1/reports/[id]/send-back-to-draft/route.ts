import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { auditLog } from "@/lib/audit/log";

/**
 * Admin-only: revert a report to `draft`, regardless of its current state
 * (in_review, approved, or even sent — sent reverts are rare but
 * supported because parents sometimes ask for corrections post-delivery).
 *
 * Differs from /changes in that it doesn't require a notes body and works
 * from any non-draft state. Differs from the implicit PATCH-revert in that
 * it doesn't depend on a content edit triggering it.
 *
 * Also wipes any per-reviewer assignments on the report so re-submission
 * starts with a clean slate — the author may have changed their mind
 * about who should review.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id: reportId } = await ctx.params;

  const supabase = createAdminClient();

  const { data: report } = await supabase
    .from("reports")
    .select("id, status, students!inner(school_id)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const typed = report as unknown as {
    id: string;
    status: string;
    students: { school_id: string } | null;
  };
  if (typed.students?.school_id !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }
  if (typed.status === "draft") {
    return NextResponse.json({ error: "Already a draft" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const note =
    typeof (body as { note?: unknown })?.note === "string"
      ? (body as { note: string }).note.slice(0, 2000)
      : null;

  // Clear status + scoring metadata (the draft is about to change; the old
  // score no longer represents the report's content).
  const { error: updateErr } = await supabase
    .from("reports")
    .update({
      status: "draft",
      approved_by_user_id: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to revert report", details: updateErr.message },
      { status: 500 }
    );
  }

  // Wipe reviewer assignments — admin's intent is "start over."
  await supabase.from("report_reviewers").delete().eq("report_id", reportId);

  // Log the revert in the chronological action log. Re-use the `edited`
  // action_type since that's how the existing PATCH revert records itself
  // (see src/app/api/v1/reports/[id]/route.ts).
  await supabase.from("report_review_actions").insert({
    report_id: reportId,
    action_by_user_id: auth.user.userId,
    action_type: "edited",
    notes: note
      ? `Admin sent back to draft: ${note}`
      : "Admin sent back to draft for a fresh review cycle.",
  });

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report_sent_back_to_draft",
    target_table: "reports",
    target_id: reportId,
    metadata: { previous_status: typed.status, note },
  });

  revalidatePath(`/app/reports/${reportId}`);
  revalidatePath(`/admin/reports/${reportId}`);
  revalidatePath("/app/reports");
  revalidatePath("/admin/reports");

  return NextResponse.json({ ok: true });
}
