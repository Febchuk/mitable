import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { listReports } from "@/lib/queries/reports";
import {
  getActiveClassroomForCurrentUser,
  isElementaryClassroomCode,
  isToddlerClassroomCode,
  listTeacherClassroomsForCurrentUser,
} from "@/lib/app/active-classroom";
import { CreateReportRequestSchema, type ReportKind } from "@/lib/schemas/report";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { REPORTING_PERIOD_DAYS, type ReportingPeriod } from "@/lib/report-templates/admin-dto";
import { fetchSpeechTargetLabels } from "@/lib/queries/speech-targets";
import { initialParagraphHtmlForTemplateSection } from "@/lib/reports/template-field-payload";
import {
  buildDefaultReportSections,
  DEFAULT_REPORT_TEMPLATE_ID,
  isDefaultReportTemplateId,
  parseDefaultReportTemplateId,
  reportingPeriodForDefaultKind,
} from "@/lib/reports/default-template";
import {
  buildIncidentReportSections,
  resolveStudentClassroomId,
} from "@/lib/reports/create-report-sections";
import { endOfTermPeriodBounds } from "@/lib/reports/term-period";
import {
  getStudentTermGradeComment,
  listStudentExamGradesForTerm,
} from "@/lib/queries/elementary-grades";
import { encodeExamGrades, summarizeExamGrades } from "@/lib/reports/exam-grades-payload";
import { dbToddlerDailyLogToDto, toddlerDailyLogReportHtml } from "@/lib/toddler-routines";

const KIND_TO_TYPE: Record<ReportKind, "daily" | "major" | "incident"> = {
  Daily: "daily",
  Major: "major",
  Incident: "incident",
};

