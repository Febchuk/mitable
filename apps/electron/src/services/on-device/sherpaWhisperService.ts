/**
 * Sherpa-ONNX Whisper Service
 *
 * CPU-based speech-to-text using OpenAI's Whisper model via sherpa-onnx.
 * Runs entirely on CPU so it never competes with Ollama for VRAM.
 *
 * Uses whisper-small.en (int8 quantized) for good accuracy on system audio.
 * Falls back to whisper-base.en if small.en isn't downloaded yet.
 * Model files live in: <userData>/sherpa-models/sherpa-onnx-whisper-{small,base}.en/
 */

import { app } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { createLogger } from "../../lib/logger";

const logger = createLogger("SherpaWhisper");

const MODELS = [
  { dir: "sherpa-onnx-whisper-small.en", prefix: "small.en" },
  { dir: "sherpa-onnx-whisper-base.en", prefix: "base.en" },
] as const;

interface SherpaRecognizer {
  createStream(): SherpaStream;
  decode(stream: SherpaStream): void;
  getResult(stream: SherpaStream): { text: string };
  free(): void;
}

interface SherpaStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  free(): void;
}

class SherpaWhisperService {
  private recognizer: SherpaRecognizer | null = null;
  private modelDir: string = "";
  private ready = false;

  async initialize(): Promise<boolean> {
    if (this.ready) return true;

    const baseDir = join(app.getPath("userData"), "sherpa-models").replace(/\\/g, "/");

    // Try models in preference order: small.en first, fall back to base.en
    let chosen: { dir: string; prefix: string } | null = null;
    for (const m of MODELS) {
      const dir = `${baseDir}/${m.dir}`;
      const enc = `${dir}/${m.prefix}-encoder.int8.onnx`;
      const dec = `${dir}/${m.prefix}-decoder.int8.onnx`;
      const tok = `${dir}/${m.prefix}-tokens.txt`;
      if (existsSync(enc) && existsSync(dec) && existsSync(tok)) {
        chosen = { ...m, dir };
        break;
      }
    }

    if (!chosen) {
      logger.warn("No Whisper model files found in:", baseDir);
      return false;
    }

    this.modelDir = chosen.dir;
    logger.info(`Model files found (${chosen.prefix}), loading sherpa-onnx...`);

    try {
      const sherpa = await import("sherpa-onnx");
      logger.info(`sherpa-onnx loaded (v${sherpa.version ?? "?"})`);

      const config = {
        modelConfig: {
          whisper: {
            encoder: `${chosen.dir}/${chosen.prefix}-encoder.int8.onnx`,
            decoder: `${chosen.dir}/${chosen.prefix}-decoder.int8.onnx`,
            language: "en",
            task: "transcribe",
            tailPaddings: -1,
          },
          tokens: `${chosen.dir}/${chosen.prefix}-tokens.txt`,
          numThreads: 1,
          provider: "cpu",
        },
      };

      logger.info("Creating offline recognizer...");
      const recognizer = sherpa.createOfflineRecognizer(config);

      if (!recognizer || typeof recognizer.createStream !== "function") {
        logger.error("createOfflineRecognizer returned invalid object:", typeof recognizer);
        return false;
      }

      this.recognizer = recognizer as SherpaRecognizer;
      this.ready = true;
      logger.info(`Whisper ${chosen.prefix} recognizer initialized (CPU, WASM, int8)`);
      return true;
    } catch (err) {
      logger.error("Failed to initialize sherpa-onnx:", String(err));
      if (err instanceof Error) {
        logger.error("Stack:", err.stack);
      }
      return false;
    }
  }

  isReady(): boolean {
    return this.ready && this.recognizer !== null;
  }

  /**
   * Transcribe a PCM buffer (16-bit signed integer, 16kHz mono).
   * Returns the transcribed text, or empty string if silent/failed.
   */
  transcribe(pcm: Buffer): string {
    if (!this.recognizer) {
      logger.warn("Recognizer not initialized, skipping transcription");
      return "";
    }

    // native-audio-node emits float32 samples (-1..1, 4 bytes each).
    // Detect format and convert to the Float32Array sherpa expects.
    let float32: Float32Array;

    if (this.isFloat32Pcm(pcm)) {
      float32 = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
    } else {
      const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
      float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }
    }

    const stream = this.recognizer.createStream();
    try {
      stream.acceptWaveform(16000, float32);
      this.recognizer.decode(stream);
      const result = this.recognizer.getResult(stream);
      return result.text.trim();
    } finally {
      stream.free();
    }
  }

  private isFloat32Pcm(pcm: Buffer): boolean {
    if (pcm.length < 400) return false;
    const floats = new Float32Array(pcm.buffer, pcm.byteOffset, Math.min(100, pcm.byteLength / 4));
    return Array.from(floats).every((v) => v >= -1.5 && v <= 1.5);
  }

  /**
   * Transcribe a long PCM buffer by splitting into chunks.
   * Each chunk is processed independently and results are concatenated.
   */
  transcribeChunked(pcm: Buffer, chunkSecs = 15): string {
    const BYTES_PER_SAMPLE = 2;
    const SAMPLE_RATE = 16_000;
    const chunkBytes = chunkSecs * SAMPLE_RATE * BYTES_PER_SAMPLE;
    const totalChunks = Math.ceil(pcm.length / chunkBytes);

    if (totalChunks <= 1) {
      return this.transcribe(pcm);
    }

    const parts: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkBytes;
      const end = Math.min(start + chunkBytes, pcm.length);
      const chunk = pcm.subarray(start, end);
      const text = this.transcribe(chunk);
      if (text.length > 0) {
        parts.push(text);
      }
    }
    return parts.join(" ");
  }

  shutdown(): void {
    if (this.recognizer) {
      try {
        this.recognizer.free();
      } catch {
        /* ignore */
      }
      this.recognizer = null;
    }
    this.ready = false;
    logger.info("Sherpa Whisper shut down");
  }
}

export const sherpaWhisperService = new SherpaWhisperService();
