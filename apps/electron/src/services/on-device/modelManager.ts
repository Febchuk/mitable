/**
 * Model Manager Service (Ollama era)
 *
 * Stripped-down version that manages:
 *   1. The on-device enabled/disabled flag (persisted in manifest.json)
 *   2. Optional whisper-cli download for the "capable" tier (12B has no audio)
 *   3. Base directory setup ({userData}/on-device/)
 *
 * Ollama handles model downloads and GPU management itself.
 * The old llama-server binary downloads, GGUF models, CUDA env patching,
 * and GPU tuning heuristics have been removed.
 */

import { app } from "electron";
import { createWriteStream, promises as fs } from "fs";
import { dirname, join } from "path";
import { pipeline } from "stream/promises";
import { createLogger } from "../../lib/logger";

const logger = createLogger("ModelManager");

// ── Whisper asset (needed for constrained/capable tiers) ────────────────────

const WHISPER_BIN_URL: Record<string, string> = {
  win32:
    "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip",
  darwin: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip",
};

const WHISPER_MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";

// ── Manifest ────────────────────────────────────────────────────────────────

interface OnDeviceManifest {
  version: 2;
  enabled?: boolean;
  whisperInstalled?: boolean;
}

// ── Service ─────────────────────────────────────────────────────────────────

class ModelManager {
  private baseDir: string = "";
  private whisperBinDir: string = "";
  private modelsDir: string = "";
  private manifestPath: string = "";
  private manifest: OnDeviceManifest | null = null;

  async initialize(): Promise<void> {
    this.baseDir = join(app.getPath("userData"), "on-device");
    this.whisperBinDir = join(this.baseDir, "bin", "whisper");
    this.modelsDir = join(this.baseDir, "models");
    this.manifestPath = join(this.baseDir, "manifest.json");

    await fs.mkdir(this.whisperBinDir, { recursive: true });
    await fs.mkdir(this.modelsDir, { recursive: true });

    this.manifest = await this.loadManifest();

    logger.info("Initialized", { baseDir: this.baseDir });
  }

  // ── Public API ──────────────────────────────────────────────────────────

  isEnabled(): boolean {
    return this.manifest?.enabled ?? false;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.manifest) return;
    this.manifest.enabled = enabled;
    await this.saveManifest();
    logger.info(`On-device AI ${enabled ? "enabled" : "disabled"}`);
  }

  isFullySetUp(): boolean {
    return this.isEnabled();
  }

  isWhisperInstalled(): boolean {
    return this.manifest?.whisperInstalled ?? false;
  }

  getWhisperServerPath(): string | null {
    if (!this.manifest?.whisperInstalled) return null;
    const filename = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
    return join(this.whisperBinDir, "Release", filename);
  }

  getWhisperModelPath(): string | null {
    if (!this.manifest?.whisperInstalled) return null;
    return join(this.modelsDir, "ggml-whisper-small.bin");
  }

  // ── Whisper download (capable tier only) ────────────────────────────────

  async ensureWhisperInstalled(): Promise<void> {
    if (this.manifest?.whisperInstalled) {
      logger.info("Whisper already installed");
      return;
    }

    logger.info("Downloading whisper-cli and model for capable tier...");

    const binUrl = WHISPER_BIN_URL[process.platform];
    if (!binUrl) {
      logger.warn("No whisper binary URL for platform:", process.platform);
      return;
    }

    try {
      await this.downloadAndExtract(binUrl, this.whisperBinDir);
      await this.downloadFile(WHISPER_MODEL_URL, join(this.modelsDir, "ggml-whisper-small.bin"));

      if (this.manifest) {
        this.manifest.whisperInstalled = true;
        await this.saveManifest();
      }

      logger.info("Whisper installed successfully");
    } catch (err) {
      logger.error("Failed to install whisper:", String(err));
    }
  }

  async removeAll(): Promise<void> {
    try {
      await fs.rm(this.baseDir, { recursive: true, force: true });
      await fs.mkdir(this.whisperBinDir, { recursive: true });
      await fs.mkdir(this.modelsDir, { recursive: true });
      this.manifest = { version: 2, enabled: false };
      await this.saveManifest();
      logger.info("Removed all on-device assets");
    } catch (err) {
      logger.error("Failed to remove assets:", String(err));
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    await fs.mkdir(dirname(destPath), { recursive: true });
    const fileStream = createWriteStream(destPath);
    // @ts-expect-error Node fetch body is a ReadableStream
    await pipeline(response.body, fileStream);
  }

  private async downloadAndExtract(url: string, destDir: string): Promise<void> {
    const isTarGz = url.endsWith(".tar.gz");
    const ext = isTarGz ? ".tar.gz" : ".zip";
    const tmpFile = join(this.baseDir, `_tmp_${Date.now()}${ext}`);

    try {
      await this.downloadFile(url, tmpFile);

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      if (isTarGz) {
        await execAsync(`tar -xzf "${tmpFile}" -C "${destDir}"`);
      } else {
        await execAsync(`tar -xf "${tmpFile}" -C "${destDir}"`);
      }
    } finally {
      try {
        await fs.unlink(tmpFile);
      } catch {
        /* ignore */
      }
    }
  }

  private async loadManifest(): Promise<OnDeviceManifest> {
    try {
      const raw = await fs.readFile(this.manifestPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.version === 1) {
        return { version: 2, enabled: parsed.enabled ?? false };
      }
      return parsed;
    } catch {
      return { version: 2 };
    }
  }

  private async saveManifest(): Promise<void> {
    await fs.mkdir(dirname(this.manifestPath), { recursive: true });
    await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2));
  }
}

export const modelManager = new ModelManager();
