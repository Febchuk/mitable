import { describe, expect, it } from "vitest";
import { buildSenReportSections } from "./sen-sections";
const metrics = [
  { id: "a", label: "Communication", section: "skill", score_labels: ["A", "B", "C", "D", "E"] },
  {
    id: "b",
    label: "Behaviour",
    section: "maladaptive_behavior",
    score_labels: ["Never", "Rarely", "Sometimes", "Often", "Always"],
  },
];
describe("SEN parent report", () => {
  it("preserves scores, their own scale labels, and teacher remarks", () => {
    const sections = buildSenReportSections(
      metrics,
      [
        { metric_id: "a", score: 5 },
        { metric_id: "b", score: 1 },
      ],
      "Worked <well> & calmly"
    );
    expect(sections[0].paragraphs[0].html).toContain("5/5 — E");
    expect(sections[1].paragraphs[0].html).toContain("1/5 — Never");
    expect(sections[2].paragraphs[0].html).toContain("&lt;well&gt; &amp; calmly");
  });
  it("refuses incomplete assessments", () => {
    expect(() => buildSenReportSections(metrics, [{ metric_id: "a", score: 5 }], null)).toThrow(
      "Score every"
    );
  });
});
