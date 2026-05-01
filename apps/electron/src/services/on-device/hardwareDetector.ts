/**
 * Hardware Detector
 *
 * Auto-detects GPU capabilities to choose the right on-device vision model.
 * Each tier guarantees ~2 GB+ headroom above the loaded model:
 *   - "integrated" (<12 GB VRAM / no GPU): qwen3-vl:4b  (~2.5 GB, GUI-native)
 *   - "constrained" (12-16 GB VRAM):      gemma4:e2b    (~7.2 GB)
 *   - "capable"     (16 GB+ VRAM):        gemma4:e4b    (~10 GB)
 *
 * Mac unified memory: <12 GB → integrated, 12-16 GB → constrained, 16 GB+ → capable.
 * nvidia-smi failure implies integrated graphics — falls back to qwen3-vl:4b.
 *
 * detectFullSystem() provides a richer view of the machine (CPU, RAM, OS, all GPUs)
 * used by the Setup tab's system info dashboard.
 */

import os from "os";
import { execFile } from "child_process";
import { createLogger } from "../../lib/logger";

const logger = createLogger("HardwareDetector");

export type HardwareTier = "integrated" | "constrained" | "capable";

export interface HardwareProfile {
  tier: HardwareTier;
  vramMB: number;
  gpuName: string;
  recommendedModel: string;
  hasNativeAudio: boolean;
}

export type GpuVendor = "nvidia" | "amd" | "intel" | "apple" | "unknown";

export interface GpuInfo {
  name: string;
  vramMB: number;
  type: "dedicated" | "integrated";
  vendor: GpuVendor;
}

export interface SystemInfo {
  cpu: string;
  ramMB: number;
  os: string;
  gpus: GpuInfo[];
  platform: string;
}

const INTEGRATED_MODEL = "qwen3-vl:4b";
const CONSTRAINED_MODEL = "gemma4:e2b";
const CAPABLE_MODEL = "gemma4:e4b";

const CONSTRAINED_FLOOR_MB = 12_000;
const CAPABLE_FLOOR_MB = 16_000;

const MAC_CONSTRAINED_FLOOR_MB = 12_000;
const MAC_CAPABLE_FLOOR_MB = 16_000;

function classifyTier(vramMB: number): HardwareTier {
  if (vramMB >= CAPABLE_FLOOR_MB) return "capable";
  if (vramMB >= CONSTRAINED_FLOOR_MB) return "constrained";
  return "integrated";
}

function modelForTier(tier: HardwareTier): string {
  if (tier === "capable") return CAPABLE_MODEL;
  if (tier === "constrained") return CONSTRAINED_MODEL;
  return INTEGRATED_MODEL;
}

function buildProfile(tier: HardwareTier, vramMB: number, gpuName: string): HardwareProfile {
  return {
    tier,
    vramMB,
    gpuName,
    recommendedModel: modelForTier(tier),
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

function classifyMacTier(memMB: number): HardwareTier {
  if (memMB >= MAC_CAPABLE_FLOOR_MB) return "capable";
  if (memMB >= MAC_CONSTRAINED_FLOOR_MB) return "constrained";
  return "integrated";
}

export async function detectHardware(): Promise<HardwareProfile> {
  if (process.platform === "darwin") {
    const totalMemMB = await detectMacMemory();
    const tier = classifyMacTier(totalMemMB);
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

  // nvidia-smi failed → integrated graphics / no discrete GPU
  logger.warn("No discrete GPU detected, using integrated tier (qwen3-vl:4b)");
  return buildProfile("integrated", 0, "Integrated graphics");
}

/* ------------------------------------------------------------------ */
/*  Full System Detection (Setup tab dashboard)                        */
/* ------------------------------------------------------------------ */

function inferGpuVendor(name: string): GpuVendor {
  const lower = name.toLowerCase();
  if (
    lower.includes("nvidia") ||
    lower.includes("geforce") ||
    lower.includes("quadro") ||
    lower.includes("rtx") ||
    lower.includes("gtx")
  )
    return "nvidia";
  if (lower.includes("amd") || lower.includes("radeon") || lower.includes("rx ")) return "amd";
  if (lower.includes("intel") || lower.includes("uhd") || lower.includes("iris")) return "intel";
  if (lower.includes("apple")) return "apple";
  return "unknown";
}

function inferGpuType(name: string, vramMB: number): "dedicated" | "integrated" {
  const vendor = inferGpuVendor(name);
  if (vendor === "nvidia" || vendor === "amd") return "dedicated";
  if (vendor === "apple") return "dedicated";
  if (vramMB > 2048) return "dedicated";
  return "integrated";
}

function prettifyOs(): string {
  const plat = process.platform;
  const release = os.release();
  if (plat === "darwin") {
    const parts = release.split(".");
    const major = parseInt(parts[0] ?? "0", 10);
    const macVer = major >= 24 ? 15 : major >= 23 ? 14 : major >= 22 ? 13 : major - 9;
    return `macOS ${macVer} (${release})`;
  }
  if (plat === "win32") {
    const build = parseInt(release.split(".").pop() ?? "0", 10);
    const winVer = build >= 22000 ? "11" : "10";
    return `Windows ${winVer} (${release})`;
  }
  return `Linux (${release})`;
}

function runPowershell(script: string, timeout = 8_000): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve("");
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

async function detectAllNvidiaGpus(): Promise<Map<string, number>> {
  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 5_000, windowsHide: true },
      (err, stdout) => {
        const map = new Map<string, number>();
        if (err || !stdout.trim()) {
          resolve(map);
          return;
        }
        for (const line of stdout.trim().split("\n")) {
          const [name, memStr] = line.split(",").map((s) => s.trim());
          const vramMB = parseInt(memStr ?? "0", 10);
          if (name && !isNaN(vramMB)) map.set(name, vramMB);
        }
        resolve(map);
      }
    );
  });
}

