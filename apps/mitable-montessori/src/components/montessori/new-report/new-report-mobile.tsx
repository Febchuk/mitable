"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Clock, Search, X } from "lucide-react";
import { initialsFor } from "../data";
import { type PickerChild } from "./child-picker";
import { TypePicker } from "./type-picker";
import { LiveWave, AudioPreview } from "./audio-block";
import { NotesMobileRow } from "./notes-block";
import { TemplateMobileCard } from "./template-block";
import { useAudioRecorder } from "./use-audio-recorder";
import {
  formatDuration,
  type CapturedNote,
  type NewReportPayload,
  type ReportKind,
  type ReportTemplate,
} from "./mock-data";

type Step = 1 | 2 | 3 | 4;
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
  const [kind, setKind] = React.useState<ReportKind | null>(null);
  const [notes, setNotes] = React.useState<CapturedNote[]>([]);
  const [template, setTemplate] = React.useState<ReportTemplate | null>(null);
  const [query, setQuery] = React.useState("");

  const recorder = useAudioRecorder();

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setChild(null);
      setKind(null);
      setNotes([]);
      setTemplate(null);
      setQuery("");
      recorder.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!child || !kind) return;
    onSubmit({
      childId: child.id,
      kind,
      audio: recorder.memo,
      notes,
      templateId: template?.id ?? null,
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
        <Step2Type
          child={child!}
          kind={kind}
          setKind={setKind}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Step3Capture
          child={child!}
          kind={kind!}
          recorder={recorder}
          notes={notes}
          setNotes={setNotes}
          template={template}
          setTemplate={setTemplate}
          templates={templates}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <Step4Review
          child={child!}
          kind={kind!}
          audioDuration={recorder.memo?.durationSec ?? null}
          noteCount={notes.length}
          template={template}
          submitting={submitting}
          onBack={() => setStep(3)}
          onSubmit={submit}
          onJump={(s) => setStep(s)}
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
 *  Step 2 — Type
 * ============================================================ */
function Step2Type({
  child,
  kind,
  setKind,
  onBack,
  onNext,
}: {
  child: PickerChild;
  kind: ReportKind | null;
  setKind: (k: ReportKind) => void;
  onBack: () => void;
  onNext: () => void;
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
        <div className="nr-m-crest">what kind?</div>
        <h1>Pick a type</h1>
        <p>The assistant tunes its drafting to fit.</p>
      </div>

      <div className="nr-m-body">
        <TypePicker value={kind} onChange={setKind} variant="stack" />
      </div>

      <div className="nr-m-foot">
        <button type="button" className="nr-m-btn-primary" disabled={!kind} onClick={onNext}>
          Continue
          <ArrowRight size={14} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

/* ============================================================
 *  Step 3 — Capture
 * ============================================================ */
function Step3Capture({
  child,
  kind,
  recorder,
  notes,
  setNotes,
  template,
  setTemplate,
  templates,
  onBack,
  onNext,
}: {
  child: PickerChild;
  kind: ReportKind;
  recorder: ReturnType<typeof useAudioRecorder>;
  notes: CapturedNote[];
  setNotes: React.Dispatch<React.SetStateAction<CapturedNote[]>>;
  template: ReportTemplate | null;
  setTemplate: (t: ReportTemplate | null) => void;
  templates: ReportTemplate[];
  onBack: () => void;
  onNext: () => void;
}) {
  const isRecording = recorder.state === "recording";
  const isRecorded = recorder.state === "recorded" && recorder.memo;

  return (
    <>
      <div className="nr-m-head">
        <div className="nr-m-left">
          <button type="button" className="nr-m-iconbtn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <span className="nr-m-title">
            {child.name.split(" ")[0]} · {kind}
          </span>
        </div>
        <DotRail step={3} />
      </div>

      <div className="nr-m-page-head">
        <div className="nr-m-crest">capture, or skip</div>
        <h1>Anything to add?</h1>
        <p>All optional. The assistant can also draft from scratch.</p>
      </div>

      <div className="nr-m-body nr-m-capture">
        {/* Voice memo */}
        <div className="nr-m-opt-block">
          <div className="nr-m-opt-title">
            <span className="nr-label-cap">Voice memo</span>
            {isRecording && <span className="nr-hand">listening…</span>}
            {isRecorded && <span className="nr-m-opt-skip">recorded</span>}
            {!isRecording && !isRecorded && <span className="nr-m-opt-skip">optional</span>}
          </div>

          {!isRecording && !isRecorded && (
            <div className="nr-m-recorder-card">
              <button
                type="button"
                className="nr-m-record-btn"
                onClick={recorder.start}
                aria-label="Start recording"
              >
                <span className="nr-core" />
              </button>
              <div className="nr-copy">
                <b>Tap to record</b>Talk for a minute about the day.
              </div>
            </div>
          )}

          {isRecording && (
            <div className="nr-m-recorder-card nr-recording">
              <button
                type="button"
                className="nr-m-record-btn nr-recording"
                onClick={recorder.stop}
                aria-label="Stop recording"
              >
                <span className="nr-core" />
              </button>
              <div className="nr-copy">
                <b>{formatDuration(recorder.elapsed)}</b>Tap to stop. We&rsquo;ll transcribe it.
              </div>
              <LiveWave size="lg" />
            </div>
          )}

          {isRecorded && recorder.memo && (
            <AudioPreview memo={recorder.memo} onRemove={recorder.clear} />
          )}
        </div>

        {/* Handwritten notes */}
        <div className="nr-m-opt-block">
          <div className="nr-m-opt-title">
            <span className="nr-label-cap">Handwritten notes</span>
            <span className="nr-m-opt-skip">
              {notes.length > 0 ? `${notes.length} added` : "optional · AI will read"}
            </span>
          </div>
          <NotesMobileRow
            notes={notes}
            onAdd={(n) => setNotes((prev) => [...prev, ...n])}
            onRemove={(id) =>
              setNotes((prev) => {
                const target = prev.find((x) => x.id === id);
                if (target) URL.revokeObjectURL(target.url);
                return prev.filter((x) => x.id !== id);
              })
            }
          />
        </div>

        {/* Template */}
        <div className="nr-m-opt-block">
          <div className="nr-m-opt-title">
            <span className="nr-label-cap">Template</span>
            <span className="nr-m-opt-skip">admin-managed · optional</span>
          </div>
          <TemplateMobileCard selected={template} onPick={setTemplate} templates={templates} />
        </div>
      </div>

      <div className="nr-m-foot">
        <button
          type="button"
          className="nr-m-btn-secondary"
          onClick={onNext}
          disabled={isRecording}
        >
          Skip
        </button>
        <button type="button" className="nr-m-btn-primary" onClick={onNext} disabled={isRecording}>
          Continue
          <ArrowRight size={14} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

/* ============================================================
 *  Step 4 — Review
 * ============================================================ */
function Step4Review({
  child,
  kind,
  audioDuration,
  noteCount,
  template,
  submitting,
  onBack,
  onSubmit,
  onJump,
}: {
  child: PickerChild;
  kind: ReportKind;
  audioDuration: number | null;
  noteCount: number;
  template: ReportTemplate | null;
  submitting?: boolean;
  onBack: () => void;
  onSubmit: () => void;
  onJump: (step: Step) => void;
}) {
  return (
    <>
      <div className="nr-m-head">
        <div className="nr-m-left">
          <button type="button" className="nr-m-iconbtn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <span className="nr-m-title">One last look</span>
        </div>
        <DotRail step={4} />
      </div>

      <div className="nr-m-page-head">
        <div className="nr-m-crest">ready ✿</div>
        <h1>Looks good?</h1>
        <p>The assistant will draft from this and bring you to the editor.</p>
      </div>

      <div className="nr-m-body">
        <div className="nr-m-review-card">
          <div className="nr-m-review-row" style={{ alignItems: "center" }}>
            <span
              className={`nr-av nr-${child.tone}`}
              style={{ width: 36, height: 36, fontSize: 13 }}
            >
              {initialsFor(child.name)}
            </span>
            <div style={{ flex: 1 }}>
              <div className="nr-value">
                <b>{child.name}</b>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--color-ink-muted)", marginTop: 1 }}>
                {child.age}
              </div>
            </div>
            <button type="button" className="nr-edit" onClick={() => onJump(1)}>
              Change
            </button>
          </div>

          <div className="nr-m-review-row">
            <span className="nr-label-cap">Type</span>
            <span className="nr-value">
              <b>{kind}</b>
            </span>
            <button type="button" className="nr-edit" onClick={() => onJump(2)}>
              Edit
            </button>
          </div>

          <div className="nr-m-review-row">
            <span className="nr-label-cap">Audio</span>
            <span className="nr-value">
              {audioDuration != null ? (
                <>
                  <b>{formatDuration(audioDuration)}</b> voice memo
                </>
              ) : (
                <span style={{ color: "var(--color-ink-muted)" }}>None</span>
              )}
            </span>
            <button type="button" className="nr-edit" onClick={() => onJump(3)}>
              Edit
            </button>
          </div>

          <div className="nr-m-review-row">
            <span className="nr-label-cap">Notes</span>
            <span className="nr-value">
              {noteCount > 0 ? (
                <>{noteCount} attached</>
              ) : (
                <span style={{ color: "var(--color-ink-muted)" }}>None</span>
              )}
            </span>
            <button type="button" className="nr-edit" onClick={() => onJump(3)}>
              Edit
            </button>
          </div>

          <div className="nr-m-review-row">
            <span className="nr-label-cap">Template</span>
            <span className="nr-value">
              {template ? (
                <b>{template.name}</b>
              ) : (
                <span style={{ color: "var(--color-ink-muted)" }}>From scratch</span>
              )}
            </span>
            <button type="button" className="nr-edit" onClick={() => onJump(3)}>
              Change
            </button>
          </div>
        </div>

        <div className="nr-m-review-callout">
          <span className="nr-ai-glyph" aria-hidden>
            ✦
          </span>
          <div>
            The assistant will use your audio &amp; notes as primary sources
            {template ? (
              <>
                , and the <b>{template.name}</b> structure to organize the draft
              </>
            ) : null}
            . You can edit anything in the editor.
          </div>
        </div>
      </div>

      <div className="nr-m-foot">
        <button type="button" className="nr-m-btn-primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Starting…" : "Start drafting"}
          <ArrowRight size={14} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

function DotRail({ step }: { step: Step }) {
  return (
    <div className="nr-dot-rail" aria-label={`Step ${step} of 4`}>
      {[1, 2, 3, 4].map((s) => (
        <span
          key={s}
          className={`nr-dot${s < step ? " nr-done" : ""}${s === step ? " nr-active" : ""}`}
        />
      ))}
    </div>
  );
}
