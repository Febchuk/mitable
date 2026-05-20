"use client";

import * as React from "react";
import type { AudioMemo } from "./mock-data";

/** Flush MediaRecorder every second so long recordings are not held in one buffer. */
const RECORDER_TIMESLICE_MS = 1000;

/**
 * Wraps MediaRecorder for a single voice memo. Local-only — keeps the blob
 * and an object URL in state until the user submits or cancels.
 *
 * Returns: state ("idle" | "recording" | "recorded" | "denied" | "error"),
 * elapsed seconds while recording, the recorded memo when done, and three
 * actions: start / stop / clear.
 */
export type RecorderState = "idle" | "recording" | "recorded" | "denied" | "error";

export function useAudioRecorder() {
  const [state, setState] = React.useState<RecorderState>("idle");
  const [memo, setMemo] = React.useState<AudioMemo | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  const recRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const tickRef = React.useRef<number | null>(null);
  const startedAtRef = React.useRef<number>(0);

  const stopTick = React.useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const teardownStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
  }, []);

  const start = React.useCallback(async () => {
    if (state === "recording") return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window === "undefined" ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setState("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const supported = candidates.find((t) =>
        typeof MediaRecorder.isTypeSupported === "function"
          ? MediaRecorder.isTypeSupported(t)
          : false
      );
      const rec = supported
        ? new MediaRecorder(stream, { mimeType: supported })
        : new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const mimeType = rec.mimeType || supported || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        setMemo({ url, blob, mimeType, durationSec });
        setState("recorded");
        teardownStream();
      };
      rec.start(RECORDER_TIMESLICE_MS);
      startedAtRef.current = Date.now();
      setElapsed(0);
      stopTick();
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
      setState("recording");
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setState(denied ? "denied" : "error");
    }
  }, [state, stopTick, teardownStream]);

  const stop = React.useCallback(() => {
    if (state !== "recording") return;
    stopTick();
    recRef.current?.stop();
  }, [state, stopTick]);

  const clear = React.useCallback(() => {
    stopTick();
    if (memo?.url) URL.revokeObjectURL(memo.url);
    setMemo(null);
    setElapsed(0);
    setState("idle");
    teardownStream();
  }, [memo, stopTick, teardownStream]);

  React.useEffect(() => {
    return () => {
      stopTick();
      teardownStream();
      if (memo?.url) URL.revokeObjectURL(memo.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, memo, elapsed, start, stop, clear };
}
