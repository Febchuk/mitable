import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionMeta } from "@/lib/report-templates/sections";
import {
  getStudentTermGradeFeedback,
  listStudentExamGradesForTerm,
} from "@/lib/queries/elementary-grades";
import { encodeExamGrades, summarizeExamGrades } from "./exam-grades-payload";

type Section = { id: string; heading: string; paragraphs: { id: string; html: string }[] };

/** Saved results stay current until sending; the report's selected term never changes implicitly. */
export async function elementaryGradeSnapshot(
  db: SupabaseClient,
  report: {
    report_type: string;
    term_id?: string | null;
    student_id: string;
    classroom_id: string;
    sections: Section[] | null;
    section_meta: SectionMeta | null;
  }
) {
  if (
    report.report_type !== "major" ||
    !report.term_id ||
    !(report.sections ?? []).some(
      (section) => report.section_meta?.[section.heading]?.type === "exam_grades"
    )
  )
    return null;
  const { data: room, error } = await db
    .from("classrooms")
    .select("school_id")
    .eq("id", report.classroom_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!room?.school_id) throw new Error("Couldn't load the school for this report");
  const scope = {
    schoolId: room.school_id,
    classroomId: report.classroom_id,
    studentId: report.student_id,
    termId: report.term_id,
  };
  const [grades, feedback] = await Promise.all([
    listStudentExamGradesForTerm(scope),
    getStudentTermGradeFeedback(scope),
  ]);
  const html = encodeExamGrades(
    summarizeExamGrades(grades, feedback.comment, {
      includeBreakdown: true,
      overallGradeLabel: feedback.overallGradeLabel,
    })
  );
  return {
    sections: (report.sections ?? []).map((section) =>
      report.section_meta?.[section.heading]?.type === "exam_grades"
        ? {
            ...section,
            paragraphs: [
              { id: section.paragraphs[0]?.id ?? `${section.id}-value`, html },
              ...section.paragraphs.slice(1),
            ],
          }
        : section
    ),
  };
}
