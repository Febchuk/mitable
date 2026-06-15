import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { plainTextToReportParagraphHtml } from "@/lib/reports/template-field-payload";

type ReportSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
};

function sectionSlug(heading: string, i: number): string {
  return (
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `section-${i}`
  );
}

/** Active enrollment classroom for this child among the teacher's rooms. */
export async function resolveStudentClassroomId(
  supabase: SupabaseClient,
  studentId: string,
  teacherClassroomIds: string[],
  hintClassroomId?: string | null
): Promise<string | null> {
  if (teacherClassroomIds.length === 0) return null;
  const { data } = await supabase
    .from("student_classroom_enrollments")
    .select("classroom_id, is_primary")
    .eq("student_id", studentId)
    .is("end_date", null)
    .in("classroom_id", teacherClassroomIds);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  if (hintClassroomId && rows.some((r) => r.classroom_id === hintClassroomId)) {
    return hintClassroomId;
  }
  const primary = rows.find((r) => r.is_primary);
  return ((primary ?? rows[0]).classroom_id as string) ?? null;
}

const DEFAULT_INCIDENT_HEADINGS = ["What happened", "Care given", "Follow-up"];

/** Seed incident report sections from the school's incident template (or defaults). */
export async function buildIncidentReportSections(
  supabase: SupabaseClient,
  schoolId: string,
  incidentTranscript: string
): Promise<{
  sections: ReportSection[];
  sectionMeta: SectionMeta;
  sectionGuidance: Record<string, string>;
  templateId: string | null;
}> {
  const { data: tpl } = await supabase
    .from("report_templates")
    .select("id, sections, section_guidance, section_meta")
    .eq("school_id", schoolId)
    .eq("kind", "Incident")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const headings = (tpl?.sections as string[] | null)?.length
    ? (tpl!.sections as string[])
    : DEFAULT_INCIDENT_HEADINGS;
  const guidance = (tpl?.section_guidance as Record<string, string> | null) ?? {};
  const meta = (tpl?.section_meta as SectionMeta | null) ?? {};
  const transcriptHtml = incidentTranscript.trim()
    ? plainTextToReportParagraphHtml(incidentTranscript.trim())
    : "";

  const sections: ReportSection[] = headings.map((heading, i) => ({
    id: `s-${i}-${sectionSlug(heading, i)}`,
    heading,
    paragraphs: [
      {
        id: `p-${i}-1`,
        html: i === 0 && transcriptHtml ? transcriptHtml : "",
      },
    ],
  }));

  return {
    sections,
    sectionMeta: meta,
    sectionGuidance: guidance,
    templateId: (tpl?.id as string | null) ?? null,
  };
}
