/**
 * Whisper Server Service
 *
 * Manages a local whisper-server subprocess (from whisper.cpp) that provides
 * an HTTP endpoint for on-device audio transcription.
 *
 * The server loads a Whisper GGML model and exposes /inference for WAV input.
 *
 * Lifecycle:
 *   1. modelManager downloads the binary + model file
 *   2. whisperServerService.start() spawns the process on a free port
 *   3. localAudioService sends WAV buffers via POST /inference
 *   4. whisperServerService.stop() tears it down on toggle-off or app quit
 */

import { ChildProcess, spawn } from "child_process";
import { dirname } from "path";
import { createServer } from "net";
import { request as httpRequest } from "http";
import { createLogger } from "../../lib/logger";
import { modelManager } from "./modelManager";
import { augmentPathWithCudaBins } from "./windowsCudaEnv";

const logger = createLogger("WhisperServer");

type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface WhisperServerConfig {
  host: string;
  threads: number;
  language: string;
  /**
   * When false, passes `--no-flash-attn`. If omitted, derived from GPU (Pascal off, RTX on).
   */
  useFlashAttn?: boolean;
}

const DEFAULT_CONFIG: WhisperServerConfig = {
  host: "127.0.0.1",
  threads: 4,
  language: "en",
};

class WhisperServerService {
  private process: ChildProcess | null = null;
  private port: number = 0;
  private status: ServerStatus = "stopped";
  private config: WhisperServerConfig = DEFAULT_CONFIG;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private startupResolve: (() => void) | null = null;
  private startupReject: ((err: Error) => void) | null = null;

  getStatus(): ServerStatus {
    return this.status;
  }

  getPort(): number {
    return this.port;
  }

  getBaseUrl(): string {
    return `http://${this.config.host}:${this.port}`;
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  async start(overrides?: Partial<WhisperServerConfig>): Promise<void> {
    if (this.status === "running") {
      logger.info("Already running on port", String(this.port));
      return;
    }

    this.config = { ...DEFAULT_CONFIG, ...overrides };

    const serverBin = modelManager.getWhisperServerPath();
    const modelPath = modelManager.getWhisperModelPath();

    if (!serverBin) throw new Error("whisper-server binary not installed");
    if (!modelPath) throw new Error("Whisper model not installed");

    this.port = await this.findFreePort();
    this.status = "starting";

    const tuning = modelManager.getNvidiaInferenceTuning();
    const useFlash =
      this.config.useFlashAttn !== undefined
        ? this.config.useFlashAttn
        : tuning.whisperUseFlashAttn;

    // Boolean flags only — never pass the literal "false" as its own argv token.
    const args = [
      "--model", modelPath,
      "--port", String(this.port),
      "--host", this.config.host,
      "--threads", String(this.config.threads),
      "--language", this.config.language,
      "--no-timestamps",
    ];
    if (!useFlash) {
      args.push("--no-flash-attn");
    }

    logger.info("Starting whisper-server", {
      bin: serverBin,
      port: this.port,
      whisperFlashAttn: useFlash,
    });

    const binFolder = dirname(serverBin);

    return new Promise<void>((resolve, reject) => {
      this.startupResolve = resolve;
      this.startupReject = reject;

      this.process = spawn(serverBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        cwd: binFolder,
        env: augmentPathWithCudaBins(process.env, modelManager.getServerBinDirs()),
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        if (line) logger.debug("[whisper-server stdout]", line);
        if (line.includes("whisper server listening")) {
          this.onReady();
        }
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        if (line) logger.debug("[whisper-server stderr]", line);
        if (line.includes("whisper server listening")) {
          this.onReady();
        }
      });

      // whisper-server prints its "listening" message to stdout via printf,
      // which is fully buffered when piped. Poll the HTTP port as a fallback.
      this.pollUntilReady();

      this.process.on("error", (err) => {
        logger.error("Failed to spawn whisper-server:", String(err));
        this.status = "error";
        this.startupReject?.(err);
        this.startupReject = null;
        this.startupResolve = null;
      });

      this.process.on("exit", (code) => {
        logger.info("whisper-server exited with code", String(code));
        this.status = "stopped";
        this.stopHealthCheck();
        if (this.startupReject) {
          const hint =
            code === 3221225781 || code === -1073741515
              ? " (CUDA DLLs missing: remove Whisper Server in settings, download again so DLLs are copied next to the exe, or install the CUDA 12.x runtime.)"
              : "";
          this.startupReject(new Error(`whisper-server exited during startup (code ${code})${hint}`));
          this.startupReject = null;
          this.startupResolve = null;
        }
      });

      setTimeout(() => {
        if (this.status === "starting") {
          logger.error("Startup timed out after 60s");
          this.stop();
          this.startupReject?.(new Error("whisper-server startup timed out"));
          this.startupReject = null;
          this.startupResolve = null;
        }
      }, 60_000);
    });
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (!this.process) return;

    logger.info("Stopping whisper-server (pid:", String(this.process.pid) + ")");

    return new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        logger.warn("Force-killing whisper-server");
        this.process?.kill("SIGKILL");
        resolve();
      }, 5000);

      this.process!.on("exit", () => {
        clearTimeout(killTimeout);
        this.process = null;
        this.status = "stopped";
        resolve();
      });

      if (process.platform === "win32") {
        this.process!.kill();
      } else {
        this.process!.kill("SIGTERM");
      }
    });
  }

  /**
   * Transcribe a WAV buffer. Posts multipart form data to /inference.
   * Returns the transcribed text.
   */
  async transcribe(wavBuffer: Buffer): Promise<string> {
    if (!this.isRunning()) throw new Error("whisper-server is not running");

    const boundary = "----WhisperBoundary" + Date.now();

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    );
    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([preamble, wavBuffer, epilogue]);

    return new Promise<string>((resolve, reject) => {
      const url = new URL(`${this.getBaseUrl()}/inference`);
      const req = httpRequest(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`whisper-server error ${res.statusCode}: ${raw}`));
              return;
            }
            try {
              const result = JSON.parse(raw) as { text?: string };
              resolve((result.text ?? "").trim());
            } catch {
              reject(new Error(`whisper-server returned invalid JSON: ${raw.slice(0, 200)}`));
            }
          });
        },
      );

      req.on("error", (err) => reject(new Error(`whisper-server request failed: ${err.message}`)));
      req.write(body);
      req.end();
    });
  }

  private onReady(): void {
    if (this.status !== "starting") return;
    this.status = "running";
    logger.info("whisper-server ready on port", String(this.port));
    this.startHealthCheck();
    this.startupResolve?.();
    this.startupResolve = null;
    this.startupReject = null;
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const res = await fetch(`${this.getBaseUrl()}/`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok && this.status === "running") {
          logger.warn("Health check failed:", String(res.status));
        }
      } catch {
        if (this.status === "running") {
          logger.warn("Health check unreachable — whisper-server may have crashed");
          this.status = "error";
        }
      }
    }, 30_000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private pollUntilReady(): void {
    const interval = setInterval(async () => {
      if (this.status !== "starting") {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(`${this.getBaseUrl()}/`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok || res.status < 500) {
          clearInterval(interval);
          this.onReady();
        }
      } catch {
        // server not up yet
      }
    }, 1500);
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          const port = addr.port;
          server.close(() => resolve(port));
        } else {
          reject(new Error("Could not determine free port"));
        }
      });
      server.on("error", reject);
    });
  }
}

export const whisperServerService = new WhisperServerService();
