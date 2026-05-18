import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireTeacherForClassroom, requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { getReport } from "@/lib/queries/reports";
import { UpdateReportRequestSchema } from "@/lib/schemas/report";
import { scoreAndPersistReport } from "@/lib/reports/score-and-persist";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const report = await getReport(id);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ report });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Use admin client to dodge the reports RLS recursion. School-isolation
  // enforced explicitly via the joined students.school_id check below.
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("reports")
    .select("id, status, created_by_user_id, students!inner(school_id)")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const studentSchool = (existing as unknown as { students: { school_id: string } | null }).students
    ?.school_id;
  if (studentSchool !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.body !== undefined) update.body = parsed.data.body;
  if (parsed.data.sections !== undefined) update.sections = parsed.data.sections;

  // Editing a report that's awaiting review pulls it back to draft so the
  // reviewer doesn't see a moving target. Logged as an `edited` review
  // action with notes that explain the auto-revert.
  const revertedFromReview =
    (existing as unknown as { status: string }).status === "submitted_for_review";
  if (revertedFromReview) {
    update.status = "draft";
  }

  const { error } = await supabase.from("reports").update(update).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to update report", details: error.message },
      { status: 500 }
    );
  }

  if (revertedFromReview) {
    await supabase.from("report_review_actions").insert({
      report_id: id,
      action_by_user_id: auth.user.userId,
      action_type: "edited",
      notes: "Teacher edited while awaiting review; reverted to draft for resubmission.",
    });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.update",
    target_table: "reports",
    target_id: id,
    metadata: {
      fields: Object.keys(parsed.data),
      reverted_from_review: revertedFromReview,
    },
  });

  revalidatePath(`/app/reports/${id}`);
  revalidatePath(`/admin/reports/${id}`);
  revalidatePath("/app/reports");
  revalidatePath("/admin/reports");

  // Fire-and-forget re-score on content edits. Only triggers when body or
  // sections changed (title-only edits don't move the score). We don't
  // await — autosave must stay fast; the score will land on the next
  // refresh.
  const contentChanged = parsed.data.body !== undefined || parsed.data.sections !== undefined;
  if (contentChanged) {
    scoreAndPersistReport({ supabase, reportId: id }).catch((err) => {
      console.error("autosave re-score failed", err);
    });
  }

  return NextResponse.json({ ok: true, revertedFromReview });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("reports")
    .select("id, classroom_id, students!inner(school_id)")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const studentSchool = (existing as unknown as { students: { school_id: string } | null }).students
    ?.school_id;
  if (studentSchool !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }

  const classroomId = existing.classroom_id as string;
  const allowed = auth.user.role === "admin" || (await requireTeacherForClassroom(classroomId));
  if (!allowed) {
    return NextResponse.json({ error: "Not allowed to delete this report" }, { status: 403 });
  }

  const { error: delRecipients } = await supabase
    .from("report_recipients")
    .delete()
    .eq("report_id", id);
  if (delRecipients) {
    return NextResponse.json(
      { error: "Failed to delete report recipients", details: delRecipients.message },
      { status: 500 }
    );
  }

  const { error: delActions } = await supabase
    .from("report_review_actions")
    .delete()
    .eq("report_id", id);
  if (delActions) {
    return NextResponse.json(
      { error: "Failed to delete review history", details: delActions.message },
      { status: 500 }
    );
  }

  const { error: delReport } = await supabase.from("reports").delete().eq("id", id);
  if (delReport) {
    return NextResponse.json(
      { error: "Failed to delete report", details: delReport.message },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.delete",
    target_table: "reports",
    target_id: id,
    metadata: {},
  });

  revalidatePath("/app/reports");
  revalidatePath("/admin/reports");

  return NextResponse.json({ ok: true });
}
