/**
 * Start / stop on-device AI servers as a coordinated group.
 *
 * Startup order:
 *   1. Vision server (SmolVLM2) — required for sensor during session
 *   2. Text server (Phi-3.5) — best-effort; if VRAM is insufficient the
 *      startup fails gracefully and we fall back to sequential mode
 *   3. Whisper — audio transcription; if it fails, everything rolls back
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
  // 1. Vision server (required — sensor needs it immediately)
  await llamaServerService.start();

  // 2. Text server (best-effort for parallel mode)
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

  // 3. Whisper (required — if it fails, roll back everything)
  try {
    await whisperServerService.start();
  } catch (err) {
    logger.warn("Whisper failed after llama started; stopping all servers for clean state");
    await Promise.allSettled([textServerService.stop(), llamaServerService.stop()]);
    _parallelMode = false;
    throw err;
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
