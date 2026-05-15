/**
 * Shared adapter that turns raw report sections (as stored on `reports.sections`
 * or carried in an EmailJob) into the structured paragraph shape the PDF
 * template renders. Used by:
 *   - the in-editor preview pipeline (via local-detail-to-pdf-data.ts)
 *   - the parent-facing email sender (ResendEmailSender)
 *
 * The first paragraph in a section whose meta is `checklist` or
 * `single_select` is treated as the structured field — every option
 * is emitted so the PDF can print them all with `☐ / ☑` glyphs.
 * Subsequent paragraphs in the same section, and all paragraphs in
 * plain `text` sections, render as decoded plain text.
 */

import type { SectionMeta, SectionMetaEntry } from "@/lib/report-templates/sections";
import type { ReportPdfParagraph, ReportPdfSection } from "./report-template";
import {
  decodeFieldPayload,
  fieldPayloadToReadableText,
  inferChecklistSelections,
  inferSingleSelect,
} from "@/lib/reports/template-field-payload";

type RawParagraph = { html: string };
type RawSection = { heading: string; paragraphs: RawParagraph[] };

export function paragraphToPdf(
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
      return {
        text: "",
        field: { kind: "checklist", options: meta.options, selected },
      };
    }
    const value =
      decoded.kind === "single_select"
        ? decoded.value
        : decoded.kind === "legacy_prose"
          ? inferSingleSelect(decoded.html, meta.options)
          : null;
    return {
      text: "",
      field: { kind: "single_select", options: meta.options, value },
    };
  }
  return { text: fieldPayloadToReadableText(html) };
}

export function sectionsToPdfSections(
  sections: RawSection[] | null | undefined,
  sectionMeta: SectionMeta | null | undefined
): ReportPdfSection[] {
  if (!sections?.length) return [];
  const meta = sectionMeta ?? {};
  return sections.map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs.map((p, i) => paragraphToPdf(p.html, i === 0, meta[s.heading])),
  }));
}
