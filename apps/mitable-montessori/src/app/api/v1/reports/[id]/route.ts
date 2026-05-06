import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireTeacherForClassroom, requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { getReport } from "@/lib/queries/reports";
import { UpdateReportRequestSchema } from "@/lib/schemas/report";

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

  const { error } = await supabase.from("reports").update(update).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to update report", details: error.message },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.update",
    target_table: "reports",
    target_id: id,
    metadata: {
      fields: Object.keys(parsed.data),
    },
  });

  return NextResponse.json({ ok: true });
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

  return NextResponse.json({ ok: true });
}
