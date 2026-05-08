/**
 * Whisper Setup Service
 *
 * Ensures whisper-cli binary and ggml-medium.en model are available.
 *
 * Production: binary is bundled in extraResources via scripts/download-whisper.js,
 *             so only the ~1.5 GB model needs downloading on first run.
 * Dev:        binary is downloaded from GitHub, model from HuggingFace.
 *
 * Called at app startup — whisper is critical for session transcription.
 */

import { app } from "electron";
import { createWriteStream, existsSync, promises as fs } from "fs";
import { dirname, join } from "path";
import { pipeline } from "stream/promises";
import { createLogger } from "../../lib/logger";

const logger = createLogger("WhisperSetup");

const WHISPER_VERSION = "v1.8.4";

const WHISPER_WIN_BIN_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;

const WHISPER_SOURCE_URL = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_VERSION}.tar.gz`;

const WHISPER_MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin";

const MODEL_FILE = "ggml-medium.en.bin";
const MODEL_SIZE_BYTES = 1_533_774_781; // ~1.5 GB
const MODEL_SIZE_TOLERANCE = 1_000_000; // Allow 1MB variance for download headers

export type WhisperSetupProgress = {
  stage: "checking" | "copying_binary" | "downloading_model" | "ready";
  percent: number;
  label: string;
};

class WhisperSetupService {
  private baseDir = "";
  private binDir = "";
  private modelsDir = "";
  private _ready = false;
  private _downloading = false;
  private _downloadPercent = 0;

  get ready(): boolean {
    return this._ready;
  }

  get downloading(): boolean {
    return this._downloading;
  }

  get downloadPercent(): number {
    return this._downloadPercent;
  }

  initialize(): void {
    this.baseDir = join(app.getPath("userData"), "on-device");
    this.binDir = join(this.baseDir, "bin", "whisper");
    this.modelsDir = join(this.baseDir, "models");
  }

  getCliPath(): string | null {
    if (!this._ready) return null;
    if (process.platform === "win32") {
      return join(this.binDir, "Release", "whisper-cli.exe");
    }
    return join(this.binDir, "bin", "whisper-cli");
  }

  getModelPath(): string | null {
    if (!this._ready) return null;
    return join(this.modelsDir, MODEL_FILE);
  }

  /**
   * Validate model file exists and has correct size.
   * Returns true if valid, false if missing/corrupted.
   */
  private async validateModelFile(modelPath: string): Promise<boolean> {
    if (!existsSync(modelPath)) {
      return false;
    }

    try {
      const stats = await fs.stat(modelPath);
      const sizeDiff = Math.abs(stats.size - MODEL_SIZE_BYTES);

      if (sizeDiff > MODEL_SIZE_TOLERANCE) {
        logger.warn(
          `Model file size mismatch: expected ~${MODEL_SIZE_BYTES} bytes, got ${stats.size} bytes (diff: ${sizeDiff})`
        );
        return false;
      }

      return true;
    } catch (err) {
      logger.warn("Failed to stat model file:", String(err));
      return false;
    }
  }

  /**
   * Test that whisper-cli can actually load the model.
   * Runs a quick command that initializes the context without processing audio.
   */
  private async testModelLoads(cliPath: string, modelPath: string): Promise<boolean> {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // Run whisper-cli with --help and model specified - it will load model to validate
      // If model is corrupted, it will fail with "failed to initialize whisper context"
      await execAsync(`"${cliPath}" -m "${modelPath}" --help`, {
        timeout: 30_000,
      });

      logger.info("Model load test passed");
      return true;
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("failed to initialize whisper context")) {
        logger.error("Model load test FAILED - model file is corrupted");
        return false;
      }
      // Other errors (like --help returning non-zero) are OK - model loaded fine
      logger.info("Model load test passed (help command ran)");
      return true;
    }
  }

  /**
   * Delete corrupted model file so it can be re-downloaded.
   */
  private async deleteCorruptedModel(modelPath: string): Promise<void> {
    try {
      await fs.unlink(modelPath);
      logger.info("Deleted corrupted model file for re-download");
    } catch (err) {
      logger.warn("Failed to delete corrupted model:", String(err));
    }
  }

  /**
   * Ensure whisper-cli + model are installed. Safe to call multiple times.
   * Returns true if whisper is ready, false on failure.
   */
  async ensure(onProgress?: (event: WhisperSetupProgress) => void): Promise<boolean> {
    if (this._ready) return true;

    if (!this.baseDir) this.initialize();

    onProgress?.({ stage: "checking", percent: 0, label: "Checking setup..." });

    await fs.mkdir(this.binDir, { recursive: true });
    await fs.mkdir(this.modelsDir, { recursive: true });

    const cliPath =
      process.platform === "win32"
        ? join(this.binDir, "Release", "whisper-cli.exe")
        : join(this.binDir, "bin", "whisper-cli");
    const modelPath = join(this.modelsDir, MODEL_FILE);

    const hasCli = existsSync(cliPath);
    let hasValidModel = await this.validateModelFile(modelPath);

    // If model exists but is invalid (wrong size), delete it for re-download
    if (existsSync(modelPath) && !hasValidModel) {
      logger.warn("Model file exists but is corrupted/incomplete - will re-download");
      await this.deleteCorruptedModel(modelPath);
    }

    if (hasCli && hasValidModel) {
      // Final check: verify model can actually be loaded
      const modelLoads = await this.testModelLoads(cliPath, modelPath);
      if (!modelLoads) {
        logger.warn("Model failed load test - will re-download");
        await this.deleteCorruptedModel(modelPath);
        hasValidModel = false;
      } else {
        this._ready = true;
        onProgress?.({ stage: "ready", percent: 100, label: "Ready" });
        logger.info("Whisper already installed", { cliPath, modelPath });
        return true;
      }
    }

    try {
      if (!hasCli) {
        onProgress?.({
          stage: "copying_binary",
          percent: 5,
          label: "Preparing transcription engine...",
        });
        const copied = await this.tryBundledBinary(cliPath);
        if (!copied) {
          await this.installBinaryFromNetwork();
        }
      }

      if (!hasValidModel) {
        onProgress?.({
          stage: "downloading_model",
          percent: 10,
          label: "Downloading language model...",
        });
        this._downloading = true;
        this._downloadPercent = 0;

        await this.downloadModelWithProgress(modelPath, (pct) => {
          this._downloadPercent = pct;
          const scaledPercent = 10 + Math.round(pct * 0.88);
          onProgress?.({
            stage: "downloading_model",
            percent: scaledPercent,
            label: `Downloading language model... ${pct}%`,
          });
        });

        this._downloading = false;
        this._downloadPercent = 100;

        // Verify download completed successfully
        const downloadValid = await this.validateModelFile(modelPath);
        if (!downloadValid) {
          await this.deleteCorruptedModel(modelPath);
          throw new Error("Model download incomplete - file size mismatch after download");
        }

        // Test model actually loads
        const modelLoads = await this.testModelLoads(cliPath, modelPath);
        if (!modelLoads) {
          await this.deleteCorruptedModel(modelPath);
          throw new Error("Model download corrupted - failed to initialize whisper context");
        }
      }

      this._ready = true;
      onProgress?.({ stage: "ready", percent: 100, label: "Ready" });
      logger.info("Whisper setup complete");
      return true;
    } catch (err) {
      this._downloading = false;
      logger.error("Whisper setup failed:", String(err));
      return false;
    }
  }

  // ── Bundled binary (production builds) ────────────────────────────────

  private async tryBundledBinary(destCliPath: string): Promise<boolean> {
    try {
      const bundledDir = join(process.resourcesPath, "whisper");
      if (!existsSync(bundledDir)) return false;

      if (process.platform === "win32") {
        const bundledExe = join(bundledDir, "Release", "whisper-cli.exe");
        if (!existsSync(bundledExe)) return false;

        const destDir = dirname(destCliPath);
        await fs.mkdir(destDir, { recursive: true });
        await this.copyDirRecursive(bundledDir, this.binDir);
        logger.info("Copied bundled whisper binary (Windows)");
        return true;
      }

      const bundledBin = join(bundledDir, "bin", "whisper-cli");
      if (!existsSync(bundledBin)) return false;

      const destDir = dirname(destCliPath);
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(bundledBin, destCliPath);
      await fs.chmod(destCliPath, 0o755);
      logger.info("Copied bundled whisper binary (macOS)");
      return true;
    } catch (err) {
      logger.warn("Failed to copy bundled binary, will download:", String(err));
      return false;
    }
  }

  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // ── Network fallback (dev mode) ──────────────────────────────────────

  private async installBinaryFromNetwork(): Promise<void> {
    if (process.platform === "win32") {
      logger.info("Downloading pre-built whisper-cli for Windows...");
      await this.downloadAndExtract(WHISPER_WIN_BIN_URL, this.binDir);
      logger.info("Windows binary installed");
    } else if (process.platform === "darwin") {
      await this.buildMacOS();
    } else {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }
  }

  private async buildMacOS(): Promise<void> {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

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

      const versionNum = WHISPER_VERSION.replace(/^v/, "");
      const sourceDir = join(buildDir, `whisper.cpp-${versionNum}`);

      logger.info("Configuring with Metal GPU support...");
      await execAsync("cmake -B build -DGGML_METAL=ON", {
        cwd: sourceDir,
        timeout: 120_000,
      });

      logger.info("Building whisper-cli (may take a few minutes)...");
      await execAsync("cmake --build build -j --config Release", {
        cwd: sourceDir,
        timeout: 600_000,
      });

      const builtBin = join(sourceDir, "build", "bin", "whisper-cli");
      const destBinDir = join(this.binDir, "bin");
      await fs.mkdir(destBinDir, { recursive: true });
      await fs.copyFile(builtBin, join(destBinDir, "whisper-cli"));
      await fs.chmod(join(destBinDir, "whisper-cli"), 0o755);

      logger.info("macOS build complete (Metal GPU enabled)");
    } finally {
      await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ── Model download with progress ─────────────────────────────────────

  private async downloadModelWithProgress(
    destPath: string,
    onPercent: (pct: number) => void
  ): Promise<void> {
    logger.info("Downloading whisper model (ggml-medium.en)...");

    const response = await fetch(WHISPER_MODEL_URL, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength =
      parseInt(response.headers.get("content-length") || "0", 10) || MODEL_SIZE_BYTES;

    await fs.mkdir(dirname(destPath), { recursive: true });
    const fileStream = createWriteStream(destPath);

    let downloaded = 0;
    let lastReportedPct = -1;

    const reader = response.body as unknown as NodeJS.ReadableStream;
    const transform = new (await import("stream")).Transform({
      transform(chunk, _encoding, callback) {
        downloaded += chunk.length;
        const pct = Math.min(99, Math.round((downloaded / contentLength) * 100));
        if (pct !== lastReportedPct) {
          lastReportedPct = pct;
          onPercent(pct);
        }
        callback(null, chunk);
      },
    });

    await pipeline(reader, transform, fileStream);
    onPercent(100);
    logger.info("Model downloaded");
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

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
}

export const whisperSetupService = new WhisperSetupService();
