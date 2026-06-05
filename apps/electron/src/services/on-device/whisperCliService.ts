/**
 * Whisper CLI Service
 *
 * Speech-to-text using a pre-compiled whisper-cli.exe binary (whisper.cpp).
 * Runs as an external process via child_process.execFile — completely
 * decoupled from Node.js/WASM runtime quirks.
 *
 * Uses the medium.en GGML model for high-quality English transcription.
 * CPU-based (AVX2) so it never competes with Ollama for VRAM.
 *
 * Audio flow:
 *   PCM buffer → temp WAV file → whisper-cli.exe → stdout text → cleanup
 */

import { execFile } from "child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { app } from "electron";
import { randomUUID } from "crypto";
import { createLogger } from "../../lib/logger";

const logger = createLogger("WhisperCLI");

const CLI_NAME = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
const MODEL_NAME = "ggml-medium.en.bin";

class WhisperCliService {
  private cliPath: string = "";
  private modelPath: string = "";
  private tmpDir: string = "";
  private ready = false;
  private gpuFailed = false;

  async initialize(): Promise<boolean> {
    if (this.ready) return true;

    // Try whisperSetupService paths first (downloaded/built at startup)
    try {
      const { whisperSetupService } = await import("./index");
      const managedCli = whisperSetupService.getCliPath();
      const managedModel = whisperSetupService.getModelPath();

      if (managedCli && existsSync(managedCli) && managedModel && existsSync(managedModel)) {
        this.cliPath = managedCli;
        this.modelPath = managedModel;
        this.tmpDir = join(app.getPath("temp"), "mitable-whisper");
        if (!existsSync(this.tmpDir)) mkdirSync(this.tmpDir, { recursive: true });
        logger.info("whisper-cli ready (managed):", this.cliPath);
        logger.info("Model:", this.modelPath);
        this.ready = true;
        return true;
      }
    } catch {
      // whisperSetupService not available yet, fall through to legacy paths
    }

    // Fallback: legacy source-tree paths (dev only)
    const appRoot = app.isPackaged ? join(app.getAppPath(), "..") : join(__dirname, "../../..");
    this.cliPath = join(appRoot, "bin", "whisper-cpp", "Release", CLI_NAME);
    this.modelPath = join(appRoot, "bin", "whisper-cpp", "models", MODEL_NAME);
    this.tmpDir = join(app.getPath("temp"), "mitable-whisper");

    if (!existsSync(this.cliPath)) {
      logger.warn(`${CLI_NAME} not found at:`, this.cliPath);
      return false;
    }

    if (!existsSync(this.modelPath)) {
      logger.warn("Whisper model not found at:", this.modelPath);
      return false;
    }

    if (!existsSync(this.tmpDir)) {
      mkdirSync(this.tmpDir, { recursive: true });
    }

    logger.info("whisper-cli.exe ready:", this.cliPath);
    logger.info("Model:", this.modelPath);
    this.ready = true;
    return true;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Detect whether a PCM buffer contains float32 samples (4 bytes, -1..1)
   * or int16 samples (2 bytes, -32768..32767).
   */
  /**
   * Convert raw PCM (int16 LE, 16kHz mono) to a WAV buffer.
   * All audio sources are int16 at this point — mic via ffmpeg DirectShow,
   * system audio converted in nativeAudioCapture before emitting.
   */
  private pcmToWav(pcm: Buffer): Buffer {
    const int16Pcm = pcm;

    const SAMPLE_RATE = 16_000;
    const CHANNELS = 1;
    const BITS_PER_SAMPLE = 16;
    const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
    const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
    const dataSize = int16Pcm.length;

    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(CHANNELS, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(BITS_PER_SAMPLE, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, int16Pcm]);
  }

  /**
   * Transcribe a PCM buffer (16-bit signed integer, 16kHz mono).
   * Returns the transcribed text, or empty string if silent/failed.
   */
  async transcribe(pcm: Buffer): Promise<string> {
    if (!this.ready) {
      logger.warn("Not initialized, skipping transcription");
      return "";
    }

    const wavPath = join(this.tmpDir, `whisper_${randomUUID()}.wav`);

    try {
      const wav = this.pcmToWav(pcm);
      writeFileSync(wavPath, wav);

      if (!this.gpuFailed) {
        try {
          return await this.runCli(wavPath, true);
        } catch (gpuErr) {
          logger.warn("Whisper GPU failed, falling back to CPU:", String(gpuErr).slice(0, 120));
          this.gpuFailed = true;
        }
      }
      return await this.runCli(wavPath, false);
    } finally {
      try {
        unlinkSync(wavPath);
      } catch {
        /* ignore cleanup failure */
      }
    }
  }

  /**
   * Transcribe a long PCM buffer by splitting into chunks.
   * Each chunk is processed independently and results are concatenated.
   */
  async transcribeChunked(pcm: Buffer, chunkSecs = 45): Promise<string> {
    const BYTES_PER_SAMPLE = 2;
    const SAMPLE_RATE = 16_000;
    const chunkBytes = chunkSecs * SAMPLE_RATE * BYTES_PER_SAMPLE;
    const totalChunks = Math.ceil(pcm.length / chunkBytes);

    if (totalChunks <= 1) {
      return this.transcribe(pcm);
    }

    logger.info(
      `Chunking ${(pcm.length / SAMPLE_RATE / BYTES_PER_SAMPLE).toFixed(0)}s audio into ${totalChunks} × ${chunkSecs}s chunks`
    );

    const chunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkBytes;
      chunks.push(pcm.subarray(start, Math.min(start + chunkBytes, pcm.length)));
    }

    // Run up to 3 chunks in parallel to saturate GPU/CPU
    const CONCURRENCY = 3;
    const results: string[] = new Array(totalChunks).fill("");
    for (let i = 0; i < totalChunks; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const texts = await Promise.all(batch.map((c) => this.transcribe(c)));
      texts.forEach((t, j) => {
        results[i + j] = t;
      });
    }
    return results.filter((t) => t.length > 0).join(" ");
  }

  private runCli(wavPath: string, useGpu = true): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        "-m",
        this.modelPath,
        "-f",
        wavPath,
        "--no-timestamps",
        "--no-prints",
        "-t",
        "4",
        "-l",
        "en",
        ...(useGpu ? [] : ["--no-gpu"]),
      ];

      const child = execFile(
        this.cliPath,
        args,
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
        },
        (error, stdout, stderr) => {
          if (error) {
            logger.warn("whisper-cli error:", error.message);
            if (stderr) logger.warn("stderr:", stderr.slice(0, 500));
            reject(error);
            return;
          }

          const text = stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith("["))
            .join(" ")
            .trim();

          resolve(text);
        }
      );

      child.on("error", (err) => {
        logger.error("Failed to spawn whisper-cli:", err.message);
        reject(err);
      });
    });
  }

  shutdown(): void {
    this.ready = false;
    logger.info("WhisperCLI shut down");
  }
}

export const whisperCliService = new WhisperCliService();
