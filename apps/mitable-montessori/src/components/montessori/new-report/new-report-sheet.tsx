"use client";

import * as React from "react";
import { ArrowRight, X } from "lucide-react";
import type { Child } from "../data";
import { ChildPicker } from "./child-picker";
import { TypePicker } from "./type-picker";
import { AudioOptCard } from "./audio-block";
import { NotesOptCard } from "./notes-block";
import { TemplateOptCard } from "./template-block";
import { useAudioRecorder } from "./use-audio-recorder";
import {
  formatDuration,
  type CapturedNote,
  type NewReportPayload,
  type ReportKind,
  type ReportTemplate,
} from "./mock-data";

export function NewReportSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: NewReportPayload) => void;
}) {
  const [child, setChild] = React.useState<Child | null>(null);
  const [kind, setKind] = React.useState<ReportKind | null>(null);
  const [notes, setNotes] = React.useState<CapturedNote[]>([]);
  const [template, setTemplate] = React.useState<ReportTemplate | null>(null);

  const recorder = useAudioRecorder();

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset state whenever the sheet opens
  React.useEffect(() => {
    if (open) {
      setChild(null);
      setKind(null);
      setNotes([]);
      setTemplate(null);
      recorder.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const canStart = !!child && !!kind && recorder.state !== "recording";
  const isRecording = recorder.state === "recording";

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

  const summary = (
    <NrSummary
      child={child}
      kind={kind}
      audioDuration={recorder.memo?.durationSec ?? null}
      isRecording={isRecording}
      noteCount={notes.length}
      templateName={template?.name ?? null}
    />
  );

  return (
    <>
      <div className="nr-scrim" onClick={() => !isRecording && onClose()} />
      <aside className="nr-sheet" role="dialog" aria-modal="true" aria-labelledby="nr-sheet-title">
        <header className="nr-head">
          <span className="nr-crest">A new report ✿</span>
          <div style={{ marginTop: 4, minWidth: 0 }}>
            <h2 id="nr-sheet-title">Start a report</h2>
            <p>
              Pick a child and a type. Add audio, handwritten notes, or a template — or hand it all
              to the assistant.
            </p>
          </div>
          <button type="button" className="nr-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="nr-body scroll-quiet">
          <div className="nr-field">
            <div className="nr-field-label">
              <span className="nr-label-cap">Child</span>
              <span className="nr-req">required</span>
            </div>
            <ChildPicker value={child} onChange={setChild} />
          </div>

          <div className="nr-field">
            <div className="nr-field-label">
              <span className="nr-label-cap">Report type</span>
              <span className="nr-req">required</span>
            </div>
            <TypePicker value={kind} onChange={setKind} variant="grid" />
          </div>

          <div className="nr-field">
            <div className="nr-with-hand-label">
              <span className="nr-label-cap">Optional · capture</span>
              <span className="nr-hand">skip if you&rsquo;d rather just talk</span>
            </div>

            <div className="nr-opt-grid">
              <AudioOptCard
                state={recorder.state}
                elapsed={recorder.elapsed}
                memo={recorder.memo}
                onStart={recorder.start}
                onStop={recorder.stop}
                onClear={recorder.clear}
              />
              <NotesOptCard
                notes={notes}
                onAdd={(n) => setNotes((prev) => [...prev, ...n])}
                onRemove={(id) => {
                  setNotes((prev) => {
                    const target = prev.find((x) => x.id === id);
                    if (target) URL.revokeObjectURL(target.url);
                    return prev.filter((x) => x.id !== id);
                  });
                }}
              />
              <TemplateOptCard selected={template} onPick={setTemplate} />
            </div>
          </div>
        </div>

        <footer className="nr-foot">
          <div className="nr-foot-meta">{summary}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button type="button" className="nr-btn nr-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="nr-btn nr-btn-primary"
              disabled={!canStart}
              onClick={submit}
            >
              Start drafting
              <ArrowRight size={14} strokeWidth={2.5} />
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

function NrSummary({
  child,
  kind,
  audioDuration,
  isRecording,
  noteCount,
  templateName,
}: {
  child: Child | null;
  kind: ReportKind | null;
  audioDuration: number | null;
  isRecording: boolean;
  noteCount: number;
  templateName: string | null;
}) {
  if (!child || !kind) return <span>Pick a child and a type to start.</span>;

  const pieces: string[] = [`${child.name.split(" ")[0]} · ${kind}`];
  if (isRecording) pieces.push("recording…");
  else if (audioDuration != null) pieces.push(formatDuration(audioDuration));
  if (noteCount > 0) pieces.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
  if (templateName) pieces.push(templateName);

  return (
    <span>
      <b>{pieces[0]}</b>
      {pieces.length > 1 && ` · ${pieces.slice(1).join(" · ")}`}
    </span>
  );
}
