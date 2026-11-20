import { termSkillsSection } from "./term-skills";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { refreshDefaultTemplateProgressSections } from "./default-template";

/** Keep the term grid current until sending, without regenerating teachers' prose. */
export async function termProgressSnapshot(
  db: SupabaseClient,
  report: {
    report_type: string;
    template_id?: string | null;
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
  if (report.report_type !== "major" || !report.sections || !report.section_meta) return null;
  let sections = report.sections;
  let sectionMeta = report.section_meta;
  if (!report.template_id) {
    const removed = new Set([
      "Daily reports — term highlights",
      "SEN reports — term highlights",
      "Project letters — term highlights",
    ]);
    sections = sections.filter(
      (section) =>
        !(removed.has(section.heading) && sectionMeta[section.heading]?.type === "term_history")
    );
    sectionMeta = Object.fromEntries(
      Object.entries(sectionMeta).filter(([heading]) =>
        sections.some((section) => section.heading === heading)
      )
    );
    if (!sections.some((section) => sectionMeta[section.heading]?.type === "term_skills")) {
      sections = [...sections, termSkillsSection()];
      sectionMeta = { ...sectionMeta, "Skills report": { type: "term_skills" } };
    }
  }
  if (
    report.period_start &&
    report.period_end &&
    Object.values(sectionMeta).some((meta) => meta.type === "progress_topic")
  ) {
    sections = await refreshDefaultTemplateProgressSections(db, {
      classroomId: report.classroom_id,
      studentId: report.student_id,
      periodStart: report.period_start,
      periodEnd: report.period_end,
      sections,
      sectionMeta,
      reportingPeriod: "end_of_term",
    });
  }
  return { sections, section_meta: sectionMeta };
}
