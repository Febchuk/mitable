/**
 * Whisper CLI Service
 *
 * Transcribes audio by spawning whisper-cli.exe per chunk.
 * The precompiled whisper-server.exe (v1.8.x) hangs after model loading
 * on Windows and never binds to the HTTP port, so we use the CLI binary
 * which works reliably. Model loads in ~400ms per invocation — acceptable
 * for 10-second audio segments.
 *
 * Lifecycle:
 *   1. modelManager downloads the binary zip + model file
 *   2. whisperServerService.start() validates paths, marks ready
 *   3. localAudioService calls transcribe(wavBuffer) per chunk
 *   4. whisperServerService.stop() is a clean no-op
 */

import { execFile } from "child_process";
import { join, dirname } from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { app } from "electron";
import { createLogger } from "../../lib/logger";
import { modelManager } from "./modelManager";
import { augmentPathWithCudaBins } from "./windowsCudaEnv";

const logger = createLogger("WhisperCLI");

type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface WhisperServerConfig {
  host: string;
  threads: number;
  language: string;
  useFlashAttn?: boolean;
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

    const serverPath = modelManager.getWhisperServerPath();
    if (!serverPath) throw new Error("whisper binaries not installed");

    const whisperDir = dirname(serverPath);
    const cliPath = join(whisperDir, "Release", "whisper-cli.exe");

    this.modelPath = modelManager.getWhisperModelPath();
    if (!this.modelPath) throw new Error("Whisper model not installed");

    this.cliBin = cliPath;
    this.tmpDir = join(app.getPath("temp"), "mitable-whisper");
    await mkdir(this.tmpDir, { recursive: true });

    logger.info("Whisper CLI mode ready", {
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

  async transcribe(wavBuffer: Buffer): Promise<string> {
    if (!this.isRunning() || !this.cliBin || !this.modelPath) {
      throw new Error("Whisper CLI is not ready");
    }

    const wavFile = join(this.tmpDir, `chunk-${randomUUID()}.wav`);

    try {
      await writeFile(wavFile, wavBuffer);

      const tuning = modelManager.getNvidiaInferenceTuning();
      const useFlash =
        this.config.useFlashAttn !== undefined
          ? this.config.useFlashAttn
          : tuning.whisperUseFlashAttn;

      const args = [
        "--model", this.modelPath!,
        "--file", wavFile,
        "--threads", String(this.config.threads),
        "--language", this.config.language,
        "--no-timestamps",
        "--no-prints",
      ];
      if (!useFlash) {
        args.push("--no-flash-attn");
      }

      const text = await new Promise<string>((resolve, reject) => {
        const binDir = dirname(this.cliBin!);
        execFile(
          this.cliBin!,
          args,
          {
            cwd: binDir,
            env: augmentPathWithCudaBins(process.env, modelManager.getServerBinDirs()),
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
          },
          (err, stdout, stderr) => {
            if (err) {
              logger.error("whisper-cli failed:", String(err));
              logger.debug("whisper-cli stderr:", stderr?.slice(0, 500));
              reject(new Error(`whisper-cli error: ${err.message}`));
              return;
            }
            const output = stdout.trim();
            resolve(output);
          },
        );
      });

      return text;
    } finally {
      unlink(wavFile).catch(() => {});
    }
  }
}

export const whisperServerService = new WhisperServerService();
