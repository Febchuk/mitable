/**
 * Model Manager Service
 *
 * Handles downloading, verifying, and managing on-device ML assets:
 * - llama-server binary (platform-specific: CUDA for Windows + NVIDIA GPU only, Metal for macOS)
 *
 * Windows note: CUDA is NVIDIA-only. AMD GPUs do not run CUDA; a future path could use
 * Vulkan/DirectML/ROCm-style builds from upstream llama.cpp — not bundled here.
 * - Vision model (SmolVLM2-2.2B-Agentic-GUI GGUF + mmproj)
 * - Text model (Phi-3 mini 3.8B GGUF for Classifier + Storyteller)
 *
 * Downloads are stored in: {userData}/on-device/
 *   ├── bin/          # llama-server binary
 *   ├── models/       # GGUF model files
 *   └── manifest.json # tracks installed components + versions
 *
 * Follows a VS Code extension-style pattern: the app ships light,
 * users opt in to download local inference components.
 */

import { app } from "electron";
import { createWriteStream, promises as fs } from "fs";
import { dirname, join, normalize } from "path";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import { createLogger } from "../../lib/logger";

const logger = createLogger("ModelManager");

// ── Asset registry ──────────────────────────────────────────────────────────

export type Platform = "win32-cuda" | "win32-cpu" | "darwin-metal" | "darwin-cpu" | "linux-cpu";
export type AssetId = "llama-server" | "vision-model" | "vision-mmproj" | "text-model" | "whisper-server" | "whisper-model";

export interface AssetDefinition {
  id: AssetId;
  label: string;
  description: string;
  sizeBytes: number;
  urls: Partial<Record<Platform, string>>;
  sha256: Partial<Record<Platform, string>>;
  filename: Partial<Record<Platform, string>>;
  isArchive?: boolean;
  required: boolean;
}

/**
 * Central registry of downloadable assets.
 *
 * URLs point to HuggingFace CDN (direct file links).
 * llama-server binaries come from llama.cpp GitHub releases.
 */