async function detectWindowsGpus(): Promise<GpuInfo[]> {
  // WMI's AdapterRAM is uint32 — caps at 4 GB. Use nvidia-smi for accurate
  // VRAM on NVIDIA GPUs, then WMI fills in the rest (AMD, Intel integrated).
  const [nvidiaVram, wmiRaw] = await Promise.all([
    detectAllNvidiaGpus(),
    runPowershell(
      `Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, VideoProcessor | ` +
        `ForEach-Object { "$($_.Name)|$($_.AdapterRAM)|$($_.VideoProcessor)" }`
    ),
  ]);

  if (!wmiRaw) return [];

  const gpus: GpuInfo[] = [];
  for (const line of wmiRaw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, ramStr] = trimmed.split("|");
    if (!name) continue;
    const vendor = inferGpuVendor(name);

    // For NVIDIA GPUs, prefer nvidia-smi VRAM (accurate for >4 GB cards)
    let vramMB: number;
    if (vendor === "nvidia") {
      const wmiLower = name.trim().toLowerCase();
      const smiMatch = [...nvidiaVram.entries()].find(([smiName]) => {
        const smiLower = smiName.toLowerCase();
        return wmiLower.includes(smiLower) || smiLower.includes(wmiLower);
      });
      vramMB = smiMatch ? smiMatch[1] : 0;
    } else {
      const adapterBytes = parseInt(ramStr ?? "0", 10);
      vramMB = isNaN(adapterBytes) ? 0 : Math.round(adapterBytes / (1024 * 1024));
    }

    const type = inferGpuType(name, vramMB);
    gpus.push({ name: name.trim(), vramMB, type, vendor });
  }
  return gpus;
}

async function detectLinuxGpus(): Promise<GpuInfo[]> {
  const gpus: GpuInfo[] = [];

  const nvidia = await detectNvidiaGpu();
  if (nvidia) {
    gpus.push({
      name: nvidia.name,
      vramMB: nvidia.vramMB,
      type: "dedicated",
      vendor: "nvidia",
    });
  }

  const lspci = await new Promise<string>((resolve) => {
    execFile("lspci", { timeout: 5_000 }, (err, stdout) => resolve(err ? "" : stdout));
  });
  for (const line of lspci.split("\n")) {
    if (!/VGA|3D|Display/i.test(line)) continue;
    const name = line
      .replace(/^[^\s]+\s+/, "")
      .replace(/\s*\(rev.*\)/, "")
      .trim();
    if (gpus.some((g) => name.toLowerCase().includes(g.name.toLowerCase().split(" ")[0]!)))
      continue;
    gpus.push({ name, vramMB: 0, type: inferGpuType(name, 0), vendor: inferGpuVendor(name) });
  }

  return gpus;
}

async function detectMacGpus(): Promise<GpuInfo[]> {
  const memMB = await detectMacMemory();
  const cpuModel = os.cpus()[0]?.model ?? "Apple Silicon";
  const chipName = cpuModel.includes("Apple") ? cpuModel : "Apple Silicon";
  return [
    {
      name: `${chipName} — ${Math.round(memMB / 1024)} GB Unified Memory`,
      vramMB: memMB,
      type: "dedicated",
      vendor: "apple",
    },
  ];
}

export async function detectFullSystem(): Promise<SystemInfo> {
  const cpu = os.cpus()[0]?.model ?? "Unknown CPU";
  const ramMB = Math.round(os.totalmem() / (1024 * 1024));
  const osString = prettifyOs();
  const platform = process.platform;

  let gpus: GpuInfo[];
  if (platform === "darwin") {
    gpus = await detectMacGpus();
  } else if (platform === "win32") {
    gpus = await detectWindowsGpus();
  } else {
    gpus = await detectLinuxGpus();
  }

  if (gpus.length === 0) {
    gpus = [{ name: "Integrated Graphics", vramMB: 0, type: "integrated", vendor: "unknown" }];
  }

  const info: SystemInfo = { cpu, ramMB, os: osString, gpus, platform };
  logger.info("Full system detection", { cpu, ramMB, os: osString, gpuCount: gpus.length });
  return info;
}

/** Classify a single GPU into a HardwareTier for model recommendation. */
export function classifyGpu(gpu: GpuInfo): { tier: HardwareTier; model: string } {
  const tier = classifyTier(gpu.vramMB);
  return { tier, model: modelForTier(tier) };
}
