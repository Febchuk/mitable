/**
 * Ollama Lifecycle
 *
 * Coordinated startup/shutdown of the Ollama-based on-device AI pipeline.
 * One Ollama instance serves a single model chosen by hardware tier:
 *   integrated  → gemma3:4b-it-qat  (4 GB, accurate vision + JSON)
 *   constrained → gemma4:e2b        (7.2 GB)
 *   capable     → gemma4:e4b        (10 GB)
 *
 * Startup: detect tier → install Ollama → start serve → pull model → warmup.
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

  const numCtx = _hardwareProfile.tier === "integrated" ? 8192 : 32768;
  ollamaService.setNumCtx(numCtx);
  logger.info(`Context window set to ${numCtx} tokens (tier: ${_hardwareProfile.tier})`);

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
