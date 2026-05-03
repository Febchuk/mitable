"use client";

import * as React from "react";
import { Mic, Play, Pause, X } from "lucide-react";
import { ToastBus } from "../primitives";
import { formatDuration, type AudioMemo } from "./mock-data";
import type { RecorderState } from "./use-audio-recorder";

const WAVE_HEIGHTS = [30, 60, 80, 100, 70, 90, 55, 75, 95, 50, 85, 65, 70, 40, 80, 90, 60, 75];

/** Waveform that animates while recording. */
export function LiveWave({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div className={size === "lg" ? "nr-m-live" : "nr-recording-wave"}>
      {WAVE_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="nr-bar"
          style={{ height: `${h}%`, animationDelay: `${(i * 0.06).toFixed(2)}s` }}
        />
      ))}
    </div>
  );
}

/** Static deterministic waveform used in the recorded preview. */
function StaticWave() {
  return (
    <div className="nr-static-wave">
      {WAVE_HEIGHTS.map((h, i) => (
        <span key={i} className="nr-b" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function AudioPreview({ memo, onRemove }: { memo: AudioMemo; onRemove: () => void }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    audioRef.current = new Audio(memo.url);
    const a = audioRef.current;
    const onEnd = () => setPlaying(false);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("ended", onEnd);
      a.pause();
      audioRef.current = null;
    };
  }, [memo.url]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.currentTime = 0;
      void a.play();
      setPlaying(true);
    }
  };

  return (
    <div className="nr-audio-preview">
      <button
        type="button"
        className="nr-play"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
      </button>
      <StaticWave />
      <span className="nr-audio-meta">{formatDuration(memo.durationSec)}</span>
      <button
        type="button"
        className="nr-audio-x"
        onClick={onRemove}
        aria-label="Remove voice memo"
      >
        <X size={11} strokeWidth={2.2} />
      </button>
    </div>
  );
}

/** Desktop "Voice memo" optional card. */
export function AudioOptCard({
  state,
  elapsed,
  memo,
  onStart,
  onStop,
  onClear,
}: {
  state: RecorderState;
  elapsed: number;
  memo: AudioMemo | null;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
}) {
  const isRecording = state === "recording";
  const isRecorded = state === "recorded" && memo;

  React.useEffect(() => {
    if (state === "denied") {
      ToastBus.push({
        message: "Microphone access denied. Enable it in browser settings to record.",
      });
    } else if (state === "error") {
      ToastBus.push({ message: "Couldn't start recording. Try again." });
    }
  }, [state]);

  return (
    <div className={`nr-opt-card${isRecording || isRecorded ? " nr-filled" : ""}`}>
      <div className="nr-opt-head">
        <span className="nr-opt-ico">
          <Mic size={14} strokeWidth={2} />
        </span>
        Voice memo
      </div>

      {!isRecording && !isRecorded && (
        <>
          <div className="nr-opt-help">
            Talk for a minute. The assistant will transcribe and pull facts into the draft.
          </div>
          <button type="button" className="nr-opt-action" onClick={onStart}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: "var(--color-terracotta)",
                marginRight: 4,
              }}
            />
            Start recording
          </button>
        </>
      )}

      {isRecording && (
        <>
          <div
            className="nr-opt-help"
            style={{ color: "var(--color-terracotta-deep)", fontWeight: 500 }}
          >
            Listening… speak naturally about the day.
          </div>
          <LiveWave />
          <div className="nr-rec-meta">
            <span className="nr-rec-time">{formatDuration(elapsed)}</span>
            <button type="button" className="nr-rec-stop" onClick={onStop}>
              <span className="nr-square" />
              Stop
            </button>
          </div>
        </>
      )}

      {isRecorded && memo && <AudioPreview memo={memo} onRemove={onClear} />}
    </div>
  );
}
