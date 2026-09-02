import { describe, expect, it } from "vitest";
import {
  decodeExamGrades,
  encodeExamGrades,
  examGradesToReadableText,
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
];

describe("elementary exam grades in reports", () => {
  it("round-trips the private report payload", () => {
    const encoded = encodeExamGrades(rows);
    expect(decodeExamGrades(encoded)).toEqual(rows);
    expect(examGradesToReadableText(encoded)).toContain("86.5% (B+)");
  });

  it("becomes a dedicated grade-table PDF block", () => {
    const blocks = buildReportPdfBlocks(
      [{ heading: "Exam grades", paragraphs: [{ html: encodeExamGrades(rows) }] }],
      { "Exam grades": { type: "exam_grades", termId: "term-1" } }
    );
    expect(blocks).toEqual([{ kind: "exam_grades", heading: "Exam grades", rows }]);
  });
});