async function resolvePeriodBounds(
  supabase: ReturnType<typeof createAdminClient>,
  schoolId: string,
  reportingPeriod: ReportingPeriod,
  today: Date
): Promise<{ periodStart: string; periodEnd: string; termId: string | null }> {
  const periodEnd = today.toISOString().slice(0, 10);
  if (reportingPeriod === "end_of_term") {
    const term = await endOfTermPeriodBounds(supabase, schoolId, today);
    return { periodStart: term.periodStart, periodEnd: term.periodEnd, termId: term.termId };
  }
  const periodDays = REPORTING_PERIOD_DAYS[reportingPeriod];
  const periodStartDate = new Date(today);
  periodStartDate.setDate(periodStartDate.getDate() - (periodDays - 1));
  return { periodStart: periodStartDate.toISOString().slice(0, 10), periodEnd, termId: null };
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const reports = await listReports();
  return NextResponse.json({ reports });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  if (input.reportDate && input.kind !== "Daily") {
    return NextResponse.json(
      { error: "A custom date is only available for Daily reports" },
      { status: 400 }
    );
  }
  const reportDay = input.reportDate ? new Date(`${input.reportDate}T12:00:00`) : new Date();

  const activeClassroom = await getActiveClassroomForCurrentUser();
  if (!activeClassroom) {
    return NextResponse.json({ error: "No active classroom" }, { status: 403 });
  }

  // Use the admin client for reports/templates/students reads + the insert.
  // The cookie-client INSERT triggers RLS evaluation on `reports` (RETURNING
  // clause), which still recurses through the existing students/enrollment
  // policy graph. We auth-gate via `requireUser` + verify the student
  // belongs to the caller's school explicitly below.
  const supabase = createAdminClient();

  // Verify the picked student is in the caller's school. This is the
  // school-isolation guarantee that RLS would have given us.
  const { data: student } = await supabase
    .from("students")
    .select("first_name, preferred_name, school_id")
    .eq("id", input.childId)
    .maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  if ((student.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Student not in your school" }, { status: 403 });
  }

  // Resolve template (if provided) so we can seed sections. Also verify
  // it's a template from the caller's school.
  let sections: Array<{
    id: string;
    heading: string;
    paragraphs: { id: string; html: string }[];
  }> | null = null;
  let sectionMeta: SectionMeta = {};
  let sectionGuidance: Record<string, string> = {};
  // The template's reporting period defines how far back autofill looks for
  // this child's profile data (progress, comments, observations, etc.).
  let reportingPeriod: ReportingPeriod | null = null;
  let reportClassroomId = activeClassroom.id;
  let toddlerDailyLogId: string | null = null;
  let resolvedTemplateId: string | null = input.templateId ?? null;
  const useDefaultTemplate = isDefaultReportTemplateId(input.templateId ?? null);
  const teacherClassrooms = await listTeacherClassroomsForCurrentUser();
  const teacherClassroomIds = teacherClassrooms.map((c) => c.id);

  if (useDefaultTemplate) {
    const parsedDefault = parseDefaultReportTemplateId(input.templateId ?? null);
    const defaultKind = parsedDefault?.kind ?? input.kind;
    reportingPeriod = parsedDefault?.reportingPeriod ?? reportingPeriodForDefaultKind(input.kind);

    if (defaultKind !== input.kind) {
      return NextResponse.json({ error: "Template kind mismatch" }, { status: 400 });
    }

    const hintedClassroomId = parsedDefault?.classroomId ?? activeClassroom.id;
    const studentClassroomId = await resolveStudentClassroomId(
      supabase,
      input.childId,
      teacherClassroomIds,
      hintedClassroomId
    );
    if (!studentClassroomId) {
      return NextResponse.json(
        { error: "Child is not enrolled in any of your classrooms" },
        { status: 400 }
      );
    }
    reportClassroomId = studentClassroomId;

    if (defaultKind === "Incident") {
      const incidentTranscript = input.transcripts[0]?.trim() ?? "";
      const built = await buildIncidentReportSections(
        supabase,
        auth.user.schoolId,
        incidentTranscript
      );
      sections = built.sections;
      sectionMeta = built.sectionMeta;
      sectionGuidance = built.sectionGuidance;
      resolvedTemplateId = built.templateId;
      reportingPeriod = "daily";
    } else {
      const { periodStart, periodEnd } = await resolvePeriodBounds(
        supabase,
        auth.user.schoolId,
        reportingPeriod,
        reportDay
      );
      const built = await buildDefaultReportSections(supabase, {
        classroomId: reportClassroomId,
        studentId: input.childId,
        periodStart,
        periodEnd,
        reportingPeriod,
      });
      sections = built.sections;
      sectionMeta = built.sectionMeta;
      sectionGuidance = built.sectionGuidance;
      resolvedTemplateId = null;
    }
  } else if (input.templateId) {
    const { data: tpl } = await supabase
      .from("report_templates")
      .select("id, sections, kind, school_id, section_guidance, section_meta, reporting_period")
      .eq("id", input.templateId)
      .maybeSingle();
    if (tpl && (tpl.school_id as string) === auth.user.schoolId && tpl.sections) {
      reportingPeriod = (tpl.reporting_period as ReportingPeriod | null) ?? null;
      const guidance = (tpl.section_guidance as Record<string, string> | null) ?? {};
      const meta = (tpl.section_meta as SectionMeta | null) ?? {};
      sectionGuidance = guidance;
      sectionMeta = meta;
      const headings = tpl.sections as string[];
      const needsSpeech = headings.some(
        (h) => meta[h]?.type === "curriculum" && meta[h]?.program === "speech"
      );
      const speechLabels = needsSpeech
        ? await fetchSpeechTargetLabels(supabase, input.childId)
        : [];
      sections = headings.map((heading, i) => ({
        id: `s-${i}-${heading.toLowerCase().replace(/\s+/g, "-")}`,
        heading,
        paragraphs: [
          {
            id: `p-${i}-1`,
            html: initialParagraphHtmlForTemplateSection(heading, guidance[heading] ?? "", meta, {
              speechLabels,
            }),
          },
        ],
      }));
    }
  }

  const firstName = (student.preferred_name || student.first_name || "Student") as string;
  const dayLabel = reportDay.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const reportDate = input.reportDate ?? reportDay.toISOString().slice(0, 10);

  const { periodStart, periodEnd, termId } = reportingPeriod
    ? await resolvePeriodBounds(supabase, auth.user.schoolId, reportingPeriod, reportDay)
    : { periodStart: reportDate, periodEnd: reportDate, termId: null };

  const reportClassroom = teacherClassrooms.find((classroom) => classroom.id === reportClassroomId);
  if (
    reportingPeriod === "end_of_term" &&
    termId &&
    isElementaryClassroomCode(reportClassroom?.code)
  ) {
    const gradeScope = {
      schoolId: auth.user.schoolId,
      classroomId: reportClassroomId,
      studentId: input.childId,
      termId,
    };
    const [gradeRows, termComment] = await Promise.all([
      listStudentExamGradesForTerm(gradeScope),
      getStudentTermGradeComment(gradeScope),
    ]);
    const heading = "Exam grades";
    sections = [
      ...(sections ?? []).filter((section) => section.heading !== heading),
      {
        id: `s-exam-grades-${termId}`,
        heading,
        paragraphs: [
          {
            id: `p-exam-grades-${termId}`,
            html: encodeExamGrades(summarizeExamGrades(gradeRows, termComment)),
          },
        ],
      },
    ];
    sectionMeta = { ...sectionMeta, [heading]: { type: "exam_grades", termId } };
  }

  if (input.kind === "Daily" && isToddlerClassroomCode(reportClassroom?.code)) {
    const [{ data: logRow }, { data: attendanceRow }] = await Promise.all([
      supabase
        .from("toddler_daily_logs")
        .select("*")
        .eq("school_id", auth.user.schoolId)
        .eq("classroom_id", reportClassroomId)
        .eq("student_id", input.childId)
        .eq("log_date", reportDate)
        .maybeSingle(),
      supabase
        .from("attendance_records")
        .select("status, arrival_time")
        .eq("classroom_id", reportClassroomId)
        .eq("student_id", input.childId)
        .eq("attendance_date", reportDate)
        .maybeSingle(),
    ]);
    if (!logRow) {
      return NextResponse.json(
        { error: "Save this child's Daily Log before creating the report" },
        { status: 400 }
      );
    }
    toddlerDailyLogId = logRow.id as string;
    const attendance = attendanceRow?.status
      ? `${attendanceRow.status}${attendanceRow.arrival_time ? ` · arrived ${String(attendanceRow.arrival_time).slice(0, 5)}` : ""}`
      : null;
    const heading = "Daily log";
    // Toddler reports come entirely from the Daily Log. Do not retain the
    // regular curriculum/progress-grid sections built by the default template.
    sections = [
      {
        id: `s-toddler-daily-log-${reportDate}`,
        heading,
        paragraphs: [
          {
            id: `p-toddler-daily-log-${reportDate}`,
            html: toddlerDailyLogReportHtml(dbToddlerDailyLogToDto(logRow), attendance),
          },
        ],
      },
    ];
    sectionMeta = {};
    sectionGuidance = {};
  }

  const { data: reusable } =
    input.kind === "Daily"
      ? await supabase
          .from("reports")
          .select("id")
          .eq("student_id", input.childId)
          .eq("classroom_id", reportClassroomId)
          .eq("report_type", "daily")
          .eq("report_date", reportDate)
          .in("status", ["draft", "changes_requested"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  if (reusable) {
    if (toddlerDailyLogId) {
      const { error: updateError } = await supabase
        .from("reports")
        .update({
          sections,
          section_meta: sectionMeta,
          section_guidance: sectionGuidance,
          toddler_daily_log_id: toddlerDailyLogId,
        })
        .eq("id", reusable.id);
      if (updateError) {
        return NextResponse.json(
          { error: "Failed to refresh report", details: updateError.message },
          { status: 500 }
        );
      }
    }
    return NextResponse.json({ reportId: reusable.id });
  }

  const { data: inserted, error } = await supabase
    .from("reports")
    .insert({
      student_id: input.childId,
      classroom_id: reportClassroomId,
      report_type: KIND_TO_TYPE[input.kind],
      report_date: reportDate,
      period_start: periodStart,
      period_end: periodEnd,
      reporting_period: reportingPeriod,
      term_id: termId,
      toddler_daily_log_id: toddlerDailyLogId,
      status: "draft",
      title: `${firstName} — ${dayLabel}`,
      body: null,
      sections,
      template_id: useDefaultTemplate
        ? input.kind === "Incident"
          ? resolvedTemplateId
          : null
        : (input.templateId ?? null),
      section_meta: sectionMeta,
      section_guidance: sectionGuidance,
      created_by_user_id: auth.user.userId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: "Failed to create report", details: error?.message },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.create",
    target_table: "reports",
    target_id: inserted.id as string,
    metadata: {
      kind: input.kind,
      classroom_id: reportClassroomId,
      has_audio: input.transcripts.length > 0,
      has_notes: input.notes.length > 0,
      template_id: useDefaultTemplate
        ? (input.templateId ?? DEFAULT_REPORT_TEMPLATE_ID)
        : (input.templateId ?? null),
      uses_default_template: useDefaultTemplate,
    },
  });

  return NextResponse.json({ reportId: inserted.id });
}
