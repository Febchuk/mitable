"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Clock, Search, X } from "lucide-react";
import { initialsFor } from "../data";
import { type PickerChild } from "./child-picker";
import { MobileTemplateList } from "./template-block";
import { type NewReportPayload, type ReportTemplate } from "./mock-data";

type Step = 1 | 2;
type CapturedToday = Record<string, { voice: number; photos: number }>;

export function NewReportMobile({
  open,
  onClose,
  onSubmit,
  roster,
  capturedToday,
  templates,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: NewReportPayload) => void;
  roster: PickerChild[];
  capturedToday: CapturedToday;
  templates: ReportTemplate[];
  submitting?: boolean;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [child, setChild] = React.useState<PickerChild | null>(null);
  const [template, setTemplate] = React.useState<ReportTemplate | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setChild(null);
      setTemplate(null);
      setQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    if (!child || !template) return;
    onSubmit({
      childId: child.id,
      kind: template.kind,
      templateId: template.id,
    });
  };

  return (
    <div className="nr-mobile-fullscreen" role="dialog" aria-modal="true">
      {step === 1 && (
        <Step1Child
          child={child}
          query={query}
          setQuery={setQuery}
          onPick={(c) => {
            setChild(c);
            setStep(2);
          }}
          onClose={onClose}
          roster={roster}
          capturedToday={capturedToday}
        />
      )}
      {step === 2 && (
        <Step2Template
          child={child!}
          template={template}
          onPick={setTemplate}
          templates={templates}
          submitting={submitting}
          onBack={() => setStep(1)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

/* ============================================================
 *  Step 1 — Child
 * ============================================================ */
function Step1Child({
  child,
  query,
  setQuery,
  onPick,
  onClose,
  roster,
  capturedToday,
}: {
  child: PickerChild | null;
  query: string;
  setQuery: (q: string) => void;
  onPick: (c: PickerChild) => void;
  onClose: () => void;
  roster: PickerChild[];
  capturedToday: CapturedToday;
}) {
  const filter = query.trim().toLowerCase();
  const matches = filter ? roster.filter((c) => c.name.toLowerCase().includes(filter)) : roster;
  const today = matches.filter((c) => capturedToday[c.id]);
  const others = matches.filter((c) => !capturedToday[c.id]);

  return (
    <>
      <div className="nr-m-head">
        <div className="nr-m-left">
          <button type="button" className="nr-m-iconbtn" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
          <span className="nr-m-title">New report</span>
        </div>
        <DotRail step={1} />
      </div>

      <div className="nr-m-page-head">
        <div className="nr-m-crest">first up ✿</div>
        <h1>Who&rsquo;s this for?</h1>
        <p>Type to filter, or pick from today&rsquo;s captures.</p>
      </div>

      <div className="nr-m-search">
        <Search size={16} strokeWidth={2} />
        <input
          placeholder="Search children…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search children"
        />
      </div>

      <div className="nr-m-body">
        {today.length > 0 && (
          <>
            <div className="nr-m-group-head">
              <Clock size={11} strokeWidth={2.5} />
              Captured today
            </div>
            {today.map((c) => (
              <MobileChildRow
                key={c.id}
                child={c}
                selected={child?.id === c.id}
                onPick={() => onPick(c)}
                badge={capturedToday[c.id]}
              />
            ))}
          </>
        )}
        {others.length > 0 && (
          <>
            <div className="nr-m-group-head">All children</div>
            {others.map((c) => (
              <MobileChildRow
                key={c.id}
                child={c}
                selected={child?.id === c.id}
                onPick={() => onPick(c)}
              />
            ))}
          </>
        )}
        {matches.length === 0 && <div className="nr-empty-row">No children match.</div>}
      </div>

      <div className="nr-m-foot">
        <button
          type="button"
          className="nr-m-btn-primary"
          disabled={!child}
          onClick={() => child && onPick(child)}
        >
          {child ? "Continue" : "Choose a child to continue"}
        </button>
      </div>
    </>
  );
}

function MobileChildRow({
  child,
  selected,
  onPick,
  badge,
}: {
  child: PickerChild;
  selected: boolean;
  onPick: () => void;
  badge?: { voice: number; photos: number };
}) {
  return (
    <button type="button" className={`nr-m-row${selected ? " nr-selected" : ""}`} onClick={onPick}>
      <span className={`nr-av nr-${child.tone}`} style={{ width: 40, height: 40, fontSize: 14 }}>
        {initialsFor(child.name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="nr-name" style={{ display: "block" }}>
          {child.name}
        </span>
        <span className="nr-sub" style={{ display: "block" }}>
          {child.age ?? ""}
        </span>
      </span>
      {badge ? (
        <span className="nr-today-badge">
          📷 {badge.voice}·{badge.photos}
        </span>
      ) : (
        <span />
      )}
    </button>
  );
}

/* ============================================================
 *  Step 2 — Template (with inline preview)
 * ============================================================ */
function Step2Template({
  child,
  template,
  onPick,
  templates,
  submitting,
  onBack,
  onSubmit,
}: {
  child: PickerChild;
  template: ReportTemplate | null;
  onPick: (t: ReportTemplate) => void;
  templates: ReportTemplate[];
  submitting?: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <div className="nr-m-head">
        <div className="nr-m-left">
          <button type="button" className="nr-m-iconbtn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div>
            <span className="nr-m-title">For {child.name.split(" ")[0]}</span>
            <div className="nr-m-subtitle">{child.age}</div>
          </div>
        </div>
        <DotRail step={2} />
      </div>

      <div className="nr-m-page-head">
        <div className="nr-m-crest">pick a template</div>
        <h1>Template</h1>
        <p>
          We&rsquo;ll draft the empty form. Tap the chevron to preview a template&rsquo;s sections.
        </p>
      </div>

      <div className="nr-m-body">
        <MobileTemplateList
          selected={template}
          onPick={onPick}
          templates={templates}
          child={child}
        />
      </div>

      <div className="nr-m-foot">
        <button
          type="button"
          className="nr-m-btn-primary"
          disabled={!template || submitting}
          onClick={onSubmit}
        >
          {submitting ? "Starting…" : "Start drafting"}
          <ArrowRight size={14} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

function DotRail({ step }: { step: Step }) {
  return (
    <div className="nr-dot-rail" aria-label={`Step ${step} of 2`}>
      {[1, 2].map((s) => (
        <span
          key={s}
          className={`nr-dot${s < step ? " nr-done" : ""}${s === step ? " nr-active" : ""}`}
        />
      ))}
    </div>
  );
}
