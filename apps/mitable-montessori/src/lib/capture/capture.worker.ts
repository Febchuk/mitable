/// <reference lib="webworker" />

/**
 * Capture worker: runs ASR (Whisper-tiny via transformers.js) and OCR
 * (Tesseract.js) off the main thread. Both engines are loaded lazily on first
 * use so the worker boot is cheap.
 *
 * The worker speaks the protocol defined in `worker-host.ts`:
 *   init        →  status updates → ready
 *   transcribe  →  transcribe-result | error
 *   recognize   →  recognize-result | error
 *   destroy     →  shut down
 *
 * The actual `@xenova/transformers` and `tesseract.js` imports are guarded by
 * dynamic import so this module compiles without those deps installed; calling
 * code is expected to install them before flipping the feature flag on. When
 * unavailable the worker reports a structured error which the main-thread host
 * surfaces to the UI as "voice/photo capture not available on this device."
 */

import type { HostInbound, HostOutbound } from "./worker-host";
import {
  pcmDurationSec,
  transcribeLongAudio,
  WHISPER_CHUNK_LENGTH_S,
} from "./transcribe-long-audio";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let asrPipeline:
  | ((audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string }>)
  | null = null;
let ocrWorker: {
  recognize: (img: Blob | ImageBitmap) => Promise<{
    data: {
      text: string;
      confidence: number;
      words: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }>;
    };
  }>;
  terminate: () => Promise<void>;
} | null = null;

function send(msg: HostOutbound) {
  ctx.postMessage(msg);
}

async function loadAsr() {
  if (asrPipeline) return;
  send({
    type: "status",
    status: { state: "loading", progress: 0, message: "Loading speech model" },
  });
  try {
    // CDN-loaded; see comment in intent.worker.ts:loadNli — Turbopack's worker
    // bundler breaks transformers.js's `fs` import at module evaluation.
    // URL is indirected through a string binding so TS does not attempt module
    // resolution on the literal (TS2307 at build time).
    const transformersUrl: string = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
    const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ transformersUrl)) as {
      pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
    };
    const pipe = (await mod.pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === "progress" && typeof p.progress === "number") {
          send({
            type: "status",
            status: {
              state: "loading",
              progress: Math.max(0, Math.min(1, p.progress / 100)),
              message: `Downloading ${p.file ?? "model"}`,
            },
          });
        }
      },
    })) as unknown as (
      audio: Float32Array,
      opts?: Record<string, unknown>
    ) => Promise<{ text: string }>;
    asrPipeline = pipe;
  } catch (err) {
    throw new Error(
      `ASR engine unavailable. Install @xenova/transformers and reload. (${(err as Error).message})`
    );
  }
}

async function loadOcr() {
  if (ocrWorker) return;
  send({
    type: "status",
    status: { state: "loading", progress: 0, message: "Loading text recognizer" },
  });
  try {
    const mod = (await import("tesseract.js")) as {
      createWorker: (
        lang?: string,
        oem?: number,
        opts?: { logger?: (m: { status: string; progress: number }) => void }
      ) => Promise<unknown>;
    };
    const worker = (await mod.createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        send({
          type: "status",
          status: { state: "loading", progress: m.progress, message: m.status },
        });
      },
    })) as typeof ocrWorker;
    ocrWorker = worker;
  } catch (err) {
    throw new Error(
      `OCR engine unavailable. Install tesseract.js and reload. (${(err as Error).message})`
    );
  }
}

async function handleTranscribe(jobId: string, audio: Float32Array, sampleRate: number) {
  const t0 = performance.now();
  try {
    await loadAsr();
    const inputSec = pcmDurationSec(audio, sampleRate);
    const text = await transcribeLongAudio(asrPipeline!, audio, sampleRate);
    if (typeof console !== "undefined" && inputSec > WHISPER_CHUNK_LENGTH_S) {
      console.log(`[capture][whisper] long audio ${inputSec.toFixed(1)}s → ${text.length} chars`);
    }
    send({
      type: "transcribe-result",
      jobId,
      text,
      durationMs: performance.now() - t0,
    });
  } catch (err) {
    send({ type: "error", jobId, message: (err as Error).message });
  }
}

async function handleRecognize(jobId: string, payload: ArrayBuffer, mime: string) {
  const t0 = performance.now();
  try {
    await loadOcr();
    const sourceBlob = new Blob([payload], { type: mime || "image/png" });

    // Multi-pass preprocessing (greyscale+sharpen, aggressive contrast, 2× upscale)
    // mirrors the backend's Sharp pipeline from pii-redaction.service.ts.
    const { preprocessForOCR } = await import("./preprocess-image");
    const variants = await preprocessForOCR(sourceBlob);

    send({
      type: "status",
      status: { state: "running" },
    });

    let bestText = "";
    let bestConfidence = 0;
    const allWords: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }> = [];

    for (const variant of variants) {
      const result = await ocrWorker!.recognize(variant.blob);
      const conf = result.data.confidence ?? 0;

      // Track best pass for the text sent to the LLM.
      if (
        conf > bestConfidence ||
        (conf === bestConfidence && (result.data.text ?? "").trim().length > bestText.length)
      ) {
        bestConfidence = conf;
        bestText = (result.data.text ?? "").trim();
      }

      // Accumulate words from ALL passes for PII redaction.
      for (const w of result.data.words ?? []) {
        allWords.push({
          text: w.text,
          confidence: w.confidence,
          bbox: {
            x0: Math.round(w.bbox.x0 / variant.scale),
            y0: Math.round(w.bbox.y0 / variant.scale),
            x1: Math.round(w.bbox.x1 / variant.scale),
            y1: Math.round(w.bbox.y1 / variant.scale),
          },
        });
      }
    }

    send({
      type: "recognize-result",
      jobId,
      text: bestText,
      confidence: bestConfidence,
      words: allWords,
      durationMs: performance.now() - t0,
    });
  } catch (err) {
    send({ type: "error", jobId, message: (err as Error).message });
  }
}

ctx.addEventListener("message", (e: MessageEvent<HostInbound>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      send({ type: "status", status: { state: "ready" } });
      return;
    case "transcribe":
      void handleTranscribe(msg.jobId, msg.audio, msg.sampleRate);
      return;
    case "recognize":
      void handleRecognize(msg.jobId, msg.payload, msg.mime);
      return;
    case "destroy":
      void ocrWorker?.terminate();
      asrPipeline = null;
      ocrWorker = null;
      ctx.close();
      return;
  }
});
