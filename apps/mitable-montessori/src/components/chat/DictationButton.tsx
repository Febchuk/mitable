"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startRecording, type RecordingHandle } from "@/lib/capture/audio-capture";
import { getAsrEngine } from "@/lib/capture/engines";
import { recordEvent } from "@/lib/telemetry/events";
import type { WorkerStatus } from "@/lib/capture/types";

export interface DictationButtonProps {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  /** `button` — shadcn outline + hint below. `icon` — single compact control. */
  presentation?: "button" | "icon";
  className?: string;
}

type State = "idle" | "loading-model" | "recording" | "transcribing" | "error";

/**
 * Push-to-talk dictation. Tap to start, tap to stop. Live transcription preview
 * is intentionally absent in v1 — we record the full utterance, then transcribe
 * on stop. Streaming Whisper-tiny is brittle on low-end devices.
 */
export function DictationButton({
  disabled,
  onTranscript,
  onError,
  presentation = "button",
  className,
}: DictationButtonProps) {
  const [state, setState] = useState<State>("idle");
  const [hint, setHint] = useState<string>("");
  const recordingRef = useRef<RecordingHandle | null>(null);
  const startedAtRef = useRef<number>(0);

  // Prefetch the ASR model on mount so the first dictation tap doesn't pay a
  // 75-150MB download cost in-line. The plan calls this the "setting up your
  // classroom" moment — we surface progress in the hint string.
  useEffect(() => {
    let cancelled = false;
    setState("loading-model");
    setHint("Preparing voice capture…");
    const t0 = performance.now();
    recordEvent({ name: "model_load_started", engine: "asr" });
    void getAsrEngine()
      .init({
        onProgress: (s: WorkerStatus) => {
          if (cancelled) return;
          if (s.state === "loading") {
            setHint(`${s.message} ${Math.round(s.progress * 100)}%`);
          } else if (s.state === "ready") {
            setState("idle");
            setHint("");
            recordEvent({
              name: "model_load_completed",
              engine: "asr",
              durationMs: performance.now() - t0,
            });
          } else if (s.state === "error") {
            setState("error");
            setHint(s.message);
            recordEvent({ name: "model_load_failed", engine: "asr", message: s.message });
          }
        },
      })
      .catch((err) => {
        if (cancelled) return;
        setState("error");
        setHint((err as Error).message);
        recordEvent({ name: "model_load_failed", engine: "asr", message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClick() {
    if (state === "loading-model" || state === "transcribing") return;

    if (state === "recording") {
      // Stop and transcribe.
      const handle = recordingRef.current;
      recordingRef.current = null;
      if (!handle) {
        setState("idle");
        return;
      }
      setState("transcribing");
      setHint("Transcribing…");
      try {
        const { audio, sampleRate } = await handle.stop();
        const result = await getAsrEngine().transcribe(audio, sampleRate);
        const text = result.text.trim();
        if (text) {
          onTranscript(text);
          recordEvent({
            name: "capture_completed",
            mode: "voice",
            proposalCount: 0, // Composer fills this in via its own pipeline call.
            durationMs: performance.now() - startedAtRef.current,
          });
        } else {
          recordEvent({ name: "capture_abandoned", mode: "voice", reason: "empty-transcript" });
          onError?.("Didn't catch that. Try again?");
        }
        setState("idle");
        setHint("");
      } catch (err) {
        const msg = (err as Error).message;
        setState("error");
        setHint(msg);
        onError?.(msg);
        recordEvent({ name: "capture_abandoned", mode: "voice", reason: "transcribe-failed" });
      }
      return;
    }

    // Start recording.
    try {
      recordEvent({ name: "capture_started", mode: "voice" });
      startedAtRef.current = performance.now();
      const handle = await startRecording();
      recordingRef.current = handle;
      setState("recording");
      setHint("Listening… tap to stop");
    } catch (err) {
      const msg = (err as Error).message;
      setState("error");
      setHint(msg);
      onError?.(msg);
      recordEvent({ name: "capture_abandoned", mode: "voice", reason: "permission-denied" });
    }
  }

  const isBusy = state === "loading-model" || state === "transcribing";
  const isRecording = state === "recording";
  const ariaLabel = isRecording
    ? "Stop recording"
    : isBusy
      ? hint || "Preparing voice"
      : "Dictate with voice";

  const icon = isBusy ? (
    <Loader2 size={16} strokeWidth={2} className="animate-spin" />
  ) : isRecording ? (
    <MicOff size={16} strokeWidth={2} />
  ) : (
    <Mic size={16} strokeWidth={2} />
  );

  if (presentation === "icon") {
    return (
      <button
        type="button"
        className={`${className ?? "rd-icon-btn"}${isRecording ? " rd-recording" : ""}`}
        onClick={() => void handleClick()}
        disabled={disabled || isBusy}
        aria-label={ariaLabel}
        title={hint || (isRecording ? "Listening — tap to stop" : "Dictate with voice")}
      >
        {icon}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        size="icon"
        onClick={() => void handleClick()}
        disabled={disabled || isBusy}
        aria-label={ariaLabel}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      {hint ? <p className="text-[10px] text-ink/40">{hint}</p> : null}
    </div>
  );
}
