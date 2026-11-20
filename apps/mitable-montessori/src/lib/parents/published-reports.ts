import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionMeta } from "@/lib/report-templates/sections";
export type PublishedReport = {
  id: string;
  student_id: string;
  report_type: string;
  report_date?: string;
  period_start: string | null;
  period_end: string | null;
  title: string | null;
  body: string | null;
  sections: Array<{ heading: string; paragraphs: Array<{ html: string }> }> | null;
  section_meta: SectionMeta | null;
  toddler_daily_log_id: string | null;
  template_logo_url?: string | null;
  school_name?: string | null;
  sent_at: string;
};
type PublicationRow = {
  report_id: string;
  student_id: string;
  published_at: string;
  snapshot: Omit<PublishedReport, "id" | "sent_at">;
};
function reportFromPublication(row: PublicationRow): PublishedReport {
  return {
    ...row.snapshot,
    id: row.report_id,
    student_id: row.student_id,
    sent_at: row.published_at,
  };
}
/** Guardian RLS exposes only immutable versions explicitly addressed to this account. */
export async function loadPublishedReport(
  db: SupabaseClient,
  reportId: string
): Promise<PublishedReport | null> {
  const { data, error } = await db
    .from("report_publications")
    .select("report_id, student_id, snapshot, published_at")
    .eq("report_id", reportId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not load the shared report. Please try again.");
  return data ? reportFromPublication(data as unknown as PublicationRow) : null;
}
export async function listPublishedReports(
  db: SupabaseClient,
  studentId: string
): Promise<PublishedReport[]> {
  const { data, error } = await db
    .from("report_publications")
    .select("report_id, student_id, snapshot, published_at")
    .eq("student_id", studentId)
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Could not load your shared reports. Please try again.");
  const latest = new Map<string, PublishedReport>();
  for (const row of (data ?? []) as unknown as PublicationRow[])
    if (!latest.has(row.report_id)) latest.set(row.report_id, reportFromPublication(row));
  return [...latest.values()].slice(0, 50);
}
