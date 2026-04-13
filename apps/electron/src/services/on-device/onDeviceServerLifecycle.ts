/**
 * Start / stop llama-server and whisper-server as a pair.
 *
 * Sequential start + rollback: whisper only starts after llama is healthy; if whisper fails,
 * llama is stopped so we never leave a half-running on-device stack (matches product expectation).
 */

import { createLogger } from "../../lib/logger";
import { llamaServerService } from "./llamaServerService";
import { whisperServerService } from "./whisperServerService";

const logger = createLogger("OnDeviceLifecycle");

export async function startOnDeviceServersAtomic(): Promise<void> {
  await llamaServerService.start();
  try {
    await whisperServerService.start();
  } catch (err) {
    logger.warn("Whisper failed after llama started; stopping llama for clean state");
    await llamaServerService.stop().catch(() => {});
    throw err;
  }
}

export async function stopOnDeviceServersBoth(): Promise<void> {
  await Promise.allSettled([whisperServerService.stop(), llamaServerService.stop()]);
}
