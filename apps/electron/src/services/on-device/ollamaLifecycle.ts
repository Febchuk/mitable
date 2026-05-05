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
let _initError: string | null = null;
let _isInitialized = false;

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

export function getInitStatus(): { isInitialized: boolean; error: string | null } {
  return { isInitialized: _isInitialized, error: _initError };
}

export async function initialize(onProgress?: OllamaProgressCallback): Promise<HardwareProfile> {
  ollamaService.setProgressCallback(onProgress ?? null);
  _initError = null;

  try {
    _hardwareProfile = await detectHardware();
    logger.info(
      "Hardware tier:",
      _hardwareProfile.tier,
      "Model:",
      _hardwareProfile.recommendedModel
    );

    const numCtx = _hardwareProfile.tier === "integrated" ? 8192 : 32768;
    ollamaService.setNumCtx(numCtx);
    logger.info(`Context window set to ${numCtx} tokens (tier: ${_hardwareProfile.tier})`);

    await ollamaService.ensureInstalled();
    await ollamaService.startServe();

    // Check if model already exists before pulling (resumes if partial)
    const modelExists = await ollamaService.verifyModelExists(_hardwareProfile.recommendedModel);
    if (modelExists) {
      logger.info("Model already exists, skipping pull:", _hardwareProfile.recommendedModel);
    } else {
      await ollamaService.pullModel(_hardwareProfile.recommendedModel);
    }

    await ollamaService.warmup(_hardwareProfile.recommendedModel);

    _isInitialized = true;
    ollamaService.setProgressCallback(null);
    logger.info("On-device AI ready — model:", _hardwareProfile.recommendedModel);
    return _hardwareProfile;
  } catch (err) {
    _initError = String(err);
    _isInitialized = false;
    ollamaService.setProgressCallback(null);
    logger.error("On-device AI initialization failed:", _initError);
    throw err;
  }
}

/**
 * Retry initialization after a failure.
 * Call this from settings UI when user clicks "Retry".
 */
export async function retryInitialize(
  onProgress?: OllamaProgressCallback
): Promise<HardwareProfile> {
  _isInitialized = false;
  _initError = null;

  // If we have a hardware profile, try to delete the potentially corrupted model first
  if (_hardwareProfile) {
    try {
      await ollamaService.deleteModel(_hardwareProfile.recommendedModel);
    } catch {
      /* ignore delete errors */
    }
  }

  return initialize(onProgress);
}

export async function shutdown(): Promise<void> {
  await ollamaService.shutdown();
  _hardwareProfile = null;
  _isInitialized = false;
  logger.info("On-device AI shut down");
}
