import type { WorkerLike } from "@/lib/capture/worker-host";

/**
 * Intent worker spawner — isolated module so webpack only resolves the
 * `new URL("./intent.worker.ts", import.meta.url)` graph when this file is
 * actually loaded. `worker-host.ts` only `require()`s this module behind the
 * NEXT_PUBLIC_ENABLE_LOCAL_INTENT flag, so production builds without the
 * NLI model don't blow up at compile time.
 */
export function spawnIntentWorker(): WorkerLike {
  return new Worker(new URL("./intent.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}
