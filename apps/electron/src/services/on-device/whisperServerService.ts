/**
 * Whisper CLI Service (CPU-only)
 *
 * Transcribes audio by spawning whisper-cli.exe per chunk on **CPU only**.
 * GPU (CUDA) is reserved exclusively for llama-server (vision/text).
 * Running whisper on CPU avoids VRAM contention and eliminates the
 * Pascal-era CUDA crashes — whisper small on CPU handles 60s chunks fine.
 *
 * Lifecycle:
 *   1. whisperSetupService downloads/builds the binary + model file
 *   2. whisperServerService.start() validates paths, marks ready
 *   3. localAudioService calls transcribe(wavBuffer) per ~60s chunk
 *   4. whisperServerService.stop() is a clean no-op
 */

import { execFile } from "child_process";
import { join, dirname } from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { app } from "electron";
import { createLogger } from "../../lib/logger";
import { whisperSetupService } from "./whisperSetupService";

const logger = createLogger("WhisperCLI");

type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface WhisperServerConfig {
  host: string;
  threads: number;
  language: string;
}

const DEFAULT_CONFIG: WhisperServerConfig = {
  host: "127.0.0.1",
  threads: 4,
  language: "en",
};

class WhisperServerService {
  private status: ServerStatus = "stopped";
  private config: WhisperServerConfig = DEFAULT_CONFIG;
  private cliBin: string | null = null;
  private modelPath: string | null = null;
  private tmpDir: string = "";

  getStatus(): ServerStatus {
    return this.status;
  }

  getPort(): number {
    return 0;
  }

  getBaseUrl(): string {
    return "";
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  async start(overrides?: Partial<WhisperServerConfig>): Promise<void> {
    if (this.status === "running") {
      logger.info("Whisper CLI mode already ready");
      return;
    }

    this.config = { ...DEFAULT_CONFIG, ...overrides };
    this.status = "starting";

    const cliPath = whisperSetupService.getCliPath();
    if (!cliPath) throw new Error("whisper binaries not installed");

    this.modelPath = whisperSetupService.getModelPath();
    if (!this.modelPath) throw new Error("Whisper model not installed");

    this.cliBin = cliPath;
    this.tmpDir = join(app.getPath("temp"), "mitable-whisper");
    await mkdir(this.tmpDir, { recursive: true });

    logger.info("Whisper CLI ready (CPU-only mode)", {
      bin: this.cliBin,
      model: this.modelPath,
      threads: this.config.threads,
    });

    this.status = "running";
  }

  async stop(): Promise<void> {
    this.status = "stopped";
    this.cliBin = null;
    this.modelPath = null;
    logger.info("Whisper CLI mode stopped");
  }

  /**
   * Transcribe a WAV buffer using whisper-cli on CPU.
   * Timeout scales with audio length: base 30s + 2s per second of audio.
   */
  async transcribe(wavBuffer: Buffer): Promise<string> {
    if (!this.isRunning() || !this.cliBin || !this.modelPath) {
      throw new Error("Whisper CLI is not ready");
    }

    const wavFile = join(this.tmpDir, `chunk-${randomUUID()}.wav`);
    const audioSeconds = Math.max(1, (wavBuffer.length - 44) / (16_000 * 2));
    const timeoutMs = Math.max(30_000, Math.round(audioSeconds * 2_000) + 30_000);

    try {
      await writeFile(wavFile, wavBuffer);

      const args = [
        "--model",
        this.modelPath!,
        "--file",
        wavFile,
        "--threads",
        String(this.config.threads),
        "--language",
        this.config.language,
        "--no-timestamps",
        "--no-prints",
        "--no-gpu",
      ];

      const text = await new Promise<string>((resolve, reject) => {
        const binDir = dirname(this.cliBin!);
        execFile(
          this.cliBin!,
          args,
          {
            cwd: binDir,
            env: { ...process.env },
            timeout: timeoutMs,
            maxBuffer: 4 * 1024 * 1024,
            windowsHide: true,
          },
          (err, stdout, stderr) => {
            if (err) {
              logger.error("whisper-cli failed:", String(err));
              logger.debug("whisper-cli stderr:", stderr?.slice(0, 500));
              reject(new Error(`whisper-cli error: ${err.message}`));
              return;
            }
            resolve(stdout.trim());
          }
        );
      });

      return text;
    } finally {
      unlink(wavFile).catch(() => {});
    }
  }
}

export const whisperServerService = new WhisperServerService();
