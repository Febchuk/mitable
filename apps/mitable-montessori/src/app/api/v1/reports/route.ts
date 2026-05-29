import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { listReports } from "@/lib/queries/reports";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import { CreateReportRequestSchema, type ReportKind } from "@/lib/schemas/report";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { REPORTING_PERIOD_DAYS, type ReportingPeriod } from "@/lib/report-templates/admin-dto";
import { fetchSpeechTargetLabels } from "@/lib/queries/speech-targets";
import { initialParagraphHtmlForTemplateSection } from "@/lib/reports/template-field-payload";

const KIND_TO_TYPE: Record<ReportKind, "daily" | "major" | "incident"> = {
  Daily: "daily",
  Major: "major",
  Incident: "incident",
};

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

  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) {
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
  // The template's reporting period defines how far back autofill looks for
  // this child's profile data (progress, comments, observations, etc.).
  let reportingPeriod: ReportingPeriod | null = null;
  if (input.templateId) {
    const { data: tpl } = await supabase
      .from("report_templates")
      .select("id, sections, kind, school_id, section_guidance, section_meta, reporting_period")
      .eq("id", input.templateId)
      .maybeSingle();
    if (tpl && (tpl.school_id as string) === auth.user.schoolId && tpl.sections) {
      reportingPeriod = (tpl.reporting_period as ReportingPeriod | null) ?? null;
      const guidance = (tpl.section_guidance as Record<string, string> | null) ?? {};
      const meta = (tpl.section_meta as SectionMeta | null) ?? {};
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
  const today = new Date();
  const dayLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const reportDate = today.toISOString().slice(0, 10);

  // Window the autofill query: period_end is today, period_start reaches back
  // by the template's reporting period (e.g. weekly = last 7 days). Reports
  // with no template fall back to a single day (today only).
  const periodDays = reportingPeriod ? REPORTING_PERIOD_DAYS[reportingPeriod] : 1;
  const periodStartDate = new Date(today);
  periodStartDate.setDate(periodStartDate.getDate() - (periodDays - 1));
  const periodStart = periodStartDate.toISOString().slice(0, 10);

  const { data: inserted, error } = await supabase
    .from("reports")
    .insert({
      student_id: input.childId,
      classroom_id: classroom.id,
      report_type: KIND_TO_TYPE[input.kind],
      report_date: reportDate,
      period_start: periodStart,
      period_end: reportDate,
      status: "draft",
      title: `${firstName} — ${dayLabel}`,
      body: null,
      sections,
      template_id: input.templateId ?? null,
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
      classroom_id: classroom.id,
      has_audio: input.transcripts.length > 0,
      has_notes: input.notes.length > 0,
      template_id: input.templateId ?? null,
    },
  });

  return NextResponse.json({ reportId: inserted.id });
}
