/**
 * Ollama Service
 *
 * Manages the Ollama subprocess and provides an OpenAI-compatible chat
 * completion API backed by a local Gemma 4 model. Replaces the old
 * llamaServerService + textServerService with a single unified service.
 *
 * Responsibilities:
 *   1. Ensure Ollama is installed (download if needed)
 *   2. Spawn `ollama serve` and wait for readiness
 *   3. Pull the appropriate Gemma 4 model
 *   4. Expose chatCompletion() for vision, text, and audio inference
 *   5. Serialize multimodal requests via mutex (VRAM safety)
 *   6. Idle-unload model after inactivity, kill on shutdown
 */

import { ChildProcess, spawn, execFile } from "child_process";
import { app } from "electron";
import { join } from "path";
import { promises as fs } from "fs";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { createLogger } from "../../lib/logger";

const logger = createLogger("OllamaService");

const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11434;
const OLLAMA_BASE = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;
const HEALTH_POLL_MS = 30_000;
const STARTUP_TIMEOUT_MS = 60_000;
const IDLE_UNLOAD_MS = 5 * 60_000;

const OLLAMA_DOWNLOAD_URLS: Record<string, string> = {
  win32: "https://ollama.com/download/OllamaSetup.exe",
  darwin: "https://ollama.com/download/Ollama-darwin.zip",
};

type OllamaStatus =
  | "stopped"
  | "installing"
  | "starting"
  | "pulling"
  | "warming"
  | "ready"
  | "error";

export type OllamaProgressCallback = (info: {
  phase: "installing" | "pulling" | "warming";
  message: string;
  percent?: number;
}) => void;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

class OllamaService {
  private process: ChildProcess | null = null;
  private status: OllamaStatus = "stopped";
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedModel: string | null = null;
  private requestMutex: Promise<void> = Promise.resolve();
  private progressCallback: OllamaProgressCallback | null = null;
  private ollamaBin: string = "ollama";
  private numCtx: number = 4096;

  setNumCtx(ctx: number): void {
    this.numCtx = ctx;
  }

  getStatus(): OllamaStatus {
    return this.status;
  }

  isReady(): boolean {
    return this.status === "ready";
  }

  getLoadedModel(): string | null {
    return this.loadedModel;
  }

  setProgressCallback(cb: OllamaProgressCallback | null): void {
    this.progressCallback = cb;
  }

  // ── Installation ──────────────────────────────────────────────────────

  async ensureInstalled(): Promise<void> {
    const bin = await this.findOllamaBinary();
    if (bin) {
      this.ollamaBin = bin;
      logger.info("Ollama found at", bin);
      return;
    }
    await this.downloadAndInstall();
  }

  /**
   * Find the ollama binary. Checks known install locations first (faster
   * and more reliable than `where`/`which` which depend on PATH propagation
   * that Electron child processes may not inherit).
   */
  private async findOllamaBinary(): Promise<string | null> {
    const candidates: string[] = [];

    if (process.platform === "win32") {
      const localAppData =
        process.env.LOCALAPPDATA || join(process.env.USERPROFILE || "", "AppData", "Local");
      candidates.push(
        join(localAppData, "Programs", "Ollama", "ollama.exe"),
        join(localAppData, "Ollama", "ollama.exe"),
        join("C:\\", "Program Files", "Ollama", "ollama.exe")
      );
    } else if (process.platform === "darwin") {
      candidates.push(
        "/usr/local/bin/ollama",
        join(process.env.HOME || "", ".ollama", "ollama"),
        "/opt/homebrew/bin/ollama"
      );
    } else {
      candidates.push("/usr/local/bin/ollama", "/usr/bin/ollama");
    }

    for (const path of candidates) {
      try {
        await fs.access(path);
        return path;
      } catch {
        /* not found, try next */
      }
    }

    // Fall back to PATH lookup
    const cmd = process.platform === "win32" ? "where" : "which";
    return new Promise((resolve) => {
      execFile(cmd, ["ollama"], { timeout: 5_000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        resolve(stdout.trim().split(/\r?\n/)[0]);
      });
    });
  }

