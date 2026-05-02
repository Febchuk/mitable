import type { WorkerLike } from "@/lib/capture/worker-host";

/**
 * Worker spawner — isolated in its own module so webpack only resolves the
 * `new URL("./capture.worker.ts", import.meta.url)` graph when this file is
 * actually loaded. `worker-host.ts` only requires this module behind the
 * NEXT_PUBLIC_ENABLE_CAPTURE_WORKER flag, so production builds without the
 * @xenova/transformers + tesseract.js deps don't blow up at compile time.
 */
export function spawnWorker(): WorkerLike {
  return new Worker(new URL("./capture.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}
