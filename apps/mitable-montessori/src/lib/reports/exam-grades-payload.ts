import type { ElementaryExamGrade } from "@/lib/queries/elementary-grades";

const PREFIX = "__MITABLE_EXAM_GRADES_V3__";
const SUMMARY_PREFIX = "__MITABLE_EXAM_GRADES_V2__";
const LEGACY_PREFIX = "__MITABLE_EXAM_GRADES_V1__";

export type ExamGradeReportRow = Pick<
  ElementaryExamGrade,
  | "subject"
  | "assessmentName"
  | "percentage"
  | "gradeLabel"
  | "comments"
  | "caScore"
  | "classParticipationScore"
  | "aflScore"
>;

export type ExamGradeBreakdownRow = {
  subject: string;
  assessmentName: string;
  caScore: number | null;
  classParticipationScore: number | null;
  aflScore: number | null;
  total: number;
};

export type ExamGradeReportSummary = {
  averagePercentage: number;
  comment: string | null;
  rows?: ExamGradeBreakdownRow[];
  overallGradeLabel?: string | null;
};

export function summarizeExamGrades(
  rows: ExamGradeReportRow[],
  comment: string | null,
  options?: { includeBreakdown: boolean; overallGradeLabel: string | null }
): ExamGradeReportSummary | null {
  if (rows.length === 0) return null;
  const averagePercentage =
    Math.round((rows.reduce((total, row) => total + row.percentage, 0) / rows.length) * 100) / 100;
  return {
    averagePercentage,
    comment: comment?.trim() || null,
    ...(options?.includeBreakdown
      ? {
          rows: rows.map((row) => ({
            subject: row.subject,
            assessmentName: row.assessmentName,
            caScore: row.caScore ?? null,
            classParticipationScore: row.classParticipationScore ?? null,
            aflScore: row.aflScore ?? null,
            total: row.percentage,
          })),
          overallGradeLabel: options.overallGradeLabel,
        }
      : {}),
  };
}

export function encodeExamGrades(summary: ExamGradeReportSummary | null): string {
  return PREFIX + JSON.stringify(summary);
}

export function decodeExamGrades(value: string): ExamGradeReportSummary | null {
  if (value.startsWith(LEGACY_PREFIX)) return decodeLegacyExamGrades(value);
  const prefix = value.startsWith(PREFIX)
    ? PREFIX
    : value.startsWith(SUMMARY_PREFIX)
      ? SUMMARY_PREFIX
      : null;
  if (!prefix) return null;
  try {
    const parsed = JSON.parse(value.slice(prefix.length)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const summary = parsed as Record<string, unknown>;
    if (
      typeof summary.averagePercentage !== "number" ||
      !Number.isFinite(summary.averagePercentage) ||
      (summary.comment !== null && typeof summary.comment !== "string")
    )
      return null;
    let rows: ExamGradeBreakdownRow[] | undefined;
    if (summary.rows !== undefined) {
      if (!Array.isArray(summary.rows)) return null;
      rows = [];
      for (const item of summary.rows) {
        if (
          !item ||
          typeof item !== "object" ||
          typeof item.subject !== "string" ||
          typeof item.assessmentName !== "string" ||
          typeof item.total !== "number" ||
          !Number.isFinite(item.total) ||
          item.total < 0 ||
          item.total > 100
        )
          return null;
        if (
          [item.caScore, item.classParticipationScore, item.aflScore].some(
            (score) => score !== null && (typeof score !== "number" || !Number.isFinite(score))
          )
        )
          return null;
        rows.push({
          subject: item.subject,
          assessmentName: item.assessmentName,
          caScore: item.caScore,
          classParticipationScore: item.classParticipationScore,
          aflScore: item.aflScore,
          total: item.total,
        });
      }
    }
    if (
      summary.overallGradeLabel != null &&
      !["A", "B", "C", "D"].includes(summary.overallGradeLabel as string)
    )
      return null;
    return {
      averagePercentage: summary.averagePercentage,
      comment: summary.comment as string | null,
      ...(rows ? { rows } : {}),
      ...(summary.overallGradeLabel !== undefined
        ? { overallGradeLabel: summary.overallGradeLabel as string | null }
        : {}),
    };
  } catch {
    return null;
  }
}

export function examGradesToReadableText(value: string): string {
  const summary = decodeExamGrades(value);
  if (!summary) return "No exam grades were recorded for this term.";
  const results =
    summary.rows?.map(
      (row) =>
        `${row.subject} (${row.assessmentName}): CA ${row.caScore ?? "—"}/40; class participation ${row.classParticipationScore ?? "—"}/20; AFL ${row.aflScore ?? "—"}/40; total ${row.total}/100`
    ) ?? [];
  results.push(`Overall average: ${summary.averagePercentage}%`);
  if (summary.overallGradeLabel) results.push(`Overall grade: ${summary.overallGradeLabel}`);
  if (summary.comment) results.push(`Comments: ${summary.comment}`);
  return results.join("\n");
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
