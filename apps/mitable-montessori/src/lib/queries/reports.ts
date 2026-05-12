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
  classroomName: string | null;
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
  classrooms: { id: string; name: string | null } | null;
  report_templates: { logo_url: string | null; school_id: string } | null;
};

function fullName(s: ReportsRow["students"]): string {
  if (!s) return "Unknown";
  const first = s.preferred_name || s.first_name || "";
  const last = s.last_name || "";
  return `${first} ${last}`.trim() || "Unknown";
}

/** All reports the caller can see (school-scoped via explicit filter on
 *  the joined students.school_id column). Most recent first. */
export async function listReports(opts?: { classroomIds?: string[] }): Promise<ReportListRow[]> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return [];

  const supabase = createAdminClient();
  let query = supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, created_at, updated_at, students!inner(id, first_name, last_name, preferred_name, school_id), classrooms(id, name)"
    )
    .eq("students.school_id", ctx.schoolId)
    .order("created_at", { ascending: false });

  if (opts?.classroomIds?.length) {
    query = query.in("classroom_id", opts.classroomIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listReports failed", error);
    return [];
  }
  return (data as unknown as ReportsRow[]).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: fullName(row.students),
    classroomId: row.classroom_id,
    classroomName: row.classrooms?.name ?? null,
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

// ============================================================================
// Reports v2 (redesign) — additional shape on top of ReportListRow with the
// fields the new UI needs: derived tab, AI score (stubbed until Phase 4 lands
// the scorer), reviewer ticks (from report_review_actions), and a placeholder
// completeness % until the scorer fills it in.
// ============================================================================

export type ReportV2Tab = "drafts" | "review" | "approved" | "sent";

export type ReportReviewerRow = {
  reviewerUserId: string;
  status: "pending" | "approved" | "changes_requested";
};

export type ReportListRowV2 = ReportListRow & {
  tab: ReportV2Tab;
  /** 0-100 composite. Phase 4 wires the real scorer; today this is stubbed. */
  aiScore: number;
  /** % of expected sections filled in. Stubbed until Phase 4. */
  completenessPercent: number;
  /** Per-reviewer assignment rows from report_reviewers. Empty when no one
   *  has been assigned (the report is either still a draft, or submitted
   *  without a named reviewer list). */
  reviewers: ReportReviewerRow[];
  /** Convenience: counts derived from `reviewers`. */
  reviewerTicks: { approved: number; total: number };
  /** Most recent submission timestamp ("4h ago" relative) — null if never sent. */
  lastSubmittedAt: string | null;
  /** Email delivery state for reports in the Sent tab. Counts come from
   *  report_recipients.delivery_status. "Read" tracking doesn't exist yet so
   *  `delivered` is the strongest signal we surface. */
  delivery: { delivered: number; pending: number; failed: number };
};

/** Status → tab. `changes_requested` lives in Drafts (the teacher's queue). */
function statusToTab(status: ReportListRow["status"]): ReportV2Tab {
  switch (status) {
    case "draft":
    case "changes_requested":
      return "drafts";
    case "submitted_for_review":
    case "in_review":
      return "review";
    case "approved":
      return "approved";
    case "sent":
      return "sent";
  }
}

/**
 * Stubbed AI score. Will be replaced by the real scorer in Phase 4. For now
 * we hash the report id to get a deterministic-looking score so the UI
 * doesn't flicker between renders, and tilt toward green so demo data feels
 * realistic (most reports approved without re-reading).
 */
function stubAiScore(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const bucket = Math.abs(h) % 100;
  if (bucket < 60) return 85 + (bucket % 13); // 85–97 (green)
  if (bucket < 85) return 65 + (bucket % 18); // 65–82 (amber)
  return 35 + (bucket % 22); // 35–56 (red)
}

function stubCompleteness(score: number): number {
  // Completeness loosely follows score — Phase 4 will use the scorer's own
  // completeness signal directly.
  if (score >= 85) return 90 + (score % 8);
  if (score >= 60) return 60 + (score % 15);
  return 40 + (score % 15);
}

export async function listReportsV2(opts?: {
  classroomIds?: string[];
}): Promise<ReportListRowV2[]> {
  const baseRows = await listReports(opts);
  if (baseRows.length === 0) return [];

  // Two enrichment queries in parallel:
  //   1. report_review_actions — tick counts + last-submitted timestamp.
  //   2. report_recipients — delivered/pending/failed counts for Sent rows.
  // Both share the same report_id IN-list so they're cheap to run alongside.
  const supabase = createAdminClient();
  const ids = baseRows.map((r) => r.id);
  const [actionsResp, recipientsResp, reviewersResp] = await Promise.all([
    supabase
      .from("report_review_actions")
      .select("report_id, action_type, created_at")
      .in("report_id", ids),
    supabase.from("report_recipients").select("report_id, delivery_status").in("report_id", ids),
    supabase
      .from("report_reviewers")
      .select("report_id, reviewer_user_id, status, acted_at")
      .in("report_id", ids),
  ]);

  // Last-submitted timestamp comes from the chronological action log —
  // we don't track it on the reviewer assignment.
  const lastSubmittedByReport = new Map<string, string>();
  for (const a of (actionsResp.data ?? []) as Array<{
    report_id: string;
    action_type: string;
    created_at: string;
  }>) {
    if (a.action_type === "submitted") {
      const prev = lastSubmittedByReport.get(a.report_id);
      if (!prev || a.created_at > prev) {
        lastSubmittedByReport.set(a.report_id, a.created_at);
      }
    }
  }

  // Reviewer assignments — the source of truth for "who's reviewing and
  // have they ticked." Replaces the older "count distinct approvers in the
  // action log" heuristic.
  const reviewersByReport = new Map<string, ReportReviewerRow[]>();
  for (const r of (reviewersResp.data ?? []) as Array<{
    report_id: string;
    reviewer_user_id: string;
    status: "pending" | "approved" | "changes_requested";
  }>) {
    const list = reviewersByReport.get(r.report_id) ?? [];
    list.push({ reviewerUserId: r.reviewer_user_id, status: r.status });
    reviewersByReport.set(r.report_id, list);
  }

  const deliveryByReport = new Map<
    string,
    { delivered: number; pending: number; failed: number }
  >();
  for (const r of (recipientsResp.data ?? []) as Array<{
    report_id: string;
    delivery_status: "pending" | "sent" | "failed";
  }>) {
    const cur = deliveryByReport.get(r.report_id) ?? {
      delivered: 0,
      pending: 0,
      failed: 0,
    };
    if (r.delivery_status === "sent") cur.delivered += 1;
    else if (r.delivery_status === "pending") cur.pending += 1;
    else cur.failed += 1;
    deliveryByReport.set(r.report_id, cur);
  }

  return baseRows.map((row) => {
    const aiScore = stubAiScore(row.id);
    const reviewers = reviewersByReport.get(row.id) ?? [];
    const approvedCount = reviewers.filter((r) => r.status === "approved").length;
    return {
      ...row,
      tab: statusToTab(row.status),
      aiScore,
      completenessPercent: stubCompleteness(aiScore),
      reviewers,
      reviewerTicks: { approved: approvedCount, total: reviewers.length },
      lastSubmittedAt: lastSubmittedByReport.get(row.id) ?? null,
      delivery: deliveryByReport.get(row.id) ?? { delivered: 0, pending: 0, failed: 0 },
    };
  });
}

/** Single-report read for the editor page. Filtered by school. */
export async function getReport(id: string): Promise<ReportDetail | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, body, sections, template_id, created_by_user_id, approved_by_user_id, approved_at, sent_at, created_at, updated_at, students!inner(id, first_name, last_name, preferred_name, school_id), classrooms(id, name), report_templates(logo_url, school_id)"
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
    classroomName: row.classrooms?.name ?? null,
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
