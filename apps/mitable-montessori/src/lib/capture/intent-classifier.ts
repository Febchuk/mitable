"use client";

import type { WorkerStatus } from "@/lib/capture/types";
import { WorkerHost, type WorkerLike } from "@/lib/capture/worker-host";

export type IntentLabel =
  | "mark_attendance"
  | "record_progress"
  | "add_observation_note"
  | "request_clarification";

export const INTENT_HYPOTHESES: Record<IntentLabel, string> = {
  mark_attendance: "This text marks a student as present or absent.",
  record_progress: "This text records mastery or progress on a Montessori material.",
  add_observation_note: "This text adds a free-form observation about a student.",
  request_clarification: "This text is unclear or unrelated to the classroom.",
};

const ORDERED_LABELS: IntentLabel[] = [
  "mark_attendance",
  "record_progress",
  "add_observation_note",
  "request_clarification",
];

export interface ClassifyOutcome {
  /** Top-1 NLI label. */
  label: IntentLabel;
  /** Top-1 score in [0, 1]. */
  score: number;
  /** top1 - top2; used to detect ambiguity. */
  margin: number;
  /** Wall-clock inference time in ms. */
  durationMs: number;
}

export interface IntentClassifier {
  init(opts?: { onProgress?: (status: WorkerStatus) => void }): Promise<void>;
  classify(tokenizedText: string): Promise<ClassifyOutcome>;
  isReady(): boolean;
  destroy(): void;
}

const HYPOTHESIS_TO_LABEL = new Map<string, IntentLabel>(
  ORDERED_LABELS.map((l) => [INTENT_HYPOTHESES[l], l])
);

function intoOutcome(
  raw: { labels: string[]; scores: number[]; durationMs: number }
): ClassifyOutcome {
  // The pipeline returns labels in score-descending order — but we map back
  // to the canonical IntentLabel via the hypothesis sentence so callers don't
  // depend on sentence wording.
  const top = raw.labels[0];
  const second = raw.scores[1] ?? 0;
  const top1 = raw.scores[0] ?? 0;
  const label = HYPOTHESIS_TO_LABEL.get(top) ?? "request_clarification";
  return {
    label,
    score: top1,
    margin: top1 - second,
    durationMs: raw.durationMs,
  };
}

/**
 * Production classifier — runs Xenova/nli-deberta-v3-small in a Web Worker.
 */
export class NliIntentClassifier implements IntentClassifier {
  private host: WorkerHost;
  private ready = false;

  constructor(opts: { onStatus?: (s: WorkerStatus) => void } = {}) {
    this.host = new WorkerHost({
      onStatus: opts.onStatus,
      createWorker: defaultIntentWorkerFactory,
    });
  }

  async init(opts: { onProgress?: (status: WorkerStatus) => void } = {}) {
    if (opts.onProgress) {
      const proxy = new WorkerHost({
        onStatus: (s) => {
          opts.onProgress?.(s);
          if (s.state === "ready") this.ready = true;
        },
        createWorker: defaultIntentWorkerFactory,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).host = proxy;
    }
    await this.host.ensureWorker();
  }

  async classify(tokenizedText: string): Promise<ClassifyOutcome> {
    const labels = ORDERED_LABELS.map((l) => INTENT_HYPOTHESES[l]);
    const raw = await this.host.classify(tokenizedText, labels);
    this.ready = true;
    return intoOutcome(raw);
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
 * Stub classifier — returns a scripted outcome. Used by tests and as a safe
 * fallback when the NLI worker can't be spawned.
 */
export class StubIntentClassifier implements IntentClassifier {
  private ready = false;
  constructor(
    private script: (text: string) => { label: IntentLabel; score: number; margin: number } = () => ({
      label: "request_clarification",
      score: 0.5,
      margin: 0,
    })
  ) {}

  async init() {
    this.ready = true;
  }

  async classify(text: string): Promise<ClassifyOutcome> {
    const r = this.script(text);
    return { ...r, durationMs: 1 };
  }

  isReady() {
    return this.ready;
  }

  destroy() {
    this.ready = false;
  }
}

function defaultIntentWorkerFactory(): WorkerLike {
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers unavailable in this environment");
  }
  // The intent worker dynamic-imports @xenova/transformers, which is already
  // a dependency for Whisper. We still gate the worker spawn behind a flag
  // so the new model download (~40MB) doesn't kick in for users who haven't
  // opted into local intent classification yet.
  if (process.env.NEXT_PUBLIC_ENABLE_LOCAL_INTENT !== "1") {
    throw new Error(
      "Local intent classifier disabled. Set NEXT_PUBLIC_ENABLE_LOCAL_INTENT=1 and rebuild."
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const mod = require("./intent-worker-spawner") as typeof import("./intent-worker-spawner");
  return mod.spawnIntentWorker();
}
