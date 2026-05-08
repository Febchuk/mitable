import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserContext } from "@/lib/app/active-classroom";

type MontessoriSupabase = ReturnType<typeof createAdminClient>;

export async function fetchTemplateLogoUrl(
  supabase: MontessoriSupabase,
  templateId: string | null,
  schoolId: string
): Promise<string | null> {
  if (!templateId) return null;
  const { data } = await supabase
    .from("report_templates")
    .select("logo_url, school_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!data || (data.school_id as string) !== schoolId) return null;
  return (data.logo_url as string | null) ?? null;
}

/**
 * NOTE: these reads use the service-role admin client and filter by
 * `school_id` explicitly. The user's auth is verified up front via
 * `getCurrentUserContext()` (which reads the cookie session). We bypass RLS
 * here because the existing policy graph on `reports`/`students` produces
 * a recursion (42P17) under the FK-join select. The explicit school_id
 * filter gives us the same isolation guarantee RLS would, without the cycle.
 *
 * Writes still go through the user-cookie client (see API routes), where
 * RLS continues to enforce policy.
 */

export type ReportListRow = {
  id: string;
  studentId: string;
  studentName: string;
  classroomId: string;
  reportType: "daily" | "major" | "incident";
  reportDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status:
    | "draft"
    | "submitted_for_review"
    | "in_review"
    | "changes_requested"
    | "approved"
    | "sent";
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
};

export type ReportDetail = ReportListRow & {
  body: string | null;
  sections: ReportSection[] | null;
  templateId: string | null;
  /** Header logo from the report's template — not sent to the LLM. */
  templateLogoUrl: string | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  /**
   * True iff the report has been submitted for review at least once. Drives
   * the topbar action button label ("Resubmit for review" vs the initial
   * "Submit for review"). Source: count of `report_review_actions` rows
   * with action_type="submitted".
   */
  hasBeenSubmitted: boolean;
};

type ReportsRow = {
  id: string;
  student_id: string;
  classroom_id: string;
  report_type: "daily" | "major" | "incident";
  report_date: string | null;
  period_start: string | null;
  period_end: string | null;
  status: ReportListRow["status"];
  title: string | null;
  body: string | null;
  sections: ReportSection[] | null;
  template_id: string | null;
  created_by_user_id: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  students: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    preferred_name: string | null;
    school_id: string;
  } | null;
};

function fullName(s: ReportsRow["students"]): string {
  if (!s) return "Unknown";
  const first = s.preferred_name || s.first_name || "";
  const last = s.last_name || "";
  return `${first} ${last}`.trim() || "Unknown";
}

/** All reports the caller can see (school-scoped via explicit filter on
 *  the joined students.school_id column). Most recent first. */
export async function listReports(): Promise<ReportListRow[]> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, created_at, updated_at, students!inner(id, first_name, last_name, preferred_name, school_id)"
    )
    .eq("students.school_id", ctx.schoolId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listReports failed", error);
    return [];
  }
  return (data as unknown as ReportsRow[]).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: fullName(row.students),
    classroomId: row.classroom_id,
    reportType: row.report_type,
    reportDate: row.report_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Single-report read for the editor page. Filtered by school. */
export async function getReport(id: string): Promise<ReportDetail | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, body, sections, template_id, created_by_user_id, approved_by_user_id, approved_at, sent_at, created_at, updated_at, students!inner(id, first_name, last_name, preferred_name, school_id)"
    )
    .eq("id", id)
    .eq("students.school_id", ctx.schoolId)
    .maybeSingle();
  if (error) {
    console.error("getReport failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as ReportsRow;
  const [templateLogoUrl, { count: priorSubmissionCount }] = await Promise.all([
    fetchTemplateLogoUrl(supabase, row.template_id, ctx.schoolId),
    supabase
      .from("report_review_actions")
      .select("id", { count: "exact", head: true })
      .eq("report_id", id)
      .eq("action_type", "submitted"),
  ]);
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: fullName(row.students),
    classroomId: row.classroom_id,
    reportType: row.report_type,
    reportDate: row.report_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    title: row.title,
    body: row.body,
    sections: row.sections,
    templateId: row.template_id,
    templateLogoUrl,
    createdByUserId: row.created_by_user_id,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasBeenSubmitted: (priorSubmissionCount ?? 0) > 0,
  };
}
