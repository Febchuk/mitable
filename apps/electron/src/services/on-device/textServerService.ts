/**
 * Text Server Service
 *
 * Manages a second llama-server subprocess dedicated to text-only inference
 * (Phi-3.5-mini). Runs alongside the vision server (SmolVLM2) for parallel
 * classification + storytelling, or replaces it at session end in sequential
 * mode when VRAM is insufficient for both.
 *
 * Same llama-server binary, different model and flags:
 *   - No --mmproj (not multimodal)
 *   - No --chat-template / --no-jinja (Phi-3.5 uses ChatML natively)
 *   - Shorter startup timeout (60s vs 120s — smaller model)
 */

import { ChildProcess, spawn } from "child_process";
import { dirname } from "path";
import { createServer } from "net";
import { createLogger } from "../../lib/logger";
import { modelManager } from "./modelManager";
import { augmentPathWithCudaBins } from "./windowsCudaEnv";

const logger = createLogger("TextServer");

type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface TextServerConfig {
  gpuLayers: number;
  contextSize: number;
  parallelSlots: number;
  host: string;
  flashAttn?: "off" | "auto" | "on";
}

const DEFAULT_CONFIG: TextServerConfig = {
  gpuLayers: -1,
  contextSize: 4096,
  parallelSlots: 1,
  host: "127.0.0.1",
};

class TextServerService {
  private process: ChildProcess | null = null;
  private port: number = 0;
  private status: ServerStatus = "stopped";
  private config: TextServerConfig = DEFAULT_CONFIG;
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

  getCompletionUrl(): string {
    return `${this.getBaseUrl()}/v1/chat/completions`;
  }

  isRunning(): boolean {
    return this.status === "running";
  }

  async start(overrides?: Partial<TextServerConfig>): Promise<void> {
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
    const modelPath = modelManager.getTextModelPath();

    if (!serverBin) throw new Error("llama-server binary not installed");
    if (!modelPath) throw new Error("Text model (Phi-3.5) not installed");

    this.port = await this.findFreePort();
    this.status = "starting";

    const flashAttn = this.config.flashAttn!;
    const vramFitOn = tuning.llamaVramFit;

    const args = [
      "--model", modelPath,
      "--port", String(this.port),
      "--host", this.config.host,
      "--ctx-size", String(this.config.contextSize),
      "--n-gpu-layers", String(this.config.gpuLayers),
      "--parallel", String(this.config.parallelSlots),
      "--flash-attn", flashAttn,
    ];
    if (!vramFitOn) {
      args.push("--fit", "off");
    }

    logger.info("Starting text server (Phi-3.5)", {
      bin: serverBin,
      model: modelPath,
      port: this.port,
      flashAttn,
      gpuLayers: this.config.gpuLayers,
      ctxSize: this.config.contextSize,
      vramFit: vramFitOn ? "on" : "off",
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
        if (line) logger.debug("[text-server stdout]", line);
        if (line.includes("server is listening on")) {
          this.onReady();
        }
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        if (line) logger.debug("[text-server stderr]", line);
        if (line.includes("server is listening on")) {
          this.onReady();
        }
      });

      this.process.on("error", (err) => {
        logger.error("Failed to spawn text server:", String(err));
        this.status = "error";
        this.startupReject?.(err);
        this.startupReject = null;
        this.startupResolve = null;
      });

      this.process.on("exit", (code) => {
        logger.info("text-server exited with code", String(code));
        this.status = "stopped";
        this.stopHealthCheck();
        if (this.startupReject) {
          this.startupReject(new Error(`text-server exited during startup (code ${code})`));
          this.startupReject = null;
          this.startupResolve = null;
        }
      });

      setTimeout(() => {
        if (this.status === "starting") {
          logger.error("Text server startup timed out after 60s");
          this.stop();
          this.startupReject?.(new Error("text-server startup timed out"));
          this.startupReject = null;
          this.startupResolve = null;
        }
      }, 60_000);
    });
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (!this.process) return;

    logger.info("Stopping text server (pid:", String(this.process.pid) + ")");

    return new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        logger.warn("Force-killing text server");
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

  async chatCompletion(
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>,
    options?: { temperature?: number; max_tokens?: number; grammar?: string }
  ): Promise<string> {
    if (!this.isRunning()) throw new Error("text-server is not running");

    const body: Record<string, unknown> = {
      model: "local",
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.max_tokens ?? 1024,
      stream: false,
    };

    if (options?.grammar) {
      body.grammar = options.grammar;
    }

    const response = await fetch(this.getCompletionUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`text-server error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content ?? "";
  }

  private onReady(): void {
    if (this.status !== "starting") return;
    this.status = "running";
    logger.info("text-server ready on port", String(this.port));
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
          logger.warn("Text server health check failed:", String(res.status));
        }
      } catch {
        if (this.status === "running") {
          logger.warn("Text server health check unreachable — may have crashed");
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

export const textServerService = new TextServerService();
