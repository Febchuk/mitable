import { describe, expect, it } from "vitest";
import {
  decodeExamGrades,
  encodeExamGrades,
  examGradesToReadableText,
  summarizeExamGrades,
} from "@/lib/reports/exam-grades-payload";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";

const rows = [
  {
    subject: "Mathematics",
    assessmentName: "End-of-term exam",
    percentage: 86.5,
    gradeLabel: "B+",
    comments: "Strong number sense",
  },
  {
    subject: "Language",
    assessmentName: "End-of-term exam",
    percentage: 93.5,
    gradeLabel: "A",
    comments: "Excellent writing",
  },
];

const summary = {
  averagePercentage: 90,
  comment: "Strong work across the term.",
};

describe("elementary exam grades in reports", () => {
  it("snapshots the average and one report-level comment", () => {
    expect(summarizeExamGrades(rows, summary.comment)).toEqual(summary);
    const encoded = encodeExamGrades(summary);
    expect(decodeExamGrades(encoded)).toEqual(summary);
    expect(examGradesToReadableText(encoded)).toBe(
      "Overall average: 90%\nComments: Strong work across the term."
    );
  });

  it("becomes a dedicated overall-grade PDF block", () => {
    const blocks = buildReportPdfBlocks(
      [{ heading: "Exam grades", paragraphs: [{ html: encodeExamGrades(summary) }] }],
      { "Exam grades": { type: "exam_grades", termId: "term-1" } }
    );
    expect(blocks).toEqual([{ kind: "exam_grades", heading: "Exam grades", summary }]);
  });

  it("converts existing per-subject snapshots to an overall average without reusing their comments", () => {
    const legacyPayload = "__MITABLE_EXAM_GRADES_V1__" + JSON.stringify(rows);
    expect(decodeExamGrades(legacyPayload)).toEqual({ averagePercentage: 90, comment: null });
  });
});
