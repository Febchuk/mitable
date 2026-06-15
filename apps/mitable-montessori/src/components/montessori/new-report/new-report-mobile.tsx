"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Clock, Search, X } from "lucide-react";
import { initialsFor } from "../data";
import { type PickerChild } from "./child-picker";
import { IncidentCaptureStep } from "./incident-capture-step";
import { ReportTypePicker } from "./report-type-picker";
import { buildBuiltinReportTemplateId } from "@/lib/reports/default-template";
import { type NewReportPayload, type ReportKind } from "./mock-data";

type Step = 1 | 2 | 3;
type CapturedToday = Record<string, { voice: number; photos: number }>;

export function NewReportMobile({
  open,
  onClose,
  onSubmit,
  roster,
  capturedToday,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: NewReportPayload) => void;
  roster: PickerChild[];
  capturedToday: CapturedToday;
  submitting?: boolean;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [child, setChild] = React.useState<PickerChild | null>(null);
  const [reportKind, setReportKind] = React.useState<ReportKind | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setChild(null);
      setReportKind(null);
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

  const submitPayload = (kind: ReportKind, incidentTranscript?: string) => {
    if (!child) return;
    onSubmit({
      childId: child.id,
      kind,
      templateId: buildBuiltinReportTemplateId(kind),
      incidentTranscript,
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
      {step === 2 && child && (
        <Step2Type
          child={child}
          reportKind={reportKind}
          onPick={(kind) => {
            setReportKind(kind);
            if (kind === "Incident") setStep(3);
            else submitPayload(kind);
          }}
          submitting={submitting}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && child && (
        <div className="nr-m-incident-wrap">
          <IncidentCaptureStep
            childFirstName={child.name.split(" ")[0]}
            onBack={() => setStep(2)}
            onContinue={(transcript) => submitPayload("Incident", transcript)}
            submitting={submitting}
          />
        </div>
      )}
    </div>
  );
}

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
        <DotRail step={1} total={3} />
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
            {today.length > 0 ? <div className="nr-m-group-head">All children</div> : null}
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

function Step2Type({
  child,
  reportKind,
  onPick,
  submitting,
  onBack,
}: {
  child: PickerChild;
  reportKind: ReportKind | null;
  onPick: (kind: ReportKind) => void;
  submitting?: boolean;
  onBack: () => void;
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
        <DotRail step={2} total={3} />
      </div>

      <div className="nr-m-page-head">
        <div className="nr-m-crest">report type</div>
        <h1>What kind of report?</h1>
        <p>We&rsquo;ll pull progress from their classroom curriculum.</p>
      </div>

      <div className="nr-m-body">
        <ReportTypePicker selected={reportKind} onPick={onPick} variant="mobile" />
      </div>

      <div className="nr-m-foot">
        <button
          type="button"
          className="nr-m-btn-primary"
          disabled={!reportKind || reportKind === "Incident" || submitting}
        >
          {submitting ? "Starting…" : "Tap a type above to continue"}
          <ArrowRight size={14} strokeWidth={2.5} />
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

function DotRail({ step, total }: { step: number; total: number }) {
  return (
    <div className="nr-dot-rail" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map((s) => (
        <span
          key={s}
          className={`nr-dot${s < step ? " nr-done" : ""}${s === step ? " nr-active" : ""}`}
        />
      ))}
    </div>
  );
}
