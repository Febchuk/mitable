import type { SectionMeta } from "@/lib/report-templates/sections";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSenReportSections, type SenReportMetric } from "./sen-sections";
import type { DefaultTemplateBuildResult } from "./default-template";

type Sections = DefaultTemplateBuildResult["sections"];

/** Replace the SEN portion while preserving daily activities and teacher additions. */
export function bundleSenSections(daily: Sections, sen: Sections): Sections {
  return [
    ...daily.filter((section) => !section.id.startsWith("sen-")),
    ...sen.map((section) => ({ ...section, heading: `SEN — ${section.heading}` })),
  ];
}

/** Refresh source-owned daily fields and retain the teacher's additional sections. */
export function mergeDailySections(
  fresh: Sections,
  existing: Sections,
  meta: SectionMeta
): Sections {
  const generated = (heading: string) =>
    ["daily log", "daily overview"].includes(heading.trim().toLowerCase()) ||
    meta[heading]?.type === "progress_topic";
  const additions = [
    ...new Map(
      existing
        .filter((section) => !generated(section.heading))
        .map((section) => [
          JSON.stringify([section.heading, section.paragraphs.map((p) => p.html)]),
          section,
        ])
    ).values(),
  ];
  const byHeading = new Map(additions.map((section) => [section.heading, section]));
  return [
    ...fresh.map((section) => byHeading.get(section.heading) ?? section),
    ...additions.filter((section) => !fresh.some((item) => item.heading === section.heading)),
  ];
}

/** Refresh an explicitly linked SEN assessment in a combined daily report. */
export async function refreshBundledSenSections(
  db: SupabaseClient,
  report: {
    sen_daily_report_id?: string | null;
    student_id: string;
    classroom_id: string;
    report_date: string | null;
    sections: Sections | null;
  }
): Promise<Sections | null> {
  if (!report.sen_daily_report_id) return null;
  const { data: saved, error } = await db
    .from("sen_daily_reports")
    .select(
      "student_id, report_date, remarks, sen_report_group_id, sen_daily_report_scores(metric_id, score)"
    )
    .eq("id", report.sen_daily_report_id)
    .eq("student_id", report.student_id)
    .eq("report_date", report.report_date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!saved) throw new Error("The linked SEN assessment is unavailable");
  const { data: group, error: groupError } = await db
    .from("sen_report_groups")
    .select("template_id")
    .eq("id", saved.sen_report_group_id)
    .eq("classroom_id", report.classroom_id)
    .maybeSingle();
  if (groupError) throw new Error(groupError.message);
  if (!group) throw new Error("The SEN assessment belongs to another classroom");
  const { data: metrics, error: metricError } = await db
    .from("sen_report_metrics")
    .select("id, label, section, score_labels")
    .eq("template_id", group.template_id)
    .eq("is_active", true)
    .order("sort_order");
  if (metricError) throw new Error(metricError.message);
  return bundleSenSections(
    report.sections ?? [],
    buildSenReportSections(
      (metrics ?? []) as SenReportMetric[],
      saved.sen_daily_report_scores as Array<{ metric_id: string; score: number }>,
      saved.remarks
    )
  );
}
