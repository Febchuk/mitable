/**
 * Stub for browser-side OCR of handwritten notes.
 *
 * The full implementation will use Tesseract.js running in a Web Worker.
 * Lazy-loaded the first time the user attaches a photo of notes.
 *
 * Like whisper.ts, this stub keeps the interface stable so the new-report
 * flow can call it today; the body fills in once the dep is installed.
 */

export type OcrResult = {
  text: string;
  /** 0..1 confidence reported by the engine. */
  confidence?: number;
};

let warned = false;

export async function ocrImage(_image: Blob): Promise<OcrResult> {
  // TODO(capture): swap for Tesseract.js. See https://github.com/naptha/tesseract.js
  if (!warned && typeof console !== "undefined") {
    console.warn("[capture] OCR not yet wired up; returning empty text");
    warned = true;
  }
  return { text: "", confidence: 0 };
}
