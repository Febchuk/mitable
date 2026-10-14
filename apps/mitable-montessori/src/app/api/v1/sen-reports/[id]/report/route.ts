import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser, requireTeacherForClassroom } from "@/lib/api/auth";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { buildSenReportSections, type SenReportMetric } from "@/lib/reports/sen-sections";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const scoped = createClient(await cookies());
  const { data: saved, error } = await scoped
    .from("sen_daily_reports")
    .select(
      "id, school_id, student_id, report_date, remarks, sen_report_group_id, sen_daily_report_scores(metric_id, score)"
    )
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "SEN report not found" }, { status: 404 });
  const { data: group } = await scoped
    .from("sen_report_groups")
    .select("classroom_id, template_id, name")
    .eq("id", saved.sen_report_group_id)
    .maybeSingle();
  if (
    !group ||
    (auth.user.role !== "admin" && !(await requireTeacherForClassroom(group.classroom_id)))
  )
    return NextResponse.json({ error: "Not assigned to this class" }, { status: 403 });
  const { data: metrics, error: metricError } = await scoped
    .from("sen_report_metrics")
    .select("id, label, section, score_labels")
    .eq("template_id", group.template_id)
    .eq("is_active", true)
    .order("sort_order");
  if (metricError) return NextResponse.json({ error: metricError.message }, { status: 500 });
  let sections;
  try {
    sections = buildSenReportSections(
      (metrics ?? []) as SenReportMetric[],
      saved.sen_daily_report_scores as Array<{ metric_id: string; score: number }>,
      saved.remarks
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const db = createAdminClient();
  const { data: existing, error: existingError } = await db
    .from("reports")
    .select("id, status, created_by_user_id")
    .eq("sen_daily_report_id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) {
    if (auth.user.role !== "admin" && existing.created_by_user_id !== auth.user.userId)
      return NextResponse.json(
        {
          error:
            "Another teacher prepared this report. Ask them to send it or add you as a reviewer.",
        },
        { status: 403 }
      );
    // Sent reports remain immutable snapshots. Repeated clicks open the same report.
    if (["draft", "changes_requested"].includes(existing.status)) {
      const { error: updateError } = await db
        .from("reports")
        .update({ sections })
        .eq("id", existing.id)
        .in("status", ["draft", "changes_requested"]);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ reportId: existing.id });
  }
  const { data: report, error: insertError } = await db
    .from("reports")
    .insert({
      student_id: saved.student_id,
      classroom_id: group.classroom_id,
      sen_daily_report_id: id,
      report_type: "sen",
      report_date: saved.report_date,
      period_start: saved.report_date,
      period_end: saved.report_date,
      reporting_period: "daily",
      status: "draft",
      title: `SEN — ${group.name} — ${saved.report_date}`,
      sections,
      section_meta: {},
      section_guidance: {},
      created_by_user_id: auth.user.userId,
    })
    .select("id")
    .single();
  if (insertError || !report)
    return NextResponse.json(
      {
        error:
          insertError?.code === "23505"
            ? "Report was just prepared. Try again to open it."
            : "Couldn't prepare SEN report",
      },
      { status: insertError?.code === "23505" ? 409 : 500 }
    );
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "sen_report.prepared",
    target_table: "reports",
    target_id: report.id,
    metadata: { sen_daily_report_id: id },
  });
  return NextResponse.json({ reportId: report.id });
}
