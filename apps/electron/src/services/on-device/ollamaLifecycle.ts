/**
 * Ollama Lifecycle
 *
 * Coordinated startup/shutdown of the Ollama-based on-device AI pipeline.
 * Replaces the old multi-server lifecycle (vision + text + whisper) with a
 * single Ollama instance serving one Gemma 4 model.
 *
 * Startup sequence:
 *   1. Detect hardware tier (constrained vs capable)
 *   2. Ensure Ollama is installed
 *   3. Start `ollama serve`
 *   4. Pull the appropriate Gemma 4 model
 *   5. Warmup request to load model into VRAM
 */

import { createLogger } from "../../lib/logger";
import { detectHardware, type HardwareProfile, type HardwareTier } from "./hardwareDetector";
import { ollamaService, type OllamaProgressCallback } from "./ollamaService";

const logger = createLogger("OllamaLifecycle");

let _hardwareProfile: HardwareProfile | null = null;

export function getHardwareProfile(): HardwareProfile | null {
  return _hardwareProfile;
}

export function getTier(): HardwareTier | null {
  return _hardwareProfile?.tier ?? null;
}

export function getCapabilities(): {
  model: string;
  hasNativeAudio: boolean;
  tier: HardwareTier;
} | null {
  if (!_hardwareProfile) return null;
  return {
    model: _hardwareProfile.recommendedModel,
    hasNativeAudio: _hardwareProfile.hasNativeAudio,
    tier: _hardwareProfile.tier,
  };
}

export async function initialize(onProgress?: OllamaProgressCallback): Promise<HardwareProfile> {
  ollamaService.setProgressCallback(onProgress ?? null);

  _hardwareProfile = await detectHardware();
  logger.info("Hardware tier:", _hardwareProfile.tier, "Model:", _hardwareProfile.recommendedModel);

  // Constrained tier: reduce context to fit model in limited VRAM
  const numCtx = _hardwareProfile.tier === "constrained" ? 2048 : 4096;
  ollamaService.setNumCtx(numCtx);
  logger.info(`Context window set to ${numCtx} tokens`);

  await ollamaService.ensureInstalled();
  await ollamaService.startServe();
  await ollamaService.pullModel(_hardwareProfile.recommendedModel);
  await ollamaService.warmup(_hardwareProfile.recommendedModel);

  ollamaService.setProgressCallback(null);
  logger.info("On-device AI ready — model:", _hardwareProfile.recommendedModel);
  return _hardwareProfile;
}

export async function shutdown(): Promise<void> {
  await ollamaService.shutdown();
  _hardwareProfile = null;
  logger.info("On-device AI shut down");
}
