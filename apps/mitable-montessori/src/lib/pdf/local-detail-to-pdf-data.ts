import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import type { ReportPdfData } from "./report-template";
import { fieldPayloadToReadableText } from "@/lib/reports/template-field-payload";
import { buildReportPdfBlocks } from "./sections-to-pdf-sections";

type LocalParagraph = { id: string; html: string };
type LocalSection = {
  id: string;
  heading: string;
  paragraphs: LocalParagraph[];
  ghostEdit?: { id: string; html: string; sourceLabel: string };
};

export type LocalDetailForPdf = {
  title: string;
  sections: LocalSection[];
};

function sectionsToBody(sections: LocalSection[]): string {
  return sections
    .map((s) => {
      const heading = s.heading ? `# ${s.heading}\n\n` : "";
      const body = s.paragraphs
        .map((p) => fieldPayloadToReadableText(p.html).trim())
        .filter((p) => p.length > 0)
        .join("\n\n");
      return heading + body;
    })
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

export function localDetailToPdfData(
  detail: LocalDetailForPdf,
  report: ReportDetailRow
): ReportPdfData {
  return {
    title: detail.title,
    studentName: report.studentName,
    reportDate: report.reportDate,
    classroom: report.classroomName ?? "",
    observedBy: report.authorName?.trim() || "Teacher",
    reportType: report.reportType,
    logoUrl: report.templateLogoUrl ?? null,
    blocks: buildReportPdfBlocks(detail.sections, report.templateSectionMeta ?? {}),
    media: report.media ?? [],
    body: sectionsToBody(detail.sections),
  };
}
