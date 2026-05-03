/**
 * Stub for browser-side audio transcription.
 *
 * The full implementation will use @xenova/transformers running Whisper-tiny
 * in a Web Worker. Lazy-loaded the first time the user records audio so the
 * ~75MB model never ships with the main bundle.
 *
 * This stub keeps the `transcribeAudio` interface stable so callers can wire
 * up against it now; once the dep is installed, the body fills in.
 */

export type Transcription = {
  text: string;
  /** Word-level segments if the model returns them (Whisper does). */
  segments?: Array<{ start: number; end: number; text: string }>;
};

let warned = false;

export async function transcribeAudio(_audio: Blob): Promise<Transcription> {
  // TODO(capture): swap for transformers.js Whisper pipeline. See
  //   https://github.com/xenova/transformers.js
  // Until the dep is installed, return an empty transcript so the agent
  // still gets the existing observation context but no audio-derived facts.
  if (!warned && typeof console !== "undefined") {
    console.warn("[capture] whisper transcription not yet wired up; returning empty transcript");
    warned = true;
  }
  return { text: "" };
}
