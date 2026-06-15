"use client";

import * as React from "react";
import { Mic, Square } from "lucide-react";
import { useAudioRecorder } from "./use-audio-recorder";
import { formatDuration } from "./mock-data";
import { transcribeAudio } from "@/lib/capture/whisper";

export function IncidentCaptureStep({
  childFirstName,
  onBack,
  onContinue,
  submitting,
}: {
  childFirstName: string;
  onBack: () => void;
  onContinue: (transcript: string) => void;
  submitting?: boolean;
}) {
  const { state, memo, elapsed, start, stop, clear } = useAudioRecorder();
  const [transcript, setTranscript] = React.useState("");
  const [transcribing, setTranscribing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTranscript("");
    setError(null);
    clear();
  }, [childFirstName, clear]);

  const runTranscribe = React.useCallback(async () => {
    if (!memo?.blob) return;
    setTranscribing(true);
    setError(null);
    try {
      const result = await transcribeAudio(memo.blob);
      if (!result.text.trim()) {
        setError("Couldn't hear anything — try again or type below.");
        return;
      }
      setTranscript(result.text.trim());
    } catch {
      setError("Transcription failed. Try again or type what happened.");
    } finally {
      setTranscribing(false);
    }
  }, [memo]);

  React.useEffect(() => {
    if (state === "recorded" && memo) {
      void runTranscribe();
    }
  }, [state, memo, runTranscribe]);

  const busy = submitting || transcribing;
  const canContinue = transcript.trim().length > 0 && !busy;

  return (
    <>
      <header className="nr-modal-head nr-modal-head--back">
        <button type="button" className="nr-modal-back tap" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <div className="nr-modal-head-text">
          <h2 className="font-display text-[1.35rem] font-medium leading-snug text-ink">
            What happened?
          </h2>
          <p className="text-sm leading-relaxed text-ink-secondary">
            Describe the incident for {childFirstName}&rsquo;s parents.
          </p>
        </div>
      </header>

      <div className="nr-modal-body nr-incident-body scroll-quiet flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
        <button
          type="button"
          className={`nr-incident-mic tap${state === "recording" ? " nr-incident-mic--active" : ""}`}
          disabled={busy || state === "recorded"}
          onClick={() => {
            if (state === "recording") stop();
            else void start();
          }}
          aria-label={state === "recording" ? "Stop recording" : "Start recording"}
        >
          {state === "recording" ? (
            <Square size={28} strokeWidth={2} fill="currentColor" />
          ) : (
            <Mic size={32} strokeWidth={2} />
          )}
        </button>
        <p className="nr-incident-mic-hint">
          {state === "recording"
            ? `Recording… ${formatDuration(elapsed)} — tap to stop`
            : transcribing
              ? "Transcribing…"
              : state === "recorded"
                ? "Recorded — edit the text below if needed"
                : "Tap the microphone and describe what happened"}
        </p>
        {state === "denied" ? (
          <p className="nr-incident-error">Microphone access was denied. Type below instead.</p>
        ) : null}
        {error ? <p className="nr-incident-error">{error}</p> : null}

        <label className="nr-incident-text-label" htmlFor="incident-transcript">
          Incident description
        </label>
        <textarea
          id="incident-transcript"
          className="nr-incident-textarea"
          rows={5}
          value={transcript}
          placeholder="Or type what happened here…"
          disabled={busy}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </div>

      <footer className="nr-modal-foot">
        <button
          type="button"
          className="nr-btn nr-btn-primary"
          disabled={!canContinue}
          onClick={() => onContinue(transcript.trim())}
        >
          {submitting ? "Creating report…" : "Create incident report"}
        </button>
      </footer>
    </>
  );
}
