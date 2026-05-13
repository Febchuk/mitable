/**
 * Browser-side OCR via the same Tesseract worker stack as chat/camera
 * (`TesseractOcrEngine` + `capture.worker.ts`).
 *
 * Mirrors `whisper.ts` — delegates to the shared `getOcrEngine()` singleton
 * so the new-report flow gets real OCR through the same pipeline as
 * `CameraButton` and `chat-pane`.
 */

"use client";

import { getOcrEngine } from "@/lib/capture/engines";

export type OcrResult = {
  text: string;
  /** 0–1 confidence reported by the engine. */
  confidence?: number;
};

export async function ocrImage(image: Blob): Promise<OcrResult> {
  if (typeof window === "undefined") {
    return { text: "", confidence: 0 };
  }
  try {
    const engine = getOcrEngine();
    await engine.init({});
    const result = await engine.recognize(image);
    return {
      text: (result.text ?? "").trim(),
      confidence: result.confidence,
    };
  } catch (err) {
    console.warn("[capture] ocrImage failed:", err);
    return { text: "", confidence: 0 };
  }
}
