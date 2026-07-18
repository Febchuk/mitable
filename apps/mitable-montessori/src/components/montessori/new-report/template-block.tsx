"use client";

import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { PdfPreviewPane } from "@/components/montessori/report-detail/pdf-preview-pane";
import type { ReportPdfData } from "@/lib/pdf/report-template";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";
import { encodeProgressTopic } from "@/lib/reports/progress-topic-payload";
import {
  isDefaultReportTemplateId,
  withDefaultReportTemplates,
} from "@/lib/reports/default-template";
import { type PickerChild } from "./child-picker";
import { type ReportTemplate } from "./mock-data";

const TONE_TO_CLASS = {
  clay: "nr-clay",
  butter: "nr-butter",
  blue: "nr-blue",
  sage: "nr-sage",
} as const;

/* ============================================================
 *  Desktop picker — vertical list, hover/focus → preview highlight.
 * ============================================================ */
export function TemplatePicker({
  selected,
  onPick,
  onHighlight,
  templates,
  classroomName = "Classroom",
}: {
  selected: ReportTemplate | null;
  onPick: (t: ReportTemplate) => void;
  /** Called as the user hovers/focuses rows so the side preview can react.
   *  Selection always wins over hover for what's shown. */
  onHighlight?: (t: ReportTemplate | null) => void;
  templates: ReportTemplate[];
  classroomName?: string;
}) {
  const visibleTemplates =
    templates.length > 0
      ? templates
      : withDefaultReportTemplates([], [{ id: "unknown", name: classroomName }]);

  return (
    <div className="nr-template-list" role="radiogroup" aria-label="Templates">
      {visibleTemplates.map((t) => (
        <TemplateRow
          key={t.id}
          template={t}
          selected={selected?.id === t.id}
          onPick={() => onPick(t)}
          onMouseEnter={() => onHighlight?.(t)}
          onMouseLeave={() => onHighlight?.(null)}
          onFocus={() => onHighlight?.(t)}
          onBlur={() => onHighlight?.(null)}
        />
      ))}
    </div>
  );
}

function TemplateRow({
  template,
  selected,
  onPick,
  variant = "desktop",
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: {
  template: ReportTemplate;
  selected: boolean;
  onPick: () => void;
  variant?: "desktop" | "mobile";
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const rowClass = variant === "mobile" ? "nr-m-template-row" : "nr-template-row";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`${rowClass}${selected ? " nr-selected" : ""}`}
      onClick={onPick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <span className={`nr-tpl-icon ${TONE_TO_CLASS[template.iconTone]}`}>
        <LayoutTemplate size={14} strokeWidth={2} aria-hidden />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="nr-tpl-name" style={{ display: "block" }}>
          {template.name}
        </span>
        <span className="nr-tpl-meta" style={{ display: "block" }}>
          {template.description || `${template.sections.length} sections`}
        </span>
      </span>
      <span className="nr-tpl-tag">{template.kind}</span>
    </button>
  );
}

/** Build a `ReportPdfData` from a template's empty form so we can render
 *  the real PDF preview before the report exists.
 *
 *  Each section is rendered per its template field type:
 *  - `checklist`     → one paragraph with `field.selected = []` so every
 *                      option prints with an empty checkbox glyph.
 *  - `single_select` → one paragraph with `field.value = null` so every
 *                      option prints as an unselected radio.
 *  - `text` / missing meta → one empty prose paragraph.
 *
 *  This is what the editor produces server-side too, so the empty preview
 *  reads the same shape as the parent-facing PDF after the teacher fills
 *  it in. */
function templateToPdfData(template: ReportTemplate, child: PickerChild | null): ReportPdfData {
  // Reconstruct the raw section shape the real report stores, then run it
  // through the shared block builder so the empty-template preview looks
  // exactly like a filled report (same subject blocks, badges, controls).
  const rawSections = template.sections.map((heading) => {
    const meta = template.sectionMeta?.[heading];
    let html = "";
    if (meta?.type === "progress_topic" && isDefaultReportTemplateId(template.id)) {
      // Illustrative sample so the default-template preview isn't empty.
      html = encodeProgressTopic([
        {
          subtopicId: "preview-1",
          name: "Pink Tower",
          status: "introduced",
          comment: null,
          topicName: "Sensorial",
        },
        {
          subtopicId: "preview-2",
          name: "Brown Stair",
          status: "practicing",
          comment: null,
          topicName: "Sensorial",
        },
      ]);
    }
    return { heading, paragraphs: [{ html }] };
  });

  return {
    title: template.name,
    studentName: child?.name ?? "Student name",
    reportDate: null,
    classroom: "",
    observedBy: "Teacher",
    reportType: template.kind.toLowerCase(),
    logoUrl: template.logoUrl,
    blocks: buildReportPdfBlocks(rawSections, template.sectionMeta ?? {}),
    body: null,
  };
}

/* ============================================================
 *  Preview pane — renders the actual PDF of the empty template via the
 *  same react-pdf path the report editor uses, so the user sees the form
 *  the parents will see. Used on desktop (sticky right column) and inside
 *  the mobile accordion.
 * ============================================================ */
export function TemplatePreview({
  template,
  child = null,
  locked,
}: {
  template: ReportTemplate;
  /** Optional — when the user has already picked a child, threads through
   *  so the header reads "for Ada Okafor" instead of the placeholder. */
  child?: PickerChild | null;
  /** When true, the user has already committed to this template; we render
   *  a faint "Selected" kicker so the preview reads as the final choice
   *  rather than a hover-preview. */
  locked?: boolean;
}) {
  const data = React.useMemo(() => templateToPdfData(template, child), [template, child]);
  return (
    <div className="nr-preview" data-locked={locked ? "true" : "false"}>
      <div className="nr-preview-head">
        <div className="nr-preview-kicker">
          {locked ? "Selected · empty PDF" : "Preview · empty PDF"}
        </div>
        <h3 className="nr-preview-title">{template.name}</h3>
        {template.description && <p className="nr-preview-sub">{template.description}</p>}
      </div>
      <div className="nr-preview-pdf">
        <PdfPreviewPane data={data} />
      </div>
    </div>
  );
}

/* ============================================================
 *  Mobile template list — tap a row to select.
 * ============================================================ */
export function MobileTemplateList({
  selected,
  onPick,
  templates,
  classroomName = "Classroom",
}: {
  selected: ReportTemplate | null;
  onPick: (t: ReportTemplate) => void;
  templates: ReportTemplate[];
  classroomName?: string;
}) {
  const visibleTemplates =
    templates.length > 0
      ? templates
      : withDefaultReportTemplates([], [{ id: "unknown", name: classroomName }]);

  return (
    <div className="nr-m-template-list">
      {visibleTemplates.map((t) => {
        const isSelected = selected?.id === t.id;
        return (
          <div key={t.id} className="nr-m-template-item">
            <button
              type="button"
              className={`nr-m-template-row${isSelected ? " nr-selected" : ""}`}
              role="radio"
              aria-checked={isSelected}
              onClick={() => onPick(t)}
            >
              <span className={`nr-tpl-icon ${TONE_TO_CLASS[t.iconTone]}`}>
                <LayoutTemplate size={14} strokeWidth={2} aria-hidden />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="nr-tpl-name" style={{ display: "block" }}>
                  {t.name}
                </span>
                <span className="nr-tpl-meta" style={{ display: "block" }}>
                  {t.description || `${t.sections.length} sections`}
                </span>
              </span>
              <span className="nr-tpl-tag">{t.kind}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
