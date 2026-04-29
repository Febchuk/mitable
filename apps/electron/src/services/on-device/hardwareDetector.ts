/**
 * Hardware Detector
 *
 * Auto-detects GPU capabilities to determine which Gemma 4 model tier to use:
 *   - "constrained" (<12 GB VRAM): gemma4:e2b — text + image + audio (~7.2 GB)
 *   - "capable" (12 GB+ VRAM):     gemma4:e4b  — text + image + audio (~9.6 GB)
 *
 * On Mac with unified memory, 16 GB+ is treated as "capable".
 *
 * NOTE: Gemma "effective" param counts are misleading — E2B is 5.1B total,
 * E4B is 8B total (includes embeddings + vision/audio encoders).
 * E4B needs ~10 GB loaded, so it won't fit in 8 GB VRAM GPUs.
 */

import { execFile } from "child_process";
import { createLogger } from "../../lib/logger";

const logger = createLogger("HardwareDetector");

export type HardwareTier = "constrained" | "capable";

export interface HardwareProfile {
  tier: HardwareTier;
  vramMB: number;
  gpuName: string;
  recommendedModel: string;
  hasNativeAudio: boolean;
}

const CONSTRAINED_MODEL = "gemma4:e2b";
const CAPABLE_MODEL = "gemma4:e4b";
const VRAM_THRESHOLD_MB = 12_000;
const MAC_MEMORY_THRESHOLD_MB = 16_000;

function classifyTier(vramMB: number): HardwareTier {
  return vramMB >= VRAM_THRESHOLD_MB ? "capable" : "constrained";
}

function buildProfile(tier: HardwareTier, vramMB: number, gpuName: string): HardwareProfile {
  return {
    tier,
    vramMB,
    gpuName,
    recommendedModel: tier === "capable" ? CAPABLE_MODEL : CONSTRAINED_MODEL,
    hasNativeAudio: true,
  };
}

async function detectNvidiaGpu(): Promise<{ vramMB: number; name: string } | null> {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 5_000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        const line = stdout.trim().split("\n")[0];
        const [name, memStr] = line.split(",").map((s) => s.trim());
        const vramMB = parseInt(memStr, 10);
        if (isNaN(vramMB)) {
          resolve(null);
          return;
        }
        resolve({ vramMB, name: name || "NVIDIA GPU" });
      }
    );
  });
}

async function detectMacMemory(): Promise<number> {
  return new Promise((resolve) => {
    execFile("sysctl", ["-n", "hw.memsize"], { timeout: 3_000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(0);
        return;
      }
      const bytes = parseInt(stdout.trim(), 10);
      resolve(isNaN(bytes) ? 0 : Math.round(bytes / (1024 * 1024)));
    });
  });
}

export async function detectHardware(): Promise<HardwareProfile> {
  if (process.platform === "darwin") {
    const totalMemMB = await detectMacMemory();
    const tier: HardwareTier = totalMemMB >= MAC_MEMORY_THRESHOLD_MB ? "capable" : "constrained";
    const profile = buildProfile(tier, totalMemMB, `Apple Silicon (${totalMemMB} MB unified)`);
    logger.info("Detected Mac hardware", profile);
    return profile;
  }

  const nvidia = await detectNvidiaGpu();
  if (nvidia) {
    const tier = classifyTier(nvidia.vramMB);
    const profile = buildProfile(tier, nvidia.vramMB, nvidia.name);
    logger.info("Detected NVIDIA GPU", profile);
    return profile;
  }

  logger.warn("No GPU detected, defaulting to constrained tier (CPU-only)");
  return buildProfile("constrained", 0, "No GPU detected");
}
