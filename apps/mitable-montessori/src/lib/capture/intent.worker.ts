/// <reference lib="webworker" />

/**
 * Intent worker: runs zero-shot NLI (Xenova/nli-deberta-v3-small via
 * transformers.js) off the main thread. Loaded lazily on first use.
 *
 * Protocol mirrors `capture.worker.ts`:
 *   init      → status updates → ready
 *   classify  → classify-result | error
 *   destroy   → shut down
 *
 * The `@xenova/transformers` import is dynamic so this module compiles
 * without the dep installed; calling code is expected to install it before
 * flipping NEXT_PUBLIC_ENABLE_LOCAL_INTENT on. When unavailable the worker
 * reports a structured error and the host surfaces a degradation.
 */

import type { HostInbound, HostOutbound } from "./worker-host";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let nliPipeline:
  | ((
      text: string,
      labels: string[],
      opts?: Record<string, unknown>
    ) => Promise<{ labels: string[]; scores: number[] }>)
  | null = null;

function send(msg: HostOutbound) {
  ctx.postMessage(msg);
}

async function loadNli() {
  if (nliPipeline) return;
  send({
    type: "status",
    status: { state: "loading", progress: 0, message: "Loading intent model" },
  });
  try {
    // Load transformers.js from a CDN ESM URL inside the worker. Turbopack's
    // worker bundler shims `import fs from 'fs'` to null/undefined, which
    // causes `@xenova/transformers/src/env.js:36` (`!isEmpty(fs)`) to throw
    // `TypeError: Cannot convert undefined or null to object` at module
    // evaluation — before pipeline() ever runs. Loading from the CDN URL
    // bypasses Turbopack entirely; the package's own ESM bundle handles its
    // own `fs` polyfill correctly. The /* webpackIgnore: true */ pragma keeps
    // bundlers from trying to resolve the URL at build time. Keep the version
    // pinned to match package.json so the type contract holds.
    const mod = (await import(
      /* webpackIgnore: true */ /* @vite-ignore */
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
    )) as {
      pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
    };
    const pipe = (await mod.pipeline(
      "zero-shot-classification",
      "Xenova/nli-deberta-v3-small",
      {
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
      }
    )) as unknown as (
      text: string,
      labels: string[],
      opts?: Record<string, unknown>
    ) => Promise<{ labels: string[]; scores: number[] }>;
    nliPipeline = pipe;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[intent.worker] loadNli failed", err);
    const e = err as Error;
    throw new Error(
      `Intent engine unavailable. (${e.name ?? "Error"}: ${e.message})\n${e.stack ?? "(no stack)"}`
    );
  }
}

async function handleClassify(jobId: string, text: string, labels: string[]) {
  const t0 = performance.now();
  try {
    await loadNli();
    const result = await nliPipeline!(text, labels);
    send({
      type: "classify-result",
      jobId,
      labels: result.labels,
      scores: result.scores,
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
    case "classify":
      void handleClassify(msg.jobId, msg.text, msg.labels);
      return;
    case "destroy":
      nliPipeline = null;
      ctx.close();
      return;
    default:
      // transcribe / recognize are routed to the capture worker; the intent
      // worker uses a separate WorkerHost instance and shouldn't see them.
      return;
  }
});