  private async downloadAndInstall(): Promise<void> {
    this.status = "installing";
    const url = OLLAMA_DOWNLOAD_URLS[process.platform];
    if (!url) throw new Error(`Ollama download not available for ${process.platform}`);

    const downloadDir = join(app.getPath("userData"), "on-device");
    await fs.mkdir(downloadDir, { recursive: true });

    const filename = process.platform === "win32" ? "OllamaSetup.exe" : "Ollama-darwin.zip";
    const filepath = join(downloadDir, filename);

    // Clean up stale installer from a previous attempt
    try {
      await fs.unlink(filepath);
    } catch {
      /* fine if missing */
    }

    this.progressCallback?.({ phase: "installing", message: "Downloading Ollama..." });
    logger.info("Downloading Ollama from", url);

    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download Ollama: ${response.status}`);
    }

    const fileStream = createWriteStream(filepath);
    // @ts-expect-error Node fetch body is a ReadableStream
    await pipeline(response.body, fileStream);

    this.progressCallback?.({ phase: "installing", message: "Installing Ollama silently..." });

    if (process.platform === "win32") {
      await this.runSilentInstaller(filepath);
    } else if (process.platform === "darwin") {
      await this.extractMacInstaller(filepath, downloadDir);
    }

    // Clean up installer after use
    try {
      await fs.unlink(filepath);
    } catch {
      /* ignore */
    }

    const bin = await this.findOllamaBinary();
    if (!bin) {
      throw new Error("Ollama installation completed but binary not found");
    }
    this.ollamaBin = bin;
    logger.info("Ollama installed successfully at", bin);
  }

  private runSilentInstaller(exePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(exePath, ["/S"], { timeout: 120_000, windowsHide: true }, (err) => {
        if (err) reject(new Error(`Ollama installer failed: ${err.message}`));
        else resolve();
      });
    });
  }

  private async extractMacInstaller(zipPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile("unzip", ["-o", zipPath, "-d", destDir], { timeout: 60_000 }, (err) => {
        if (err) reject(new Error(`Ollama extract failed: ${err.message}`));
        else resolve();
      });
    });
  }

  // ── Serve lifecycle ───────────────────────────────────────────────────

  async startServe(): Promise<void> {
    if (await this.isOllamaServing()) {
      logger.info("Ollama is already serving");
      return;
    }

    this.status = "starting";
    logger.info("Starting ollama serve via", this.ollamaBin);

    this.process = spawn(this.ollamaBin, ["serve"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, OLLAMA_HOST: `${OLLAMA_HOST}:${OLLAMA_PORT}` },
    });

    this.process.stdout?.on("data", (d: Buffer) => {
      logger.debug("[ollama stdout]", d.toString().trim());
    });
    this.process.stderr?.on("data", (d: Buffer) => {
      logger.debug("[ollama stderr]", d.toString().trim());
    });

    this.process.on("error", (err) => {
      logger.error("Failed to spawn ollama:", String(err));
      this.status = "error";
    });

    this.process.on("exit", (code) => {
      logger.info("ollama serve exited with code", String(code));
      this.stopHealthCheck();
      if (this.status !== "stopped") {
        this.status = "error";
      }
    });

    await this.waitForServing();
    this.startHealthCheck();
  }

  private async isOllamaServing(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
        signal: AbortSignal.timeout(2_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForServing(): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.isOllamaServing()) {
        logger.info("Ollama is serving");
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Ollama failed to start within timeout");
  }

  // ── Model pulling ─────────────────────────────────────────────────────

  async pullModel(model: string): Promise<void> {
    this.status = "pulling";
    this.progressCallback?.({ phase: "pulling", message: `Downloading ${model}`, percent: 0 });
    logger.info("Pulling model", model);

    const response = await fetch(`${OLLAMA_BASE}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Failed to pull model: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.total && msg.completed) {
            const percent = Math.round((msg.completed / msg.total) * 100);
            this.progressCallback?.({
              phase: "pulling",
              message: `Downloading ${model}`,
              percent,
            });
          }
          if (msg.status === "success") {
            logger.info("Model pull complete:", model);
          }
        } catch {
          /* partial JSON line, skip */
        }
      }
    }

    this.loadedModel = model;
  }

  async warmup(model: string): Promise<void> {
    this.status = "warming";
    this.progressCallback?.({ phase: "warming", message: `Loading ${model} into VRAM...` });
    logger.info("Warming up model", model);

    await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: "hi",
        stream: false,
        options: { num_ctx: this.numCtx },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    this.status = "ready";
    this.loadedModel = model;
    this.resetIdleTimer();
    logger.info("Model warmed up and ready:", model);
  }

  // ── Chat completion ───────────────────────────────────────────────────

  /**
   * OpenAI-compatible chat completion through Ollama.
   * Requests are serialized via mutex to prevent concurrent VRAM pressure.
   */
  async chatCompletion(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      max_tokens?: number;
      format?: "json";
    }
  ): Promise<string> {
    if (!this.isReady()) throw new Error("Ollama is not ready");

    let release: () => void;
    const lock = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.requestMutex;
    this.requestMutex = lock;
    await prev;

    try {
      this.resetIdleTimer();

      const body: Record<string, unknown> = {
        model: this.loadedModel,
        messages: messages.map((m) => this.serializeMessage(m)),
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.2,
          num_predict: options?.max_tokens ?? 1024,
          num_ctx: this.numCtx,
        },
      };

      if (options?.format === "json") {
        body.format = "json";
      }

      const response = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 500 && errorText.includes("model failed to load")) {
          this.handleModelLoadFailure();
        }
        throw new Error(`Ollama error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      return result.choices?.[0]?.message?.content ?? "";
    } finally {
      release!();
    }
  }

  private rewarmingInProgress = false;

  private handleModelLoadFailure(): void {
    if (this.rewarmingInProgress) return;

    logger.warn("Model failed to load — marking as not-ready and scheduling re-warmup");
    this.status = "error";

    if (this.loadedModel) {
      this.rewarmingInProgress = true;
      const model = this.loadedModel;

      setTimeout(async () => {
        try {
          logger.info(`Re-warming model ${model} after load failure...`);
          await this.warmup(model);
          logger.info("Model re-warmed successfully");
        } catch (err) {
          logger.error("Re-warmup failed:", String(err));
          this.status = "error";
        } finally {
          this.rewarmingInProgress = false;
        }
      }, 5_000);
    }
  }

  private serializeMessage(msg: ChatMessage): Record<string, unknown> {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }

    const images: string[] = [];
    let text = "";

    for (const part of msg.content) {
      if (part.type === "text") {
        text += part.text;
      } else if (part.type === "image_url") {
        const url = part.image_url.url;
        const base64 = url.startsWith("data:") ? url.split(",")[1] : url;
        images.push(base64);
      }
    }

    return { role: msg.role, content: text, images };
  }

  // ── Idle management ───────────────────────────────────────────────────

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.unloadModel(), IDLE_UNLOAD_MS);
  }

  private async unloadModel(): Promise<void> {
    if (!this.loadedModel) return;
    logger.info("Idle timeout — unloading model from VRAM");
    try {
      await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.loadedModel, keep_alive: 0 }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      logger.warn("Failed to unload model:", String(err));
    }
  }

  // ── Health check ──────────────────────────────────────────────────────

  private startHealthCheck(): void {
    this.healthTimer = setInterval(async () => {
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
          signal: AbortSignal.timeout(3_000),
        });
        if (!res.ok && this.status === "ready") {
          logger.warn("Ollama health check failed:", String(res.status));
        }
      } catch {
        if (this.status === "ready") {
          logger.warn("Ollama health check unreachable");
          this.status = "error";
        }
      }
    }, HEALTH_POLL_MS);
  }

  private stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  // ── Shutdown ──────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.stopHealthCheck();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.status = "stopped";
    this.loadedModel = null;

    if (!this.process) return;

    logger.info("Shutting down ollama serve (pid:", String(this.process.pid) + ")");

    return new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        logger.warn("Force-killing ollama");
        this.process?.kill("SIGKILL");
        this.process = null;
        resolve();
      }, 5_000);

      this.process!.on("exit", () => {
        clearTimeout(killTimeout);
        this.process = null;
        resolve();
      });

      if (process.platform === "win32") {
        this.process!.kill();
      } else {
        this.process!.kill("SIGTERM");
      }
    });
  }
}

export const ollamaService = new OllamaService();
