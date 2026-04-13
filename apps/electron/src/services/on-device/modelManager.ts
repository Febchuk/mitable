/**
 * Model Manager Service
 *
 * Handles downloading, verifying, and managing on-device ML assets:
 * - llama-server binary (platform-specific: CUDA for Windows, Metal for macOS)
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
import { join } from "path";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import { createLogger } from "../../lib/logger";

const logger = createLogger("ModelManager");

// ── Asset registry ──────────────────────────────────────────────────────────

export type Platform = "win32-cuda" | "win32-cpu" | "darwin-metal" | "darwin-cpu" | "linux-cpu";
export type AssetId = "llama-server" | "vision-model" | "vision-mmproj" | "text-model";

export interface AssetDefinition {
  id: AssetId;
  label: string;
  description: string;
  sizeBytes: number;
  urls: Partial<Record<Platform, string>>;
  sha256: Partial<Record<Platform, string>>;
  filename: Partial<Record<Platform, string>>;
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
        "https://github.com/ggml-org/llama.cpp/releases/download/b8390/llama-b8390-bin-win-cuda-cu12.4-x64.zip",
      "win32-cpu":
        "https://github.com/ggml-org/llama.cpp/releases/download/b8390/llama-b8390-bin-win-avx2-x64.zip",
      "darwin-metal":
        "https://github.com/ggml-org/llama.cpp/releases/download/b8390/llama-b8390-bin-macos-arm64.zip",
      "darwin-cpu":
        "https://github.com/ggml-org/llama.cpp/releases/download/b8390/llama-b8390-bin-macos-x64.zip",
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
    sizeBytes: 1_000_000_000,
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
    sizeBytes: 400_000_000,
    urls: {
      "win32-cuda":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-BF16.gguf",
      "win32-cpu":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-BF16.gguf",
      "darwin-metal":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-BF16.gguf",
      "darwin-cpu":
        "https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-BF16.gguf",
    },
    sha256: {},
    filename: {
      "win32-cuda": "smolvlm2-2.2b-gui.mmproj-BF16.gguf",
      "win32-cpu": "smolvlm2-2.2b-gui.mmproj-BF16.gguf",
      "darwin-metal": "smolvlm2-2.2b-gui.mmproj-BF16.gguf",
      "darwin-cpu": "smolvlm2-2.2b-gui.mmproj-BF16.gguf",
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
}

// ── GPU detection ───────────────────────────────────────────────────────────

interface GpuInfo {
  hasNvidiaGpu: boolean;
  hasMetal: boolean;
  platform: Platform;
  description: string;
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

  async initialize(): Promise<void> {
    this.baseDir = join(app.getPath("userData"), "on-device");
    this.binDir = join(this.baseDir, "bin");
    this.modelsDir = join(this.baseDir, "models");
    this.manifestPath = join(this.baseDir, "manifest.json");

    await fs.mkdir(this.binDir, { recursive: true });
    await fs.mkdir(this.modelsDir, { recursive: true });

    this.detectedPlatform = await this.detectPlatform();
    this.manifest = await this.loadManifest();

    logger.info("Initialized", {
      baseDir: this.baseDir,
      platform: this.detectedPlatform,
      installedAssets: this.manifest?.assets.length ?? 0,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async detectPlatform(): Promise<Platform> {
    if (this.detectedPlatform) return this.detectedPlatform;

    const gpuInfo = await this.detectGpu();
    this.detectedPlatform = gpuInfo.platform;
    logger.info("Detected platform:", gpuInfo.description);
    return gpuInfo.platform;
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

  /**
   * Get a summary of what needs to be downloaded and total size.
   */
  getDownloadSummary(): { assets: AssetDefinition[]; totalBytes: number } {
    const platform = this.detectedPlatform;
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
    const platform = this.detectedPlatform;
    if (!platform) throw new Error("Platform not detected — call initialize() first");

    const def = ASSET_REGISTRY.find((a) => a.id === id);
    if (!def) throw new Error(`Unknown asset: ${id}`);

    const url = def.urls[platform];
    if (!url) throw new Error(`No download URL for ${id} on ${platform}`);

    const filename = def.filename[platform];
    if (!filename) throw new Error(`No filename for ${id} on ${platform}`);

    const isZip = url.endsWith(".zip");
    const destDir = id === "llama-server" ? this.binDir : this.modelsDir;
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

      if (isZip) {
        await this.downloadAndExtractZip(url, destDir, filename, progress, onProgress);
      } else {
        await this.downloadFile(url, destPath, progress, onProgress);
      }

      if (process.platform !== "win32" && id === "llama-server") {
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
   * Download all missing required assets.
   */
  async downloadAll(onProgress?: ProgressCallback): Promise<void> {
    const { assets } = this.getDownloadSummary();
    for (const asset of assets) {
      await this.downloadAsset(asset.id, onProgress);
    }
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
      const hasNvidia = await this.checkNvidiaCuda();
      return {
        hasNvidiaGpu: hasNvidia,
        hasMetal: false,
        platform: hasNvidia ? "win32-cuda" : "win32-cpu",
        description: hasNvidia ? "Windows with NVIDIA GPU (CUDA)" : "Windows CPU only",
      };
    }

    return {
      hasNvidiaGpu: false,
      hasMetal: false,
      platform: "linux-cpu",
      description: "Linux (CPU)",
    };
  }

  private async checkNvidiaCuda(): Promise<boolean> {
    try {
      const { execFile } = await import("child_process");
      return new Promise((resolve) => {
        execFile("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], (err, stdout) => {
          if (err) {
            logger.info("nvidia-smi not found — falling back to CPU");
            resolve(false);
            return;
          }
          const gpuName = stdout.trim();
          logger.info("Detected NVIDIA GPU:", gpuName);
          resolve(gpuName.length > 0);
        });
      });
    } catch {
      return false;
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

  private async downloadAndExtractZip(
    url: string,
    destDir: string,
    targetFilename: string,
    progress: DownloadProgress,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const tmpZip = join(this.baseDir, `_tmp_${Date.now()}.zip`);

    try {
      await this.downloadFile(url, tmpZip, progress, onProgress);

      progress.phase = "extracting";
      onProgress?.(progress);

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      if (process.platform === "win32") {
        await execAsync(
          `powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${destDir}' -Force"`
        );
      } else {
        await execAsync(`unzip -o "${tmpZip}" -d "${destDir}"`);
      }

      const expectedPath = join(destDir, targetFilename);
      try {
        await fs.access(expectedPath);
      } catch {
        const extracted = await this.findFileRecursive(destDir, targetFilename);
        if (extracted) {
          await fs.rename(extracted, expectedPath);
        } else {
          throw new Error(`Could not find ${targetFilename} after extraction`);
        }
      }
    } finally {
      try {
        await fs.unlink(tmpZip);
      } catch {
        // ignore cleanup failures
      }
    }
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
      version: "b8390",
      installedAt: new Date().toISOString(),
      filePath,
      sizeBytes,
    });
    await this.saveManifest();
  }
}

export const modelManager = new ModelManager();