const ASSET_REGISTRY: AssetDefinition[] = [
  {
    id: "llama-server",
    label: "Inference Engine",
    description: "llama.cpp server binary for running local AI models",
    sizeBytes: 55_000_000,
    urls: {
      "win32-cuda":
        "https://github.com/ggml-org/llama.cpp/releases/download/b8690/llama-b8690-bin-win-cuda-12.4-x64.zip",
      "win32-cpu":
        "https://github.com/ggml-org/llama.cpp/releases/download/b8690/llama-b8690-bin-win-cpu-x64.zip",
      "darwin-metal":
        "https://github.com/ggml-org/llama.cpp/releases/download/b8690/llama-b8690-bin-macos-arm64.tar.gz",
      "darwin-cpu":
        "https://github.com/ggml-org/llama.cpp/releases/download/b8690/llama-b8690-bin-macos-x64.tar.gz",
    },
    sha256: {},
    filename: {
      "win32-cuda": "llama-server.exe",
      "win32-cpu": "llama-server.exe",
      "darwin-metal": "llama-server",
      "darwin-cpu": "llama-server",
    },
    required: true,
  },
  {
    id: "vision-model",
    label: "Vision Model (SmolVLM2 2.2B)",
    description: "Screen understanding model — classifies what's happening on your screen",
    sizeBytes: 1_112_600_928,
    urls: {
      "win32-cuda":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.Q4_K_M.gguf",
      "win32-cpu":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.Q4_K_M.gguf",
      "darwin-metal":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.Q4_K_M.gguf",
      "darwin-cpu":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.Q4_K_M.gguf",
    },
    sha256: {},
    filename: {
      "win32-cuda": "smolvlm2-2.2b-gui.Q4_K_M.gguf",
      "win32-cpu": "smolvlm2-2.2b-gui.Q4_K_M.gguf",
      "darwin-metal": "smolvlm2-2.2b-gui.Q4_K_M.gguf",
      "darwin-cpu": "smolvlm2-2.2b-gui.Q4_K_M.gguf",
    },
    required: true,
  },
  {
    id: "vision-mmproj",
    label: "Vision Encoder",
    description: "Image encoder for the vision model",
    sizeBytes: 592_520_928,
    urls: {
      "win32-cuda":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-Q8_0.gguf",
      "win32-cpu":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-Q8_0.gguf",
      "darwin-metal":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-Q8_0.gguf",
      "darwin-cpu":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-Q8_0.gguf",
    },
    sha256: {},
    filename: {
      "win32-cuda": "smolvlm2-2.2b-gui.mmproj-Q8_0.gguf",
      "win32-cpu": "smolvlm2-2.2b-gui.mmproj-Q8_0.gguf",
      "darwin-metal": "smolvlm2-2.2b-gui.mmproj-Q8_0.gguf",
      "darwin-cpu": "smolvlm2-2.2b-gui.mmproj-Q8_0.gguf",
    },
    required: true,
  },
  {
    id: "text-model",
    label: "Text Model (Phi-3 Mini 3.8B)",
    description: "Language model for classifying activities and generating session stories",
    sizeBytes: 2_300_000_000,
    urls: {
      "win32-cuda":
        "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
      "win32-cpu":
        "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
      "darwin-metal":
        "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
      "darwin-cpu":
        "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    },
    sha256: {},
    filename: {
      "win32-cuda": "phi-3.5-mini-instruct.Q4_K_M.gguf",
      "win32-cpu": "phi-3.5-mini-instruct.Q4_K_M.gguf",
      "darwin-metal": "phi-3.5-mini-instruct.Q4_K_M.gguf",
      "darwin-cpu": "phi-3.5-mini-instruct.Q4_K_M.gguf",
    },
    required: true,
  },
  {
    id: "whisper-server",
    label: "Whisper Server",
    description: "whisper.cpp server binary for on-device audio transcription",
    sizeBytes: 457_024_596,
    urls: {
      "win32-cuda":
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip",
      "win32-cpu":
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip",
      "darwin-metal":
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip",
      "darwin-cpu":
        "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip",
    },
    sha256: {},
    filename: {
      "win32-cuda": "whisper-server.exe",
      "win32-cpu": "whisper-server.exe",
      "darwin-metal": "whisper-server",
      "darwin-cpu": "whisper-server",
    },
    isArchive: true,
    required: true,
  },
  {
    id: "whisper-model",
    label: "Audio Model (Whisper Small)",
    description: "Speech-to-text model for on-device audio transcription",
    sizeBytes: 487_601_967,
    urls: {
      "win32-cuda":
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
      "win32-cpu":
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
      "darwin-metal":
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
      "darwin-cpu":
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    },
    sha256: {},
    filename: {
      "win32-cuda": "ggml-whisper-small.bin",
      "win32-cpu": "ggml-whisper-small.bin",
      "darwin-metal": "ggml-whisper-small.bin",
      "darwin-cpu": "ggml-whisper-small.bin",
    },
    required: true,
  },
];

// ── Manifest (tracks installed state) ───────────────────────────────────────

interface InstalledAsset {
  id: AssetId;
  version: string;
  installedAt: string;
  filePath: string;
  sizeBytes: number;
}

interface OnDeviceManifest {
  version: 1;
  platform: Platform;
  assets: InstalledAsset[];
  enabled?: boolean;
}

// ── GPU detection ───────────────────────────────────────────────────────────

/** Tuning derived from NVIDIA compute capability (and name fallback). */
export interface NvidiaInferenceTuning {
  /** llama-server `--flash-attn` value */
  llamaFlashAttn: "off" | "auto" | "on";
  /** When false, whisper-server is started with `--no-flash-attn` */
  whisperUseFlashAttn: boolean;
  /**
   * llama-server `--n-gpu-layers` (-1 = all layers on GPU). Ollama supports Pascal (e.g. GTX 1070);
   * we still use full GPU offload here and mitigate with flash-attn off + `--fit off` on older cards.
   */
  llamaGpuLayers: number;
  /**
   * When false, llama-server is started with `--fit off`. On Windows, VRAM auto-fit can spawn a
   * subprocess that misbehaves on some setups (see ggml-org/llama.cpp server issues).
   */
  llamaVramFit: boolean;
  /** If set, overrides default llama-server `--ctx-size` (lower on 8GB Pascal for headroom). */
  llamaContextSize?: number;
}

interface GpuInfo {
  hasNvidiaGpu: boolean;
  hasMetal: boolean;
  platform: Platform;
  description: string;
  /** Windows CUDA path: first GPU from nvidia-smi */
  nvidiaGpuName?: string;
  /** e.g. "6.1", "8.9" */
  nvidiaComputeCap?: string;
}

function parseNvidiaComputeCap(cap: string): { major: number; minor: number } | null {
  const t = cap.trim();
  const m = t.match(/^(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
}

// ── Download progress ───────────────────────────────────────────────────────

export interface DownloadProgress {
  assetId: AssetId;
  label: string;
  phase: "downloading" | "extracting" | "verifying" | "complete" | "error";
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  error?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

// ── Service ─────────────────────────────────────────────────────────────────

class ModelManager {
  private baseDir: string = "";
  private binDir: string = "";
  private modelsDir: string = "";
  private manifestPath: string = "";
  private manifest: OnDeviceManifest | null = null;
  private detectedPlatform: Platform | null = null;
  /** Set alongside detectedPlatform; used to enforce NVIDIA-only downloads on Windows. */
  private lastGpuInfo: GpuInfo | null = null;

  async initialize(): Promise<void> {
    this.baseDir = join(app.getPath("userData"), "on-device");
    this.binDir = join(this.baseDir, "bin");
    this.modelsDir = join(this.baseDir, "models");
    this.manifestPath = join(this.baseDir, "manifest.json");

    await fs.mkdir(this.binDir, { recursive: true });
    await fs.mkdir(this.modelsDir, { recursive: true });

    this.detectedPlatform = await this.detectPlatform();
    this.manifest = await this.loadManifest();
    await this.disableIfWindowsWithoutNvidia();

    logger.info("Initialized", {
      baseDir: this.baseDir,
      platform: this.detectedPlatform,
      installedAssets: this.manifest?.assets.length ?? 0,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async detectPlatform(): Promise<Platform> {
    if (this.detectedPlatform && this.lastGpuInfo) return this.detectedPlatform;

    const gpuInfo = await this.detectGpu();
    this.lastGpuInfo = gpuInfo;
    this.detectedPlatform = gpuInfo.platform;
    logger.info("Detected platform:", gpuInfo.description);
    return gpuInfo.platform;
  }

  /**
   * Platform key used for ASSET_REGISTRY URLs. On Windows without NVIDIA, returns null
   * so we never download CPU inference binaries (parallel vision + whisper is impractical).
   */
  getDownloadPlatform(): Platform | null {
    if (!this.detectedPlatform || !this.lastGpuInfo) return null;
    if (process.platform === "win32" && !this.lastGpuInfo.hasNvidiaGpu) return null;
    if (process.platform === "win32") return "win32-cuda";
    return this.detectedPlatform;
  }

  /** Windows: NVIDIA + CUDA builds only. macOS/Linux: allowed (CPU/Metal per detectGpu). */
  canUseOnDeviceInference(): boolean {
    if (process.platform !== "win32") return true;
    return this.lastGpuInfo?.hasNvidiaGpu === true;
  }

  getOnDeviceBlockedReason(): string | null {
    if (process.platform !== "win32") return null;
    if (this.lastGpuInfo?.hasNvidiaGpu) return null;
    return (
      "On-device AI on Windows requires an NVIDIA GPU with working drivers (nvidia-smi). " +
      "CUDA is NVIDIA-only; AMD GPUs are not supported in this build."
    );
  }

  getGpuDescription(): string {
    return this.lastGpuInfo?.description ?? "Unknown";
  }

  /**
   * Flash-attention and related flags for local servers.
   * Pascal / older GTX (e.g. 10-series): flash off + `--fit off` + slightly lower ctx — still
   * full GPU layer offload (`-ngl -1`) like Ollama-class setups on the same hardware.
   * Turing (RTX 20xx, GTX 16xx): auto / flash on for whisper.
   * Ampere+ (RTX 30xx/40xx, sm_80+): on for llama, flash on for whisper.
   * Non-Windows or no NVIDIA: conservative defaults for llama `auto`, whisper flash on.
   */
  getNvidiaInferenceTuning(): NvidiaInferenceTuning {
    const nonWin: NvidiaInferenceTuning = {
      llamaFlashAttn: "auto",
      whisperUseFlashAttn: true,
      llamaGpuLayers: -1,
      llamaVramFit: true,
    };

    if (process.platform !== "win32" || !this.lastGpuInfo?.hasNvidiaGpu) {
      return nonWin;
    }

    const name = this.lastGpuInfo.nvidiaGpuName ?? "";
    const capStr = this.lastGpuInfo.nvidiaComputeCap ?? "";
    const cap = parseNvidiaComputeCap(capStr);
    const looksRtx = /\bRTX\b/i.test(name);
    const looksLegacyGtx = /\bGTX\b/i.test(name) || /\bGT\s*\d/i.test(name);

    if (cap) {
      if (cap.major >= 8) {
        return {
          llamaFlashAttn: "on",
          whisperUseFlashAttn: true,
          llamaGpuLayers: -1,
          llamaVramFit: true,
        };
      }
      if (cap.major >= 7) {
        return {
          llamaFlashAttn: "auto",
          whisperUseFlashAttn: true,
          llamaGpuLayers: -1,
          llamaVramFit: true,
        };
      }
      return {
        llamaFlashAttn: "off",
        whisperUseFlashAttn: false,
        llamaGpuLayers: -1,
        llamaVramFit: false,
        llamaContextSize: 2048,
      };
    }

    if (looksRtx) {
      return {
        llamaFlashAttn: "auto",
        whisperUseFlashAttn: true,
        llamaGpuLayers: -1,
        llamaVramFit: true,
      };
    }
    if (looksLegacyGtx) {
      return {
        llamaFlashAttn: "off",
        whisperUseFlashAttn: false,
        llamaGpuLayers: -1,
        llamaVramFit: false,
        llamaContextSize: 2048,
      };
    }

    return {
      llamaFlashAttn: "auto",
      whisperUseFlashAttn: true,
      llamaGpuLayers: -1,
      llamaVramFit: true,
    };
  }

  windowsRequiresNvidia(): boolean {
    return process.platform === "win32";
  }

  private async disableIfWindowsWithoutNvidia(): Promise<void> {
    if (!this.manifest) return;
    if (!this.canUseOnDeviceInference() && this.isEnabled()) {
      await this.setEnabled(false);
      logger.warn("Disabled on-device AI in manifest: Windows requires an NVIDIA GPU");
    }
  }

  getAssetRegistry(): AssetDefinition[] {
    return ASSET_REGISTRY;
  }

  getInstalledAssets(): InstalledAsset[] {
    return this.manifest?.assets ?? [];
  }

  isAssetInstalled(id: AssetId): boolean {
    return this.manifest?.assets.some((a) => a.id === id) ?? false;
  }

  isFullySetUp(): boolean {
    const required = ASSET_REGISTRY.filter((a) => a.required);
    return required.every((a) => this.isAssetInstalled(a.id));
  }

  getAssetPath(id: AssetId): string | null {
    const asset = this.manifest?.assets.find((a) => a.id === id);
    return asset?.filePath ?? null;
  }

  getLlamaServerPath(): string | null {
    return this.getAssetPath("llama-server");
  }

  getVisionModelPath(): string | null {
    return this.getAssetPath("vision-model");
  }

  getVisionMmprojPath(): string | null {
    return this.getAssetPath("vision-mmproj");
  }

  getTextModelPath(): string | null {
    return this.getAssetPath("text-model");
  }

  getWhisperServerPath(): string | null {
    return this.getAssetPath("whisper-server");
  }

  getWhisperModelPath(): string | null {
    return this.getAssetPath("whisper-model");
  }

  isEnabled(): boolean {
    return this.manifest?.enabled ?? false;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.manifest) return;
    this.manifest.enabled = enabled;
    await this.saveManifest();
    logger.info(`On-device AI ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Get a summary of what needs to be downloaded and total size.
   */
  getDownloadSummary(): { assets: AssetDefinition[]; totalBytes: number } {
    const platform = this.getDownloadPlatform();
    if (!platform) return { assets: [], totalBytes: 0 };

    const missing = ASSET_REGISTRY.filter(
      (a) => !this.isAssetInstalled(a.id) && a.urls[platform]
    );
    const totalBytes = missing.reduce((sum, a) => sum + a.sizeBytes, 0);
    return { assets: missing, totalBytes };
  }

  /**
   * Download and install a single asset.
   */
  async downloadAsset(id: AssetId, onProgress?: ProgressCallback): Promise<void> {
    const platform = this.getDownloadPlatform();
    if (!platform) {
      throw new Error(
        this.getOnDeviceBlockedReason() ??
          "On-device downloads are not available on this system."
      );
    }

    const def = ASSET_REGISTRY.find((a) => a.id === id);
    if (!def) throw new Error(`Unknown asset: ${id}`);

    const url = def.urls[platform];
    if (!url) throw new Error(`No download URL for ${id} on ${platform}`);

    const filename = def.filename[platform];
    if (!filename) throw new Error(`No filename for ${id} on ${platform}`);

    const isArchive = url.endsWith(".zip") || url.endsWith(".tar.gz");
    const isBinary = id === "llama-server" || id === "whisper-server";
    const destDir = isBinary ? this.binDir : this.modelsDir;
    const destPath = join(destDir, filename);

    const progress: DownloadProgress = {
      assetId: id,
      label: def.label,
      phase: "downloading",
      bytesDownloaded: 0,
      totalBytes: def.sizeBytes,
      percent: 0,
    };

    try {
      logger.info(`Downloading ${def.label} from ${url}`);
      onProgress?.(progress);

      if (isArchive) {
        await this.downloadAndExtractArchive(url, destDir, filename, progress, onProgress);
      } else {
        await this.downloadFile(url, destPath, progress, onProgress);
      }

      if (process.platform !== "win32" && isBinary) {
        await fs.chmod(destPath, 0o755);
      }

      progress.phase = "complete";
      progress.percent = 100;
      onProgress?.(progress);

      await this.markInstalled(id, destPath, def.sizeBytes);
      logger.info(`Installed ${def.label} at ${destPath}`);
    } catch (err) {
      progress.phase = "error";
      progress.error = String(err);
      onProgress?.(progress);
      logger.error(`Failed to download ${def.label}:`, String(err));
      throw err;
    }
  }

  /**
   * Download all missing required assets in parallel.
   */
  async downloadAll(onProgress?: ProgressCallback): Promise<void> {
    const { assets } = this.getDownloadSummary();
    await Promise.all(assets.map((asset) => this.downloadAsset(asset.id, onProgress)));
  }

  /**
   * Remove all downloaded assets and reset manifest.
   */
  async removeAll(): Promise<void> {
    try {
      await fs.rm(this.baseDir, { recursive: true, force: true });
      await fs.mkdir(this.binDir, { recursive: true });
      await fs.mkdir(this.modelsDir, { recursive: true });
      this.manifest = { version: 1, platform: this.detectedPlatform!, assets: [] };
      await this.saveManifest();
      logger.info("Removed all on-device assets");
    } catch (err) {
      logger.error("Failed to remove assets:", String(err));
    }
  }

  /**
   * Remove one installed asset (file on disk + manifest entry).
   * Does not delete unrelated DLLs that may sit next to CUDA binaries in bin/.
   */
  async removeAsset(id: string): Promise<void> {
    const assetId = id as AssetId;
    if (!ASSET_REGISTRY.some((a) => a.id === assetId)) {
      throw new Error(`Unknown asset: ${id}`);
    }
    if (!this.manifest) throw new Error("Model manager not initialized");

    const idx = this.manifest.assets.findIndex((a) => a.id === assetId);
    if (idx < 0) throw new Error(`"${id}" is not installed`);

    const entry = this.manifest.assets[idx]!;
    try {
      await fs.unlink(entry.filePath);
    } catch (err) {
      logger.warn(`Could not delete file for ${id} (${entry.filePath}):`, String(err));
    }

    this.manifest.assets.splice(idx, 1);
    await this.saveManifest();
    logger.info(`Removed on-device asset ${id}`);
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private async detectGpu(): Promise<GpuInfo> {
    if (process.platform === "darwin") {
      const isArm = process.arch === "arm64";
      return {
        hasNvidiaGpu: false,
        hasMetal: isArm,
        platform: isArm ? "darwin-metal" : "darwin-cpu",
        description: isArm ? "macOS Apple Silicon (Metal)" : "macOS Intel (CPU)",
      };
    }

    if (process.platform === "win32") {
      const probe = await this.probeNvidiaWindows();
      const desc = probe.ok
        ? probe.computeCap
          ? `Windows / ${probe.name ?? "NVIDIA GPU"} (CUDA, sm_${probe.computeCap})`
          : `Windows / ${probe.name ?? "NVIDIA GPU"} (CUDA)`
        : "Windows — NVIDIA GPU required (not detected). AMD/Intel only: not supported for this build.";
      return {
        hasNvidiaGpu: probe.ok,
        hasMetal: false,
        platform: probe.ok ? "win32-cuda" : "win32-cpu",
        description: desc,
        nvidiaGpuName: probe.name,
        nvidiaComputeCap: probe.computeCap,
      };
    }

    return {
      hasNvidiaGpu: false,
      hasMetal: false,
      platform: "linux-cpu",
      description: "Linux (CPU)",
    };
  }

  /** Query first NVIDIA GPU name + compute capability (Windows). */
  private async probeNvidiaWindows(): Promise<{
    ok: boolean;
    name?: string;
    computeCap?: string;
  }> {
    try {
      const { execFile } = await import("child_process");
      const candidates =
        process.platform === "win32"
          ? [
              "nvidia-smi",
              String.raw`C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`,
            ]
          : ["nvidia-smi"];

      const queryOne = (
        bin: string,
        query: string
      ): Promise<string | undefined> =>
        new Promise((resolve) => {
          execFile(
            bin,
            ["-i", "0", `--query-gpu=${query}`, "--format=csv,noheader,nounits"],
            { windowsHide: true },
            (err, stdout) => {
              if (err) {
                resolve(undefined);
                return;
              }
              const line = stdout.trim().split(/\r?\n/)[0]?.trim();
              resolve(line && line.length > 0 ? line : undefined);
            }
          );
        });

      for (const bin of candidates) {
        const name = await queryOne(bin, "name");
        if (!name) continue;
        const computeCap = await queryOne(bin, "compute_cap");
        logger.info("NVIDIA probe:", name, "compute_cap:", computeCap ?? "(unknown)");
        return { ok: true, name, computeCap };
      }

      logger.info(
        "No NVIDIA GPU detected for CUDA path (AMD does not use CUDA; separate build TBD)"
      );
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  private async downloadFile(
    url: string,
    destPath: string,
    progress: DownloadProgress,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const contentLength = Number(response.headers.get("content-length") || progress.totalBytes);
    progress.totalBytes = contentLength;

    const body = response.body;
    if (!body) throw new Error("Empty response body");

    const fileStream = createWriteStream(destPath);
    const reader = body.getReader();
    let downloaded = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(Buffer.from(value));
        downloaded += value.byteLength;
        progress.bytesDownloaded = downloaded;
        progress.percent = Math.round((downloaded / contentLength) * 100);
        onProgress?.(progress);
      }
    } finally {
      fileStream.end();
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
    }
  }

  private async downloadAndExtractArchive(
    url: string,
    destDir: string,
    targetFilename: string,
    progress: DownloadProgress,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const isTarGz = url.endsWith(".tar.gz");
    const ext = isTarGz ? ".tar.gz" : ".zip";
    const tmpFile = join(this.baseDir, `_tmp_${Date.now()}${ext}`);

    try {
      await this.downloadFile(url, tmpFile, progress, onProgress);

      progress.phase = "extracting";
      onProgress?.(progress);

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // tar.exe ships with Windows 10+ and handles both .zip and .tar.gz
      if (isTarGz) {
        await execAsync(`tar -xzf "${tmpFile}" -C "${destDir}"`);
      } else {
        await execAsync(`tar -xf "${tmpFile}" -C "${destDir}"`);
      }

      const expectedPath = join(destDir, targetFilename);
      try {
        await fs.access(expectedPath);
      } catch {
        const extracted = await this.findFileRecursive(destDir, targetFilename);
        if (extracted) {
          const sourceDir = dirname(extracted);
          // whisper-cublas / llama zips often nest the exe with CUDA DLLs in a subfolder.
          // Moving only the .exe breaks LoadLibrary (exit 0xC0000135). Copy DLLs up to bin/.
          if (normalize(sourceDir) !== normalize(destDir)) {
            await this.copyWindowsDllsFromDir(sourceDir, destDir);
          }
          await fs.rename(extracted, expectedPath);
        } else {
          throw new Error(`Could not find ${targetFilename} after extraction`);
        }
      }
    } finally {
      try {
        await fs.unlink(tmpFile);
      } catch {
        // ignore cleanup failures
      }
    }
  }

  /** Copy companion .dll next to the final binary (Windows CUDA builds). */
  private async copyWindowsDllsFromDir(fromDir: string, toDir: string): Promise<void> {
    if (process.platform !== "win32") return;
    let names: string[];
    try {
      names = await fs.readdir(fromDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.toLowerCase().endsWith(".dll")) continue;
      const src = join(fromDir, name);
      const dst = join(toDir, name);
      try {
        const st = await fs.stat(src);
        if (st.isFile()) await fs.copyFile(src, dst);
      } catch {
        // skip individual copy failures
      }
    }
    logger.info(`Copied CUDA/companion DLLs from ${fromDir} to ${toDir}`);
  }

  private async findFileRecursive(dir: string, filename: string): Promise<string | null> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) return fullPath;
      if (entry.isDirectory()) {
        const found = await this.findFileRecursive(fullPath, filename);
        if (found) return found;
      }
    }
    return null;
  }

  private async loadManifest(): Promise<OnDeviceManifest> {
    try {
      const raw = await fs.readFile(this.manifestPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {
        version: 1,
        platform: this.detectedPlatform!,
        assets: [],
      };
    }
  }

  private async saveManifest(): Promise<void> {
    await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }

  private async markInstalled(id: AssetId, filePath: string, sizeBytes: number): Promise<void> {
    if (!this.manifest) return;
    this.manifest.assets = this.manifest.assets.filter((a) => a.id !== id);
    this.manifest.assets.push({
      id,
      version: "b8690",
      installedAt: new Date().toISOString(),
      filePath,
      sizeBytes,
    });
    await this.saveManifest();
  }
}

export const modelManager = new ModelManager();
