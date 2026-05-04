/**
 * Browser-side transcription via the same Whisper worker stack as chat/dictation
 * (`WhisperAsrEngine` + `capture.worker.ts`).
 *
 * Requires `NEXT_PUBLIC_ENABLE_CAPTURE_WORKER=1` and deps
 * `@xenova/transformers` (+ worker OCR uses `tesseract.js`).
 */

"use client";

import { getAsrEngine } from "@/lib/capture/engines";
import { decodeBlobToMonoFloat32 } from "@/lib/capture/decode-audio-blob";

export type Transcription = {
  text: string;
  /** Word-level segments if the model returns them (Whisper does). */
  segments?: Array<{ start: number; end: number; text: string }>;
};

export async function transcribeAudio(blob: Blob): Promise<Transcription> {
  if (typeof window === "undefined") {
    return { text: "" };
  }
  try {
    const { audio, sampleRate } = await decodeBlobToMonoFloat32(blob);
    const engine = getAsrEngine();
    await engine.init({});
    const result = await engine.transcribe(audio, sampleRate);
    return { text: (result.text ?? "").trim() };
  } catch (err) {
    console.warn("[capture] transcribeAudio failed:", err);
    return { text: "" };
  }
}
