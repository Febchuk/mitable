import { plainTextToReportParagraphHtml } from "./template-field-payload";
export type SenReportMetric = {
  id: string;
  label: string;
  section: string;
  score_labels: string[];
};
export function buildSenReportSections(
  metrics: SenReportMetric[],
  scores: Array<{ metric_id: string; score: number }>,
  remarks: string | null
) {
  const byMetric = new Map(scores.map((score) => [score.metric_id, score.score]));
  if (!metrics.length || metrics.some((metric) => !byMetric.has(metric.id)))
    throw new Error("Score every SEN item before preparing the report");
  const sections = ["skill", "maladaptive_behavior"].flatMap((section) => {
    const lines = metrics
      .filter((metric) => metric.section === section)
      .map((metric) => {
        const score = byMetric.get(metric.id)!;
        return `${metric.label}: ${score}/5 — ${metric.score_labels[score - 1] ?? ""}`;
      });
    return lines.length
      ? [
          {
            id: `sen-${section}`,
            heading: section === "skill" ? "Skills" : "Maladaptive behaviours",
            paragraphs: [
              { id: `sen-${section}-text`, html: plainTextToReportParagraphHtml(lines.join("\n")) },
            ],
          },
        ]
      : [];
  });
  if (remarks?.trim())
    sections.push({
      id: "sen-remarks",
      heading: "Remarks",
      paragraphs: [{ id: "sen-remarks-text", html: plainTextToReportParagraphHtml(remarks) }],
    });
  return sections;
}
