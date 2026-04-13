/**
 * Llama Server Service
 *
 * Manages a local llama-server subprocess that provides an OpenAI-compatible
 * API on localhost for on-device vision and text inference.
 *
 * The server loads multimodal models (SmolVLM2) via libmtmd and exposes
 * /v1/chat/completions with image support (base64 content parts).
 *
 * Lifecycle:
 *   1. modelManager downloads the binary + model files
 *   2. llamaServerService.start() spawns the process on a free port
 *   3. Services call getCompletionUrl() and use standard fetch
 *   4. llamaServerService.stop() tears it down on app quit
 */

import { ChildProcess, spawn } from "child_process";
import { dirname } from "path";
import { createServer } from "net";
import { createLogger } from "../../lib/logger";
import { modelManager } from "./modelManager";
import { augmentPathWithCudaBins } from "./windowsCudaEnv";

const logger = createLogger("LlamaServer");

// ── Types ───────────────────────────────────────────────────────────────────

export interface LlamaServerConfig {
  /** Number of GPU layers to offload (-1 = all, 0 = CPU only) */
  gpuLayers: number;
  /** Context window size in tokens */
  contextSize: number;
  /** Number of parallel request slots */
  parallelSlots: number;
  /** Host to bind to */
  host: string;
  /**
   * llama-server `--flash-attn`. If omitted, chosen from GPU compute capability (Pascal off, Ampere+ on).
   */
  flashAttn?: "off" | "auto" | "on";
}

type ServerStatus = "stopped" | "starting" | "running" | "error";

const DEFAULT_CONFIG: LlamaServerConfig = {
  gpuLayers: -1,
  contextSize: 4096,
  parallelSlots: 1,
  host: "127.0.0.1",
};

// ── Service ─────────────────────────────────────────────────────────────────

class LlamaServerService {
  private process: ChildProcess | null = null;
  private port: number = 0;
  private status: ServerStatus = "stopped";
  private config: LlamaServerConfig = DEFAULT_CONFIG;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private startupResolve: (() => void) | null = null;
  private startupReject: ((err: Error) => void) | null = null;

  // ── Public API ──────────────────────────────────────────────────────────

  getStatus(): ServerStatus {
    return this.status;
  }

  getPort(): number {
    return this.port;
  }

  getBaseUrl(): string {
    return `http://${this.config.host}:${this.port}`;
  }

  getCompletionUrl(): string {
    return `${this.getBaseUrl()}/v1/chat/completions`;
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  /**
   * Start the llama-server with the vision model loaded.
   * Resolves once the /health endpoint reports ready.
   */
  async start(overrides?: Partial<LlamaServerConfig>): Promise<void> {
    if (this.status === "running") {
      logger.info("Already running on port", String(this.port));
      return;
    }

    const tuning = modelManager.getNvidiaInferenceTuning();
    const o = overrides ?? {};
    this.config = { ...DEFAULT_CONFIG, ...o };
    if (o.gpuLayers === undefined) {
      this.config.gpuLayers = tuning.llamaGpuLayers;
    }
    if (o.flashAttn === undefined) {
      this.config.flashAttn = tuning.llamaFlashAttn;
    }
    if (o.contextSize === undefined && tuning.llamaContextSize != null) {
      this.config.contextSize = tuning.llamaContextSize;
    }

    const serverBin = modelManager.getLlamaServerPath();
    const modelPath = modelManager.getVisionModelPath();
    const mmprojPath = modelManager.getVisionMmprojPath();

    if (!serverBin) throw new Error("llama-server binary not installed");
    if (!modelPath) throw new Error("Vision model not installed");
    if (!mmprojPath) throw new Error("Vision mmproj not installed");

    this.port = await this.findFreePort();
    this.status = "starting";

    const flashAttn = this.config.flashAttn!;
    const vramFitOn = tuning.llamaVramFit;

    const args = [
      "--model", modelPath,
      "--mmproj", mmprojPath,
      "--port", String(this.port),
      "--host", this.config.host,
      "--ctx-size", String(this.config.contextSize),
      "--n-gpu-layers", String(this.config.gpuLayers),
      "--parallel", String(this.config.parallelSlots),
      "--flash-attn", flashAttn,
      "--no-jinja",
      "--chat-template", "smolvlm",
    ];
    if (!vramFitOn) {
      args.push("--fit", "off");
    }

    logger.info("Starting llama-server", {
      bin: serverBin,
      port: this.port,
      flashAttn,
      gpuLayers: this.config.gpuLayers,
      ctxSize: this.config.contextSize,
      vramFit: vramFitOn ? "on" : "off",
      args,
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
        if (line) logger.debug("[llama-server stdout]", line);
        if (line.includes("server is listening on")) {
          this.onReady();
        }
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        if (line) logger.debug("[llama-server stderr]", line);
        if (line.includes("server is listening on")) {
          this.onReady();
        }
      });

      this.process.on("error", (err) => {
        logger.error("Failed to spawn llama-server:", String(err));
        this.status = "error";
        this.startupReject?.(err);
        this.startupReject = null;
        this.startupResolve = null;
      });

      this.process.on("exit", (code) => {
        logger.info("llama-server exited with code", String(code));
        this.status = "stopped";
        this.stopHealthCheck();
        if (this.startupReject) {
          this.startupReject(new Error(`llama-server exited during startup (code ${code})`));
          this.startupReject = null;
          this.startupResolve = null;
        }
      });

      // Timeout if server doesn't become ready in 120s (model loading can be slow)
      setTimeout(() => {
        if (this.status === "starting") {
          logger.error("Startup timed out after 120s");
          this.stop();
          this.startupReject?.(new Error("llama-server startup timed out"));
          this.startupReject = null;
          this.startupResolve = null;
        }
      }, 120_000);
    });
  }

  /**
   * Gracefully stop the server.
   */
  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (!this.process) return;

    logger.info("Stopping llama-server (pid:", String(this.process.pid) + ")");

    return new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        logger.warn("Force-killing llama-server");
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
   * Send an OpenAI-compatible chat completion request with optional image.
   */
  async chatCompletion(
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>,
    options?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    if (!this.isRunning()) throw new Error("llama-server is not running");

    const response = await fetch(this.getCompletionUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local",
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.max_tokens ?? 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama-server error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content ?? "";
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private onReady(): void {
    if (this.status !== "starting") return;
    this.status = "running";
    logger.info("llama-server ready on port", String(this.port));
    this.startHealthCheck();
    this.startupResolve?.();
    this.startupResolve = null;
    this.startupReject = null;
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const res = await fetch(`${this.getBaseUrl()}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok && this.status === "running") {
          logger.warn("Health check failed:", String(res.status));
        }
      } catch {
        if (this.status === "running") {
          logger.warn("Health check unreachable — server may have crashed");
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

export const llamaServerService = new LlamaServerService();
