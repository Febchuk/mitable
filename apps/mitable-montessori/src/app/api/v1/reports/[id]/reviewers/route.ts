import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { AssignReviewersSchema } from "@/lib/schemas/report";
import { auditLog } from "@/lib/audit/log";

/**
 * Replace the reviewer set for a report. Used by admin reassign UI and by
 * /submit (which calls this idempotently). Wipes any existing assignments
 * before inserting the new list — keeps the model simple at the cost of
 * losing per-reviewer history, which is fine because the full chronology
 * lives in `report_review_actions`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id: reportId } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = AssignReviewersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // School-isolation check via the parent report (matches the pattern in
  // src/app/api/v1/reports/[id]/route.ts PATCH).
  const { data: report } = await supabase
    .from("reports")
    .select("id, students!inner(school_id)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const studentSchool = (report as unknown as { students: { school_id: string } | null }).students
    ?.school_id;
  if (studentSchool !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }

  // Replace strategy: wipe + insert. The (report_id, reviewer_user_id)
  // unique constraint also guards against duplicate inserts if two admins
  // race on this endpoint.
  const { error: delErr } = await supabase
    .from("report_reviewers")
    .delete()
    .eq("report_id", reportId);
  if (delErr) {
    return NextResponse.json(
      { error: "Failed to clear existing reviewers", details: delErr.message },
      { status: 500 }
    );
  }
  if (parsed.data.reviewerIds.length > 0) {
    const rows = parsed.data.reviewerIds.map((reviewerUserId) => ({
      report_id: reportId,
      reviewer_user_id: reviewerUserId,
      assigned_by_user_id: auth.user.userId,
      status: "pending" as const,
    }));
    const { error: insErr } = await supabase.from("report_reviewers").insert(rows);
    if (insErr) {
      return NextResponse.json(
        { error: "Failed to assign reviewers", details: insErr.message },
        { status: 500 }
      );
    }
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "assign_reviewers",
    target_table: "reports",
    target_id: reportId,
    metadata: { reviewer_count: parsed.data.reviewerIds.length },
  });

  revalidatePath("/app/reports-v2");
  revalidatePath("/admin/reports-v2");

  return NextResponse.json({ ok: true, reviewerCount: parsed.data.reviewerIds.length });
}
