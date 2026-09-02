import type { ElementaryExamGrade } from "@/lib/queries/elementary-grades";

const PREFIX = "__MITABLE_EXAM_GRADES_V1__";

export type ExamGradeReportRow = Pick<
  ElementaryExamGrade,
  "subject" | "assessmentName" | "percentage" | "gradeLabel" | "comments"
>;

export function encodeExamGrades(rows: ExamGradeReportRow[]): string {
  return PREFIX + JSON.stringify(rows);
}

export function decodeExamGrades(value: string): ExamGradeReportRow[] | null {
  if (!value.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length)) as unknown;
    if (!Array.isArray(parsed)) return null;
    const rows: ExamGradeReportRow[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      if (
        typeof item.subject !== "string" ||
        typeof item.assessmentName !== "string" ||
        typeof item.percentage !== "number" ||
        typeof item.gradeLabel !== "string" ||
        (item.comments !== null && typeof item.comments !== "string")
      )
        return null;
      rows.push({
        subject: item.subject,
        assessmentName: item.assessmentName,
        percentage: item.percentage,
        gradeLabel: item.gradeLabel,
        comments: item.comments,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

export function examGradesToReadableText(value: string): string {
  const rows = decodeExamGrades(value) ?? [];
  if (rows.length === 0) return "No exam grades were recorded for this term.";
  return rows
    .map((row) => {
      const main = `${row.subject} — ${row.assessmentName}: ${row.percentage}% (${row.gradeLabel})`;
      return row.comments?.trim() ? `${main}. ${row.comments.trim()}` : main;
    })
    .join("\n");
}
