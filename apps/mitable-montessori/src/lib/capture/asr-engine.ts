"use client";

import type { AsrEngine, TranscriptionResult, WorkerStatus } from "@/lib/capture/types";
import { WorkerHost, type WorkerHostOptions } from "@/lib/capture/worker-host";

export class WhisperAsrEngine implements AsrEngine {
  private host: WorkerHost;
  private ready = false;

  constructor(opts: WorkerHostOptions = {}) {
    this.host = new WorkerHost(opts);
  }

  async init(opts: { onProgress?: (status: WorkerStatus) => void } = {}) {
    if (opts.onProgress) {
      // Re-wire status so the caller hears progress events too.
      const original = this.host.getStatus.bind(this.host);
      const proxy = new WorkerHost({
        onStatus: (s) => {
          opts.onProgress?.(s);
          if (s.state === "ready") this.ready = true;
        },
      });
      // Replace internal host with the proxied one. Cheap given init runs once.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).host = proxy;
      void original;
    }
    await this.host.ensureWorker();
  }

  async transcribe(audio: Float32Array, sampleRate: number): Promise<TranscriptionResult> {
    const r = await this.host.transcribe(audio, sampleRate);
    this.ready = true;
    return r;
  }

  isReady() {
    return this.ready;
  }

  destroy() {
    this.host.destroy();
    this.ready = false;
  }
}

/**
 * Test/dev engine that returns scripted transcripts. Useful when the real
 * model isn't available (CI, contributor laptops without the deps installed).
 */
export class StubAsrEngine implements AsrEngine {
  private ready = false;
  constructor(private script: (audio: Float32Array) => string = () => "") {}

  async init() {
    this.ready = true;
  }

  async transcribe(audio: Float32Array): Promise<TranscriptionResult> {
    return { text: this.script(audio), durationMs: 1, confidence: 1 };
  }

  isReady() {
    return this.ready;
  }

  destroy() {
    this.ready = false;
  }
}
