"use client";

import type { OcrWord, WorkerStatus } from "@/lib/capture/types";

export type HostInbound =
  | { type: "init"; modelUrl?: string }
  | { type: "transcribe"; jobId: string; audio: Float32Array; sampleRate: number }
  | { type: "recognize"; jobId: string; payload: ArrayBuffer; mime: string }
  | { type: "classify"; jobId: string; text: string; labels: string[] }
  | { type: "destroy" };

export type HostOutbound =
  | { type: "status"; status: WorkerStatus }
  | {
      type: "transcribe-result";
      jobId: string;
      text: string;
      durationMs: number;
      confidence?: number;
    }
  | {
      type: "recognize-result";
      jobId: string;
      text: string;
      durationMs: number;
      confidence?: number;
      words?: OcrWord[];
    }
  | {
      type: "classify-result";
      jobId: string;
      labels: string[];
      scores: number[];
      durationMs: number;
    }
  | { type: "error"; jobId?: string; message: string };

/**
 * Host wraps a Worker behind a typed promise API. The actual model code lives
 * in the worker module so heavy ML deps never enter the main bundle. A test or
 * Node consumer can pass a fake `worker` that implements postMessage/onmessage.
 */
export interface WorkerLike {
  postMessage(msg: HostInbound, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (e: MessageEvent<HostOutbound>) => void): void;
  removeEventListener(type: "message", listener: (e: MessageEvent<HostOutbound>) => void): void;
  terminate(): void;
}

export interface WorkerHostOptions {
  /** Construct the worker. Defaults to the bundled scaffold worker. */
  createWorker?: () => WorkerLike;
  onStatus?: (status: WorkerStatus) => void;
}

let pendingId = 0;

export class WorkerHost {
  private worker: WorkerLike | null = null;
  private onStatus?: (status: WorkerStatus) => void;
  private createWorker: () => WorkerLike;
  private resolvers = new Map<
    string,
    {
      resolve: (v: HostOutbound) => void;
      reject: (e: Error) => void;
    }
  >();
  private status: WorkerStatus = { state: "idle" };

  constructor(opts: WorkerHostOptions = {}) {
    this.onStatus = opts.onStatus;
    this.createWorker = opts.createWorker ?? defaultWorkerFactory;
  }

  getStatus(): WorkerStatus {
    return this.status;
  }

  async ensureWorker(): Promise<WorkerLike> {
    if (this.worker) return this.worker;
    const w = this.createWorker();
    w.addEventListener("message", this.handleMessage);
    this.worker = w;
    this.setStatus({ state: "loading", progress: 0, message: "Starting up" });
    w.postMessage({ type: "init" });
    return w;
  }

  private setStatus(s: WorkerStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  private handleMessage = (e: MessageEvent<HostOutbound>) => {
    const msg = e.data;
    if (msg.type === "status") {
      this.setStatus(msg.status);
      return;
    }
    if (msg.type === "error") {
      const id = msg.jobId;
      if (id && this.resolvers.has(id)) {
        this.resolvers.get(id)!.reject(new Error(msg.message));
        this.resolvers.delete(id);
      } else {
        this.setStatus({ state: "error", message: msg.message });
      }
      return;
    }
    if (
      msg.type === "transcribe-result" ||
      msg.type === "recognize-result" ||
      msg.type === "classify-result"
    ) {
      const r = this.resolvers.get(msg.jobId);
      if (r) {
        r.resolve(msg);
        this.resolvers.delete(msg.jobId);
      }
    }
  };

  async transcribe(
    audio: Float32Array,
    sampleRate: number
  ): Promise<{ text: string; durationMs: number; confidence?: number }> {
    const w = await this.ensureWorker();
    const jobId = `t-${++pendingId}`;
    this.setStatus({ state: "running" });
    return new Promise((resolve, reject) => {
      this.resolvers.set(jobId, {
        resolve: (m) => {
          if (m.type !== "transcribe-result") return reject(new Error("unexpected reply"));
          this.setStatus({ state: "ready" });
          resolve({ text: m.text, durationMs: m.durationMs, confidence: m.confidence });
        },
        reject,
      });
      const transferable = audio.slice();
      w.postMessage({ type: "transcribe", jobId, audio: transferable, sampleRate }, [
        transferable.buffer,
      ]);
    });
  }

  async classify(
    text: string,
    labels: string[]
  ): Promise<{ labels: string[]; scores: number[]; durationMs: number }> {
    const w = await this.ensureWorker();
    const jobId = `c-${++pendingId}`;
    this.setStatus({ state: "running" });
    return new Promise((resolve, reject) => {
      this.resolvers.set(jobId, {
        resolve: (m) => {
          if (m.type !== "classify-result") return reject(new Error("unexpected reply"));
          this.setStatus({ state: "ready" });
          resolve({ labels: m.labels, scores: m.scores, durationMs: m.durationMs });
        },
        reject,
      });
      w.postMessage({ type: "classify", jobId, text, labels });
    });
  }

  async recognize(
    payload: ArrayBuffer,
    mime: string
  ): Promise<{ text: string; durationMs: number; confidence?: number; words?: OcrWord[] }> {
    const w = await this.ensureWorker();
    const jobId = `r-${++pendingId}`;
    this.setStatus({ state: "running" });
    return new Promise((resolve, reject) => {
      this.resolvers.set(jobId, {
        resolve: (m) => {
          if (m.type !== "recognize-result") return reject(new Error("unexpected reply"));
          this.setStatus({ state: "ready" });
          resolve({
            text: m.text,
            durationMs: m.durationMs,
            confidence: m.confidence,
            words: m.words,
          });
        },
        reject,
      });
      w.postMessage({ type: "recognize", jobId, payload, mime }, [payload]);
    });
  }

  destroy() {
    if (!this.worker) return;
    this.worker.removeEventListener("message", this.handleMessage);
    try {
      this.worker.postMessage({ type: "destroy" });
    } catch {
      // Worker may already be terminated; terminate() below is the source of truth.
    }
    this.worker.terminate();
    this.worker = null;
    this.setStatus({ state: "idle" });
  }
}

function defaultWorkerFactory(): WorkerLike {
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers unavailable in this environment");
  }
  // Capture worker is opt-in. The worker file dynamic-imports
  // @xenova/transformers + tesseract.js, which aren't installed by default.
  // The new URL(...) pattern below is statically scanned by webpack to
  // discover + bundle a worker — anything that imports `worker-host.ts`
  // would otherwise pull `capture.worker.ts` (and its deps) into the build
  // graph. We isolate it to its own module so users can lazy-load only when
  // NEXT_PUBLIC_ENABLE_CAPTURE_WORKER=1.
  if (process.env.NEXT_PUBLIC_ENABLE_CAPTURE_WORKER !== "1") {
    throw new Error(
      "Capture worker disabled. Install @xenova/transformers + tesseract.js, set NEXT_PUBLIC_ENABLE_CAPTURE_WORKER=1, and rebuild."
    );
  }
  // Dynamic import of the worker spawner — webpack only follows this branch
  // when the flag flips at build time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const mod = require("./worker-spawner") as typeof import("./worker-spawner");
  return mod.spawnWorker();
}
