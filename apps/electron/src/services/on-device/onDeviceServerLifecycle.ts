/**
 * Start / stop on-device AI servers as a coordinated group.
 *
 * GPU servers (llama-server):
 *   1. Vision server (SmolVLM2) — required for sensor during session
 *   2. Text server (Phi-3.5) — best-effort; if VRAM is insufficient the
 *      startup fails gracefully and we fall back to sequential mode
 *
 * CPU tool (whisper-cli):
 *   Whisper runs on CPU independently — no VRAM, no CUDA init. It is
 *   started alongside the GPU servers but doesn't participate in the
 *   atomic rollback because it can't cause VRAM issues.
 *
 * Parallel vs sequential mode:
 *   - Parallel: both vision + text servers running — classifier runs in
 *     real-time during the session, storyteller fires immediately at end
 *   - Sequential: only vision during session — at session end the vision
 *     server is stopped, the text server is started, and deferred
 *     classification + storytelling runs over buffered sensor data
 */

import { createLogger } from "../../lib/logger";
import { llamaServerService } from "./llamaServerService";
import { textServerService } from "./textServerService";
import { whisperServerService } from "./whisperServerService";

const logger = createLogger("OnDeviceLifecycle");

let _parallelMode = false;

export function isParallelMode(): boolean {
  return _parallelMode;
}

export async function startOnDeviceServersAtomic(): Promise<void> {
  // 1. Vision server on GPU (required — sensor needs it immediately)
  await llamaServerService.start();

  // 2. Text server on GPU (best-effort for parallel mode)
  try {
    await textServerService.start();
    _parallelMode = true;
    logger.info("Parallel mode: text server (Phi-3.5) started alongside vision server");
  } catch (err) {
    _parallelMode = false;
    logger.warn(
      "Sequential mode: text server failed to start (likely VRAM), will swap at session end:",
      String(err)
    );
  }

  // 3. Whisper CLI on CPU (independent — no VRAM, no rollback needed)
  try {
    await whisperServerService.start();
    logger.info("Whisper CLI ready (CPU-only, no VRAM used)");
  } catch (err) {
    logger.warn("Whisper CLI failed to initialize (audio transcription disabled):", String(err));
  }
}

/**
 * Start only the text server (used in sequential mode at session end
 * after the vision server has been stopped to free VRAM).
 */
export async function startTextServerForSequentialMode(): Promise<void> {
  await textServerService.start();
  logger.info("Text server started for sequential-mode classification + storytelling");
}

export async function stopOnDeviceServersBoth(): Promise<void> {
  _parallelMode = false;
  await Promise.allSettled([
    whisperServerService.stop(),
    textServerService.stop(),
    llamaServerService.stop(),
  ]);
}
