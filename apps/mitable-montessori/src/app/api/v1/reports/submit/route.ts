import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit/log";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { SubmitReportSchema } from "@/lib/schemas/report";
import { submitReportForReview, WorkflowError } from "@/lib/reports/workflow";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => null);
  const parsed = SubmitReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { reportId, reviewerIds = [], note } = parsed.data;
  const supabase = createAdminClient();
  try {
    await submitReportForReview({
      supabase,
      reportId,
      actorUserId: auth.user.userId,
    });

    // Seed report_reviewers with the author's selection. Idempotent thanks
    // to the (report_id, reviewer_user_id) unique constraint — we wipe any
    // prior assignments first so re-submits reflect the latest list.
    if (reviewerIds.length > 0) {
      await supabase.from("report_reviewers").delete().eq("report_id", reportId);
      const rows = reviewerIds.map((reviewerUserId) => ({
        report_id: reportId,
        reviewer_user_id: reviewerUserId,
        assigned_by_user_id: auth.user.userId,
        status: "pending" as const,
        note: note ?? null,
      }));
      const { error: insertErr } = await supabase.from("report_reviewers").insert(rows);
      if (insertErr) {
        // Don't fail the submit if reviewer seeding fails — the submit
        // transition already landed and we want the workflow to be robust
        // to permission edge cases. Log it loudly so we can investigate.
        console.error("report_reviewers seed failed", insertErr);
      }
    }

    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "submit_report_for_review",
      target_table: "reports",
      target_id: reportId,
      metadata: { reviewer_count: reviewerIds.length },
    });
    revalidatePath(`/app/reports/${reportId}`);
    revalidatePath(`/admin/reports/${reportId}`);
    revalidatePath("/app/reports");
    revalidatePath("/admin/reports");
    revalidatePath("/app/reports-v2");
    revalidatePath("/admin/reports-v2");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkflowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "not_found" ? 404 : 409 }
      );
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
