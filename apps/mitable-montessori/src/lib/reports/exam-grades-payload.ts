import type { ElementaryExamGrade } from "@/lib/queries/elementary-grades";

const PREFIX = "__MITABLE_EXAM_GRADES_V2__";
const LEGACY_PREFIX = "__MITABLE_EXAM_GRADES_V1__";

export type ExamGradeReportRow = Pick<
  ElementaryExamGrade,
  "subject" | "assessmentName" | "percentage" | "gradeLabel" | "comments"
>;

export type ExamGradeReportSummary = {
  averagePercentage: number;
  comment: string | null;
};

export function summarizeExamGrades(
  rows: ExamGradeReportRow[],
  comment: string | null
): ExamGradeReportSummary | null {
  if (rows.length === 0) return null;
  const averagePercentage =
    Math.round((rows.reduce((total, row) => total + row.percentage, 0) / rows.length) * 100) / 100;
  return { averagePercentage, comment: comment?.trim() || null };
}

export function encodeExamGrades(summary: ExamGradeReportSummary | null): string {
  return PREFIX + JSON.stringify(summary);
}

export function decodeExamGrades(value: string): ExamGradeReportSummary | null {
  if (value.startsWith(LEGACY_PREFIX)) return decodeLegacyExamGrades(value);
  if (!value.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const summary = parsed as Record<string, unknown>;
    if (
      typeof summary.averagePercentage !== "number" ||
      (summary.comment !== null && typeof summary.comment !== "string")
    )
      return null;
    return {
      averagePercentage: summary.averagePercentage,
      comment: summary.comment as string | null,
    };
  } catch {
    return null;
  }
}

export function examGradesToReadableText(value: string): string {
  const summary = decodeExamGrades(value);
  if (!summary) return "No exam grades were recorded for this term.";
  const result = `Overall average: ${summary.averagePercentage}%`;
  return summary.comment ? `${result}\nComments: ${summary.comment}` : result;
}

function decodeLegacyExamGrades(value: string): ExamGradeReportSummary | null {
  try {
    const parsed = JSON.parse(value.slice(LEGACY_PREFIX.length)) as unknown;
    if (!Array.isArray(parsed)) return null;
    const rows: ExamGradeReportRow[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      if (typeof item.percentage !== "number") return null;
      rows.push({
        subject: typeof item.subject === "string" ? item.subject : "",
        assessmentName: typeof item.assessmentName === "string" ? item.assessmentName : "",
        percentage: item.percentage,
        gradeLabel: typeof item.gradeLabel === "string" ? item.gradeLabel : "",
        comments: null,
      });
    }
    return summarizeExamGrades(rows, null);
  } catch {
    return null;
  }
}
