import type { SupabaseClient } from "@supabase/supabase-js";
import type { DefaultClassroomGroup, SectionMeta } from "@/lib/report-templates/sections";
import type { ReportingPeriod } from "@/lib/report-templates/admin-dto";
import { buildDefaultReportSections } from "./default-template";
import { isElementaryClassroomCode, isToddlerClassroomCode } from "@/lib/app/active-classroom";
import { encodeTermSkills } from "./term-skills";
import { initialParagraphHtmlForTemplateSection } from "./template-field-payload";
import { refreshConfiguredTermHistory } from "./term-history";
import { fetchSpeechTargetLabels } from "@/lib/queries/speech-targets";
import { elementaryGradeSnapshot } from "./elementary-grade-snapshot";

export type ConfiguredTemplate = {
  id: string;
  sections: string[];
  section_meta: SectionMeta | null;
  section_guidance: Record<string, string> | null;
  default_for?: DefaultClassroomGroup | null;
};

export function classroomReportGroup(code: string | null | undefined): DefaultClassroomGroup {
  if (isElementaryClassroomCode(code)) return "elementary";
  if (isToddlerClassroomCode(code)) return "toddler_house";
  return "childrens_house";
}

export async function findClassroomReportTemplate(
  db: SupabaseClient,
  schoolId: string,
  kind: string,
  code: string | null | undefined
): Promise<ConfiguredTemplate | null> {
  const group = classroomReportGroup(code);
  const { data, error } = await db
    .from("report_templates")
    .select("id, sections, section_meta, section_guidance, default_for")
    .eq("school_id", schoolId)
    .eq("kind", kind)
    .eq("is_active", true)
    .in("default_for", [group, "all"]);
  if (error) throw new Error(error.message);
  const templates = (data ?? []) as unknown as ConfiguredTemplate[];
  return (
    templates.find((template) => template.default_for === group) ??
    templates.find((template) => template.default_for === "all") ??
    null
  );
}

export async function buildConfiguredReportSections(
  db: SupabaseClient,
  template: ConfiguredTemplate,
  scope: {
    schoolId: string;
    classroomId: string;
    studentId: string;
    periodStart: string;
    periodEnd: string;
    termId: string | null;
    reportingPeriod: ReportingPeriod;
    elementary: boolean;
    kind: string;
  }
) {
  const progress = Object.values(template.section_meta ?? {}).some(
    (entry) => entry.type === "progress_summary"
  )
    ? await buildDefaultReportSections(db, scope)
    : null;
  const needsSpeech = Object.values(template.section_meta ?? {}).some(
    (entry) => entry.type === "curriculum"
  );
  const speechLabels = needsSpeech ? await fetchSpeechTargetLabels(db, scope.studentId) : [];
  const sections: Array<{
    id: string;
    heading: string;
    paragraphs: Array<{ id: string; html: string }>;
  }> = [];
  const sectionMeta: SectionMeta = {};
  const sectionGuidance: Record<string, string> = {};
  for (const [index, heading] of template.sections.entries()) {
    const meta = template.section_meta?.[heading];
    if (meta?.type === "progress_summary") {
      if (progress) {
        sections.push(...progress.sections);
        Object.assign(sectionMeta, progress.sectionMeta);
        Object.assign(sectionGuidance, progress.sectionGuidance);
      }
      continue;
    }
    if (meta?.type === "exam_grades" && (!scope.elementary || scope.kind !== "Major")) continue;
    if (meta)
      sectionMeta[heading] = meta.type === "exam_grades" ? { ...meta, termId: scope.termId } : meta;
    sectionGuidance[heading] = template.section_guidance?.[heading] ?? "";
    sections.push({
      id: `template-${index}`,
      heading,
      paragraphs: [
        {
          id: `template-${index}-value`,
          html:
            meta?.type === "term_skills"
              ? encodeTermSkills({})
              : initialParagraphHtmlForTemplateSection(
                  heading,
                  sectionGuidance[heading],
                  sectionMeta,
                  { speechLabels }
                ),
        },
      ],
    });
  }
  if (new Set(sections.map((section) => section.heading)).size !== sections.length) {
    throw new Error(
      "A template heading matches a curriculum subject. Rename the template heading in Report templates."
    );
  }
  const withHistory =
    scope.kind === "Major"
      ? await refreshConfiguredTermHistory(db, scope, sections, sectionMeta)
      : sections;
  const grades = await elementaryGradeSnapshot(db, {
    report_type: scope.kind === "Major" ? "major" : scope.kind.toLowerCase(),
    term_id: scope.termId,
    classroom_id: scope.classroomId,
    student_id: scope.studentId,
    sections: withHistory,
    section_meta: sectionMeta,
  });
  return { sections: grades?.sections ?? withHistory, sectionMeta, sectionGuidance };
}
