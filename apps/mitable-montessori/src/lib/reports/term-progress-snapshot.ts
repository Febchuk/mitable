import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { refreshDefaultTemplateProgressSections } from "./default-template";

/** Keep the term grid current until sending, without regenerating teachers' prose. */
export async function termProgressSnapshot(
  db: SupabaseClient,
  report: {
    report_type: string;
    classroom_id: string;
    student_id: string;
    period_start?: string | null;
    period_end?: string | null;
    sections: Array<{
      id: string;
      heading: string;
      paragraphs: Array<{ id: string; html: string }>;
    }> | null;
    section_meta: SectionMeta | null;
  }
) {
  if (
    report.report_type !== "major" ||
    !report.period_start ||
    !report.period_end ||
    !report.sections ||
    !report.section_meta ||
    !Object.values(report.section_meta).some((meta) => meta.type === "progress_topic")
  )
    return null;
  return {
    sections: await refreshDefaultTemplateProgressSections(db, {
      classroomId: report.classroom_id,
      studentId: report.student_id,
      periodStart: report.period_start,
      periodEnd: report.period_end,
      sections: report.sections,
      sectionMeta: report.section_meta,
      reportingPeriod: "end_of_term",
    }),
  };
}
