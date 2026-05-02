"use client";

import { StubAsrEngine, WhisperAsrEngine } from "@/lib/capture/asr-engine";
import { StubOcrEngine, TesseractOcrEngine } from "@/lib/capture/ocr-engine";
import type { AsrEngine, OcrEngine, WorkerStatus } from "@/lib/capture/types";

export interface EngineFactories {
  createAsr: () => AsrEngine;
  createOcr: () => OcrEngine;
}

let factories: EngineFactories = {
  createAsr: () => new WhisperAsrEngine(),
  createOcr: () => new TesseractOcrEngine(),
};

let asrSingleton: AsrEngine | null = null;
let ocrSingleton: OcrEngine | null = null;

/** Test hook — swap real engines for stubs/spies. */
export function setCaptureFactoriesForTest(next: Partial<EngineFactories>) {
  factories = {
    createAsr: next.createAsr ?? factories.createAsr,
    createOcr: next.createOcr ?? factories.createOcr,
  };
  asrSingleton?.destroy();
  ocrSingleton?.destroy();
  asrSingleton = null;
  ocrSingleton = null;
}

/** Reset to production defaults. */
export function resetCaptureFactories() {
  factories = {
    createAsr: () => new WhisperAsrEngine(),
    createOcr: () => new TesseractOcrEngine(),
  };
  asrSingleton?.destroy();
  ocrSingleton?.destroy();
  asrSingleton = null;
  ocrSingleton = null;
}

export function getAsrEngine(): AsrEngine {
  if (!asrSingleton) asrSingleton = factories.createAsr();
  return asrSingleton;
}

export function getOcrEngine(): OcrEngine {
  if (!ocrSingleton) ocrSingleton = factories.createOcr();
  return ocrSingleton;
}

/** True if the device looks capable of running on-device ML.  */
export function captureSupported(): { voice: boolean; photo: boolean } {
  if (typeof window === "undefined") return { voice: false, photo: false };
  const hasMic = !!navigator.mediaDevices?.getUserMedia;
  const hasWorkers = typeof Worker !== "undefined";
  return { voice: hasMic && hasWorkers, photo: hasMic && hasWorkers };
}

/** Convenience: subscribe to engine status without holding a ref. */
export function onAsrStatusOnce(handler: (s: WorkerStatus) => void): () => void {
  const e = getAsrEngine();
  let cancelled = false;
  // Engines surface progress via init({ onProgress }); kick init if not yet started.
  void e
    .init({
      onProgress: (s) => {
        if (cancelled) return;
        handler(s);
      },
    })
    .catch((err) => handler({ state: "error", message: (err as Error).message }));
  return () => {
    cancelled = true;
  };
}

// Re-export stub helpers so tests can import from one place.
export { StubAsrEngine, StubOcrEngine };
