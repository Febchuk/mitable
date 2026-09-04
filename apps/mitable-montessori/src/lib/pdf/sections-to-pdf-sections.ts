/**
 * Adapter that turns raw report sections (as stored on `reports.sections` or
 * carried in an EmailJob) into the block model the PDF template renders. Used by:
 *   - the in-editor preview pipeline (via local-detail-to-pdf-data.ts)
 *   - the parent-facing email sender (ResendEmailSender)
 *
 * Blocks mirror what report detail shows on screen:
 *   - progress_topic sections become numbered `subject` blocks with rows
 *     grouped under their parent topic + status badges, and the following
 *     "… — Comments" section folded in as the block's teacher comment.
 *   - everything else becomes a `section` block whose first checklist /
 *     single-select paragraph renders as controls; other paragraphs as prose.
 */

import type { SectionMeta, SectionMetaEntry } from "@/lib/report-templates/sections";
import type { ReportPdfBlock, ReportPdfParagraph, ReportPdfProgressGroup } from "./report-template";
import {
  decodeFieldPayload,
  fieldPayloadToReadableText,
  inferChecklistSelections,
  inferSingleSelect,
} from "@/lib/reports/template-field-payload";
import { decodeProgressTopic, type ProgressTopicRow } from "@/lib/reports/progress-topic-payload";
import { decodeExamGrades } from "@/lib/reports/exam-grades-payload";
import { isTopicCommentsHeading } from "@/lib/reports/default-classroom-report";
import { statusToMark } from "@/lib/progress/marking-schemas";

type RawParagraph = { html: string };
type RawSection = { heading: string; paragraphs: RawParagraph[] };

/** Group flat progress rows by their parent topic, preserving first-seen order. */
function groupRowsByTopic(rows: ProgressTopicRow[]): ReportPdfProgressGroup[] {
  const order: string[] = [];
  const map = new Map<string, ProgressTopicRow[]>();
  for (const row of rows) {
    const key = row.topicName?.trim() || "Uncategorized";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(row);
  }
  return order.map((topicName) => ({
    topicName,
    rows: map.get(topicName)!.map((r) => ({
      name: r.name,
      statusMark: statusToMark(r.status),
      comment: r.comment,
    })),
  }));
}

/** Convert a single non-progress paragraph to the PDF paragraph shape. */
function paragraphToPdf(
  html: string,
  isFirstInSection: boolean,
  meta: SectionMetaEntry | undefined
): ReportPdfParagraph {
  if (isFirstInSection && meta && (meta.type === "checklist" || meta.type === "single_select")) {
    const decoded = decodeFieldPayload(html);
    if (meta.type === "checklist") {
      const selected =
        decoded.kind === "checklist"
          ? decoded.selected
          : decoded.kind === "legacy_prose"
            ? inferChecklistSelections(decoded.html, meta.options)
            : [];
      return { text: "", field: { kind: "checklist", options: meta.options, selected } };
    }
    const value =
      decoded.kind === "single_select"
        ? decoded.value
        : decoded.kind === "legacy_prose"
          ? inferSingleSelect(decoded.html, meta.options)
          : null;
    return { text: "", field: { kind: "single_select", options: meta.options, value } };
  }
  return { text: fieldPayloadToReadableText(html) };
}

export function buildReportPdfBlocks(
  sections: RawSection[] | null | undefined,
  sectionMeta: SectionMeta | null | undefined
): ReportPdfBlock[] {
  if (!sections?.length) return [];
  const meta = sectionMeta ?? {};
  const blocks: ReportPdfBlock[] = [];
  let subjectIndex = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const entry = meta[section.heading];

    if (entry?.type === "progress_topic") {
      const rows = decodeProgressTopic(section.paragraphs[0]?.html ?? "") ?? [];
      // Fold a trailing "… — Comments" section into this subject block.
      const next = sections[i + 1];
      let comment: string | null = null;
      if (next && isTopicCommentsHeading(next.heading)) {
        comment = fieldPayloadToReadableText(next.paragraphs[0]?.html ?? "").trim() || null;
        i++;
      }
      subjectIndex++;
      blocks.push({
        kind: "subject",
        index: subjectIndex,
        heading: section.heading,
        groups: groupRowsByTopic(rows),
        comment,
      });
      continue;
    }

    if (entry?.type === "exam_grades") {
      blocks.push({
        kind: "exam_grades",
        heading: section.heading,
        summary: decodeExamGrades(section.paragraphs[0]?.html ?? ""),
      });
      continue;
    }

    blocks.push({
      kind: "section",
      heading: section.heading,
      paragraphs: section.paragraphs.map((p, idx) => paragraphToPdf(p.html, idx === 0, entry)),
    });
  }

  return blocks;
}
