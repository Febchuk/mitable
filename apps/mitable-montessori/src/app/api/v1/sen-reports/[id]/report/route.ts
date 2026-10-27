import { z } from "zod";
import { buildDefaultReportSections } from "@/lib/reports/default-template";
import { buildToddlerDailyReportSections } from "@/lib/reports/toddler-daily-report";
import { isToddlerClassroomCode } from "@/lib/app/active-classroom";
import { bundleSenSections, mergeDailySections } from "@/lib/reports/sen-bundle";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser, requireTeacherForClassroom } from "@/lib/api/auth";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { buildSenReportSections, type SenReportMetric } from "@/lib/reports/sen-sections";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const raw = await req.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = z.object({ includeDailyReport: z.boolean().default(false) }).safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid report options" }, { status: 400 });
  const { includeDailyReport } = parsed.data;
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
  const { data: linked, error: existingError } = await db
    .from("reports")
    .select(
      "id, status, created_by_user_id, updated_at, report_type, sections, section_meta, section_guidance"
    )
    .eq("sen_daily_report_id", id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  let existing = linked;
  let duplicateDaily: typeof linked = null;
  // Inspect both entry points, including a previously prepared SEN-only draft.
  if (includeDailyReport || linked?.report_type === "daily") {
    const { data: dailyRows, error: dailyError } = await db
      .from("reports")
      .select(
        "id, status, created_by_user_id, updated_at, report_type, sections, section_meta, section_guidance, sen_daily_report_id"
      )
      .eq("student_id", saved.student_id)
      .eq("classroom_id", group.classroom_id)
      .eq("report_date", saved.report_date)
      .eq("report_type", "daily")
      .order("created_at", { ascending: false });
    if (dailyError) return NextResponse.json({ error: dailyError.message }, { status: 500 });
    const others = (dailyRows ?? []).filter((row) => row.id !== linked?.id);
    if (others.length > 1)
      return NextResponse.json(
        {
          error:
            "There are multiple daily drafts for this child. Open Reports to review them before combining.",
        },
        { status: 409 }
      );
    const daily = others[0] ?? null;
    if (daily && !["draft", "changes_requested"].includes(daily.status))
      return NextResponse.json(
        {
          error:
            "This child's daily report has already been sent or submitted for review. Open that report before preparing another update.",
        },
        { status: 409 }
      );
    if (daily?.sen_daily_report_id && daily.sen_daily_report_id !== id)
      return NextResponse.json(
        { error: "This daily report already includes another SEN assessment" },
        { status: 409 }
      );
    if (daily && auth.user.role !== "admin" && daily.created_by_user_id !== auth.user.userId)
      return NextResponse.json(
        {
          error:
            "Another teacher prepared the daily report. Ask them to combine it before sending.",
        },
        { status: 403 }
      );
    if (linked) duplicateDaily = daily;
    else existing = daily;
  }
  if (existing && auth.user.role !== "admin" && existing.created_by_user_id !== auth.user.userId)
    return NextResponse.json(
      {
        error:
          "Another teacher prepared this report. Ask them to send it or add you as a reviewer.",
      },
      { status: 403 }
    );
  // Sent and reviewed reports keep their original snapshot, even on repeated clicks.
  if (existing && !["draft", "changes_requested"].includes(existing.status)) {
    if (includeDailyReport && existing.report_type !== "daily")
      return NextResponse.json(
        { error: "This SEN report is already sent or under review and cannot be combined." },
        { status: 409 }
      );
    return NextResponse.json({ reportId: existing.id });
  }

  const combined = includeDailyReport || existing?.report_type === "daily";
  let sectionMeta: SectionMeta = existing?.section_meta ?? {};
  let sectionGuidance = existing?.section_guidance ?? {};
  let toddlerDailyLogId: string | null = null;
  if (combined) {
    const { data: room, error: roomError } = await db
      .from("classrooms")
      .select("code")
      .eq("id", group.classroom_id)
      .eq("school_id", auth.user.schoolId)
      .maybeSingle();
    if (roomError || !room)
      return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
    try {
      const scope = {
        classroomId: group.classroom_id,
        studentId: saved.student_id,
        periodStart: saved.report_date,
        periodEnd: saved.report_date,
        reportingPeriod: "daily" as const,
        // TLP's school day is Africa/Lagos, independent of the teacher's browser timezone.
        exactWindow: {
          start: new Date(`${saved.report_date}T00:00:00+01:00`).toISOString(),
          end: new Date(`${saved.report_date}T23:59:59.999+01:00`).toISOString(),
        },
      };
      const daily = isToddlerClassroomCode(room.code)
        ? await buildToddlerDailyReportSections(db, {
            ...scope,
            schoolId: auth.user.schoolId,
            reportDate: saved.report_date,
          })
        : await buildDefaultReportSections(db, scope);
      const oldSections = [...(existing?.sections ?? []), ...(duplicateDaily?.sections ?? [])];
      const oldMeta = { ...duplicateDaily?.section_meta, ...sectionMeta };
      sections = bundleSenSections(
        mergeDailySections(daily.sections, oldSections, oldMeta),
        sections
      );
      sectionMeta = { ...duplicateDaily?.section_meta, ...sectionMeta, ...daily.sectionMeta };
      sectionGuidance = {
        ...duplicateDaily?.section_guidance,
        ...sectionGuidance,
        ...daily.sectionGuidance,
      };
      toddlerDailyLogId =
        "toddlerDailyLogId" in daily ? (daily.toddlerDailyLogId as string | null) : null;
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }
  const reportPayload = {
    sections,
    section_meta: sectionMeta,
    section_guidance: sectionGuidance,
    sen_daily_report_id: id,
    report_type: combined ? "daily" : "sen",
    toddler_daily_log_id: toddlerDailyLogId,
    title: `${combined ? "Daily & SEN" : "SEN"} — ${group.name} — ${saved.report_date}`,
    ...(combined ? { body: null } : {}),
  };
  if (existing) {
    if (duplicateDaily) {
      // Lock, check revisions, preserve review/chat history, and consolidate in one transaction.
      const { error: mergeError } = await db.rpc("consolidate_sen_daily_drafts", {
        p_canonical_report_id: existing.id,
        p_duplicate_report_id: duplicateDaily.id,
        p_actor_user_id: auth.user.userId,
        p_school_id: auth.user.schoolId,
        p_expected_canonical_updated_at: existing.updated_at,
        p_expected_duplicate_updated_at: duplicateDaily.updated_at,
        p_patch: reportPayload,
      });
      if (mergeError)
        return NextResponse.json(
          {
            error:
              "The drafts changed or could not be combined. Reopen both reports and try again.",
          },
          { status: 409 }
        );
      return NextResponse.json({ reportId: existing.id });
    }
    const { data: updated, error: updateError } = await db
      .from("reports")
      .update({ ...reportPayload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .in("status", ["draft", "changes_requested"])
      .select("id")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    if (!updated)
      return NextResponse.json(
        { error: "This report changed while you were preparing it. Reopen it before combining." },
        { status: 409 }
      );
    return NextResponse.json({ reportId: existing.id });
  }
  const { data: report, error: insertError } = await db
    .from("reports")
    .insert({
      student_id: saved.student_id,
      classroom_id: group.classroom_id,
      ...reportPayload,
      report_date: saved.report_date,
      period_start: saved.report_date,
      period_end: saved.report_date,
      reporting_period: "daily",
      status: "draft",
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
