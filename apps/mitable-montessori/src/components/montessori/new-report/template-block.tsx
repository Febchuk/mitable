"use client";

import * as React from "react";
import { ChevronDown, LayoutTemplate, X } from "lucide-react";
import { TEMPLATES, type ReportTemplate } from "./mock-data";

const TONE_TO_CLASS = {
  clay: "nr-clay",
  butter: "nr-butter",
  blue: "nr-blue",
  sage: "nr-sage",
} as const;

function TemplateRow({
  template,
  selected,
  onPick,
  variant = "desktop",
}: {
  template: ReportTemplate;
  selected: boolean;
  onPick: () => void;
  variant?: "desktop" | "mobile";
}) {
  const rowClass = variant === "mobile" ? "nr-m-template-row" : "nr-template-row";
  return (
    <button
      type="button"
      className={`${rowClass}${selected ? " nr-selected" : ""}`}
      onClick={onPick}
      aria-pressed={selected}
    >
      <span className={`nr-tpl-icon ${TONE_TO_CLASS[template.iconTone]}`}>
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="nr-tpl-name" style={{ display: "block" }}>
          {template.name}
        </span>
        <span className="nr-tpl-meta" style={{ display: "block" }}>
          {template.description}
        </span>
      </span>
      <span className="nr-tpl-tag">{template.kind}</span>
    </button>
  );
}

/** Desktop optional-template card. Two states: empty (button) → list (after
   the user clicks "Pick a template") → chip (when one is selected). */
export function TemplateOptCard({
  selected,
  onPick,
}: {
  selected: ReportTemplate | null;
  onPick: (t: ReportTemplate | null) => void;
}) {
  const [showList, setShowList] = React.useState(false);

  if (selected) {
    return (
      <div className="nr-opt-card nr-opt-template nr-filled">
        <div className="nr-opt-head">
          <span className="nr-opt-ico">
            <LayoutTemplate size={14} strokeWidth={2} />
          </span>
          Template
          <span
            style={{
              marginLeft: "auto",
              fontWeight: 400,
              color: "var(--color-ink-muted)",
              fontSize: 11.5,
              fontStyle: "italic",
            }}
          >
            admin-managed
          </span>
        </div>
        <div
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}
        >
          <span className="nr-template-chip">
            <svg
              width={11}
              height={11}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="4" />
            </svg>
            {selected.name}
            <button
              type="button"
              className="nr-template-chip-x"
              onClick={() => onPick(null)}
              aria-label="Clear template"
            >
              <X size={9} strokeWidth={2.5} />
            </button>
          </span>
          <span style={{ fontSize: 11.5, color: "var(--color-ink-muted)" }}>
            {selected.sections.length} starter sections · {selected.sections.join(" · ")}
          </span>
        </div>
      </div>
    );
  }

  if (!showList) {
    return (
      <div className="nr-opt-card nr-opt-template">
        <div className="nr-opt-head">
          <span className="nr-opt-ico">
            <LayoutTemplate size={14} strokeWidth={2} />
          </span>
          Template
          <span
            style={{
              marginLeft: "auto",
              fontWeight: 400,
              color: "var(--color-ink-muted)",
              fontSize: 11.5,
              fontStyle: "italic",
            }}
          >
            admin-managed
          </span>
        </div>
        <div className="nr-opt-help">
          Start from one of your school&rsquo;s templates, or skip and the assistant drafts from
          scratch.
        </div>
        <button type="button" className="nr-opt-action" onClick={() => setShowList(true)}>
          <ChevronDown size={11} strokeWidth={2} />
          Pick a template
        </button>
      </div>
    );
  }

  return (
    <div className="nr-opt-card nr-opt-template nr-filled">
      <div className="nr-opt-head">
        <span className="nr-opt-ico">
          <LayoutTemplate size={14} strokeWidth={2} />
        </span>
        Template
        <button
          type="button"
          className="nr-opt-action"
          style={{ marginLeft: "auto", marginTop: 0 }}
          onClick={() => setShowList(false)}
        >
          Cancel
        </button>
      </div>
      <div className="nr-opt-help">Tap one to use as the starting structure.</div>
      <div className="nr-template-list">
        {TEMPLATES.map((t) => (
          <TemplateRow
            key={t.id}
            template={t}
            selected={false}
            onPick={() => {
              onPick(t);
              setShowList(false);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Mobile collapsible template card (accordion). */
export function TemplateMobileCard({
  selected,
  onPick,
}: {
  selected: ReportTemplate | null;
  onPick: (t: ReportTemplate | null) => void;
}) {
  const [open, setOpen] = React.useState(!!selected);

  return (
    <details className="nr-m-template-card" open={open}>
      <summary
        className="nr-m-template-head"
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        style={{ listStyle: "none" }}
      >
        <span
          className={`nr-tpl-icon ${selected ? TONE_TO_CLASS[selected.iconTone] : "nr-butter"}`}
        >
          <LayoutTemplate size={14} strokeWidth={2} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="nr-tpl-name" style={{ display: "block" }}>
            {selected ? selected.name : "Pick a template"}
          </span>
          <span className="nr-tpl-meta" style={{ display: "block" }}>
            {selected ? `${selected.sections.length} starter sections` : "Optional · admin-managed"}
          </span>
        </span>
        <ChevronDown
          className="nr-chev"
          size={16}
          strokeWidth={2}
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </summary>
      {open && (
        <div className="nr-m-template-list">
          {selected && (
            <button
              type="button"
              className="nr-m-template-row"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
              style={{ color: "var(--color-ink-muted)" }}
            >
              <span style={{ width: 28, display: "grid", placeItems: "center" }}>
                <X size={14} strokeWidth={2} />
              </span>
              <span>
                <span className="nr-tpl-name" style={{ display: "block" }}>
                  Clear template
                </span>
                <span className="nr-tpl-meta" style={{ display: "block" }}>
                  Draft from scratch
                </span>
              </span>
              <span />
            </button>
          )}
          {TEMPLATES.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              selected={selected?.id === t.id}
              onPick={() => {
                onPick(t);
                setOpen(false);
              }}
              variant="mobile"
            />
          ))}
        </div>
      )}
    </details>
  );
}
