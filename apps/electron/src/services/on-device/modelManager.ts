/**
 * Model Manager Service
 *
 * Manages on-device whisper-cli installation:
 *   - Windows: downloads pre-built binary from GitHub releases
 *   - macOS: downloads source and builds with cmake (Metal GPU acceleration)
 *   - Both: downloads ggml-medium.en model from HuggingFace
 *
 * All assets live in {userData}/on-device/
 */

import { app } from "electron";
import { createWriteStream, promises as fs } from "fs";
import { dirname, join } from "path";
import { pipeline } from "stream/promises";
import { createLogger } from "../../lib/logger";

const logger = createLogger("ModelManager");

const WHISPER_VERSION = "v1.8.4";

const WHISPER_WIN_BIN_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;

const WHISPER_SOURCE_URL = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_VERSION}.tar.gz`;

const WHISPER_MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin";

interface OnDeviceManifest {
  version: 2;
  enabled?: boolean;
  whisperInstalled?: boolean;
}

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
    if (process.platform === "win32") {
      return join(this.whisperBinDir, "Release", "whisper-cli.exe");
    }
    return join(this.whisperBinDir, "bin", "whisper-cli");
  }

  getWhisperModelPath(): string | null {
    if (!this.manifest?.whisperInstalled) return null;
    return join(this.modelsDir, "ggml-medium.en.bin");
  }

  // ── Whisper install ─────────────────────────────────────────────────────

  async ensureWhisperInstalled(): Promise<void> {
    if (this.manifest?.whisperInstalled) {
      logger.info("Whisper already installed");
      return;
    }

    try {
      if (process.platform === "win32") {
        await this.installWhisperWindows();
      } else if (process.platform === "darwin") {
        await this.installWhisperMacOS();
      } else {
        logger.warn("Unsupported platform for whisper:", process.platform);
        return;
      }

      await this.downloadFile(WHISPER_MODEL_URL, join(this.modelsDir, "ggml-medium.en.bin"));

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

  // ── Windows: download pre-built binary ──────────────────────────────────

  private async installWhisperWindows(): Promise<void> {
    logger.info("Downloading pre-built whisper-cli for Windows...");
    await this.downloadAndExtract(WHISPER_WIN_BIN_URL, this.whisperBinDir);
  }

  // ── macOS: build from source with Metal ─────────────────────────────────

  private async installWhisperMacOS(): Promise<void> {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    // Check cmake is available
    try {
      await execAsync("cmake --version");
    } catch {
      throw new Error(
        "cmake is required to build Whisper on macOS. Install it with: brew install cmake"
      );
    }

    const buildDir = join(this.baseDir, "_whisper_build");

    try {
      await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(buildDir, { recursive: true });

      logger.info("Downloading whisper.cpp source...");
      await this.downloadAndExtract(WHISPER_SOURCE_URL, buildDir);

      // Source extracts to whisper.cpp-<version> (without the 'v' prefix)
      const versionNum = WHISPER_VERSION.replace(/^v/, "");
      const sourceDir = join(buildDir, `whisper.cpp-${versionNum}`);

      logger.info("Configuring whisper.cpp with Metal support...");
      await execAsync(`cmake -B build -DGGML_METAL=ON`, { cwd: sourceDir, timeout: 120_000 });

      logger.info("Building whisper-cli (this may take a few minutes)...");
      await execAsync(`cmake --build build -j --config Release`, {
        cwd: sourceDir,
        timeout: 600_000,
      });

      // Copy built binary to managed location
      const builtBin = join(sourceDir, "build", "bin", "whisper-cli");
      const destBinDir = join(this.whisperBinDir, "bin");
      await fs.mkdir(destBinDir, { recursive: true });
      await fs.copyFile(builtBin, join(destBinDir, "whisper-cli"));
      await fs.chmod(join(destBinDir, "whisper-cli"), 0o755);

      logger.info("whisper-cli built and installed with Metal GPU support");
    } finally {
      // Clean up build directory
      await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
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
