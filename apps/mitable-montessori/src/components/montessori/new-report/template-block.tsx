"use client";

import * as React from "react";
import { ChevronDown, LayoutTemplate } from "lucide-react";
import { PdfPreviewPane } from "@/components/montessori/report-detail/pdf-preview-pane";
import type { ReportPdfData } from "@/lib/pdf/report-template";
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
}: {
  selected: ReportTemplate | null;
  onPick: (t: ReportTemplate) => void;
  /** Called as the user hovers/focuses rows so the side preview can react.
   *  Selection always wins over hover for what's shown. */
  onHighlight?: (t: ReportTemplate | null) => void;
  templates: ReportTemplate[];
}) {
  if (templates.length === 0) {
    return (
      <div className="nr-empty-row" style={{ padding: "16px 14px" }}>
        Loading templates…
      </div>
    );
  }

  return (
    <div className="nr-template-list" role="radiogroup" aria-label="Templates">
      {templates.map((t) => (
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
  return {
    title: template.name,
    studentName: child?.name ?? "Student name",
    reportDate: null,
    classroom: "",
    reportType: template.kind.toLowerCase(),
    logoUrl: template.logoUrl,
    sections: template.sections.map((heading) => {
      const meta = template.sectionMeta?.[heading];
      if (meta?.type === "checklist") {
        return {
          heading,
          paragraphs: [
            { text: "", field: { kind: "checklist", options: meta.options, selected: [] } },
          ],
        };
      }
      if (meta?.type === "single_select") {
        return {
          heading,
          paragraphs: [
            { text: "", field: { kind: "single_select", options: meta.options, value: null } },
          ],
        };
      }
      return { heading, paragraphs: [{ text: "" }] };
    }),
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
 *  Mobile template card — list row + chevron accordion that expands
 *  to show the PDF preview inline beneath the row.
 * ============================================================ */
export function MobileTemplateList({
  selected,
  onPick,
  templates,
  child = null,
}: {
  selected: ReportTemplate | null;
  onPick: (t: ReportTemplate) => void;
  templates: ReportTemplate[];
  /** Thread the picked child into the inline PDF preview header. */
  child?: PickerChild | null;
}) {
  // Independent of selection — the user can preview a different template
  // than the one currently selected without losing their pick.
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (templates.length === 0) {
    return (
      <div className="nr-empty-row" style={{ padding: "16px 14px" }}>
        Loading templates…
      </div>
    );
  }

  return (
    <div className="nr-m-template-list">
      {templates.map((t) => {
        const isExpanded = expandedId === t.id;
        const isSelected = selected?.id === t.id;
        return (
          <div key={t.id} className="nr-m-template-item">
            <div className={`nr-m-template-row${isSelected ? " nr-selected" : ""}`}>
              <button
                type="button"
                className="nr-m-template-rowMain"
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
              <button
                type="button"
                className="nr-m-template-previewBtn"
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Hide preview" : "Preview empty form"}
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  style={{ transform: isExpanded ? "rotate(180deg)" : "none" }}
                />
              </button>
            </div>
            {isExpanded && (
              <div className="nr-m-template-preview">
                <TemplatePreview template={t} child={child} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
