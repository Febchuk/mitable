/**
 * Local Audio Service
 *
 * Captures microphone + system audio natively in the main process via
 * native-audio-node. Audio is flushed to disk every 15 seconds (append-only)
 * to keep RAM usage capped regardless of session length.
 *
 * Two PCM files accumulate on disk per session:
 *   - {sessionDir}/audio_user.pcm   — microphone input
 *   - {sessionDir}/audio_remote.pcm — system audio loopback
 *
 * Streaming transcription runs every 30s during recording via whisper-cli
 * (CPU-only, no GPU contention). By session end the transcript is mostly
 * complete, eliminating the long post-session transcription wait.
 */

import { createLogger } from "../../lib/logger";
import { nativeAudioCapture, type NativeAudioChunk } from "./nativeAudioCapture";
import { existsSync, appendFileSync, readFileSync, unlinkSync, mkdirSync, statSync } from "fs";
import { join } from "path";

const logger = createLogger("LocalAudio");

const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const FLUSH_INTERVAL_MS = 15_000;
const FLUSH_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5 MB
const TRANSCRIBE_INTERVAL_MS = 30_000;

type AudioSource = "user" | "remote";

interface SourceBuffer {
  chunks: Buffer[];
  totalBytes: number;
}

interface StreamingTranscript {
  bytesTranscribed: number;
  text: string;
}

class LocalAudioService {
  private buffers: Record<AudioSource, SourceBuffer> = {
    user: { chunks: [], totalBytes: 0 },
    remote: { chunks: [], totalBytes: 0 },
  };

  private active = false;
  private sessionDir: string | null = null;
  private chunkCount = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private transcribeTimer: ReturnType<typeof setInterval> | null = null;
  private transcribing = false;
  private streamTranscripts: Record<AudioSource, StreamingTranscript> = {
    user: { bytesTranscribed: 0, text: "" },
    remote: { bytesTranscribed: 0, text: "" },
  };

  private onAudioData = (chunk: NativeAudioChunk) => {
    const buf = this.buffers[chunk.source];
    buf.chunks.push(chunk.data);
    buf.totalBytes += chunk.data.length;
    this.chunkCount++;
    if (this.chunkCount === 1 || this.chunkCount % 500 === 0) {
      logger.info(
        `Audio buffer: ${this.chunkCount} chunks received ` +
          `(user=${this.buffers.user.totalBytes}B, remote=${this.buffers.remote.totalBytes}B)`
      );
    }

    if (buf.totalBytes >= FLUSH_SIZE_THRESHOLD) {
      this.flushToDisk(chunk.source);
    }
  };

  async start(
    sessionId: string,
    sessionDir: string
  ): Promise<{ micStarted: boolean; systemStarted: boolean }> {
    this.resetBuffers();
    this.active = true;
    this.sessionDir = sessionDir;

    nativeAudioCapture.on("data", this.onAudioData);
    const result = await nativeAudioCapture.start();

    this.flushTimer = setInterval(() => {
      this.flushToDisk("user");
      this.flushToDisk("remote");
    }, FLUSH_INTERVAL_MS);

    this.streamTranscripts = {
      user: { bytesTranscribed: 0, text: "" },
      remote: { bytesTranscribed: 0, text: "" },
    };

    this.transcribeTimer = setInterval(() => {
      this.transcribeNewAudio().catch((err) =>
        logger.debug("Streaming transcription tick failed:", String(err))
      );
    }, TRANSCRIBE_INTERVAL_MS);

    logger.info(
      `Started audio capture for session ${sessionId} ` +
        `(mic: ${result.micStarted}, system: ${result.systemStarted})`
    );

    return result;
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.transcribeTimer) {
      clearInterval(this.transcribeTimer);
      this.transcribeTimer = null;
    }

    nativeAudioCapture.removeListener("data", this.onAudioData);
    await nativeAudioCapture.stop();

    this.flushToDisk("user");
    this.flushToDisk("remote");

    // Final transcription pass on any remaining audio
    await this.transcribeNewAudio();

    this.active = false;
    logger.info("Stopped audio capture (final flush done)");
  }

  isActive(): boolean {
    return this.active;
  }

  clear(): void {
    this.resetBuffers();
    this.streamTranscripts = {
      user: { bytesTranscribed: 0, text: "" },
      remote: { bytesTranscribed: 0, text: "" },
    };
    if (this.sessionDir) {
      for (const source of ["user", "remote"] as const) {
        const p = this.audioFilePath(source);
        try {
          if (existsSync(p)) unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }
    logger.info("Cleared audio buffers and files");
  }

  /**
   * Read all accumulated audio from disk for a given session directory.
   * Returns contiguous PCM buffers for each source.
   */
  readAllAudio(sessionDir: string): {
    user: { pcm: Buffer; durationSec: number };
    remote: { pcm: Buffer; durationSec: number };
  } {
    const result = {
      user: this.readSourceAudio(join(sessionDir, "audio_user.pcm")),
      remote: this.readSourceAudio(join(sessionDir, "audio_remote.pcm")),
    };

    logger.info(
      `Read audio from disk: user=${result.user.durationSec}s (${result.user.pcm.length}B), ` +
        `remote=${result.remote.durationSec}s (${result.remote.pcm.length}B)`
    );

    return result;
  }

  /**
   * Returns transcripts accumulated during recording.
   * Call after stop() for complete results.
   */
  getAccumulatedTranscripts(): Record<AudioSource, string> {
    return {
      user: this.streamTranscripts.user.text,
      remote: this.streamTranscripts.remote.text,
    };
  }

  /**
   * Transcribe any new audio that has been flushed to disk since the last pass.
   * Uses whisper-cli (non-blocking, CPU-only, no GPU contention during recording).
   */
  private async transcribeNewAudio(): Promise<void> {
    if (this.transcribing || !this.sessionDir) return;
    this.transcribing = true;

    try {
      const { whisperCliService } = await import("./whisperCliService");
      if (!whisperCliService.isReady()) {
        const ok = await whisperCliService.initialize();
        if (!ok) return;
      }

      for (const source of ["user", "remote"] as const) {
        const filePath = this.audioFilePath(source);
        if (!existsSync(filePath)) continue;

        const fileSize = statSync(filePath).size;
        const already = this.streamTranscripts[source].bytesTranscribed;
        const newBytes = fileSize - already;

        // Need at least 2 seconds of audio to be worth transcribing
        const minBytes = SAMPLE_RATE * BYTES_PER_SAMPLE * 2;
        if (newBytes < minBytes) continue;

        const fullPcm = readFileSync(filePath);
        const newPcm = fullPcm.subarray(already, fileSize);

        // Align to sample boundary
        const aligned = Math.floor(newPcm.length / BYTES_PER_SAMPLE) * BYTES_PER_SAMPLE;
        const chunk = newPcm.subarray(0, aligned);

        const durationSec = Math.round(aligned / (SAMPLE_RATE * BYTES_PER_SAMPLE));
        logger.info(
          `Streaming transcription [${source}]: ${durationSec}s new audio (${(aligned / 1024).toFixed(0)} KB)`
        );

        const text = await whisperCliService.transcribeChunked(Buffer.from(chunk), 25);
        if (text.length > 0) {
          this.streamTranscripts[source].text +=
            (this.streamTranscripts[source].text ? " " : "") + text;
        }
        this.streamTranscripts[source].bytesTranscribed = fileSize;
      }
    } catch (err) {
      logger.debug("Streaming transcription error:", String(err));
    } finally {
      this.transcribing = false;
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private flushToDisk(source: AudioSource): void {
    const buf = this.buffers[source];
    if (buf.totalBytes === 0 || !this.sessionDir) return;

    const pcm = Buffer.concat(buf.chunks);
    const filePath = this.audioFilePath(source);

    try {
      const dir = this.sessionDir;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      appendFileSync(filePath, pcm);
      logger.debug(`Flushed ${source} audio: ${pcm.length}B → ${filePath}`);
    } catch (err) {
      logger.error(`Failed to flush ${source} audio to disk:`, String(err));
    }

    buf.chunks = [];
    buf.totalBytes = 0;
  }

  private audioFilePath(source: AudioSource): string {
    return join(this.sessionDir!, `audio_${source}.pcm`);
  }

  private readSourceAudio(filePath: string): { pcm: Buffer; durationSec: number } {
    if (!existsSync(filePath)) {
      return { pcm: Buffer.alloc(0), durationSec: 0 };
    }

    try {
      const pcm = readFileSync(filePath);
      const alignedBytes = Math.floor(pcm.length / BYTES_PER_SAMPLE) * BYTES_PER_SAMPLE;
      const sampleCount = alignedBytes / BYTES_PER_SAMPLE;
      const durationSec = Math.round(sampleCount / SAMPLE_RATE);
      return { pcm: pcm.subarray(0, alignedBytes), durationSec };
    } catch (err) {
      logger.error(`Failed to read audio file ${filePath}:`, String(err));
      return { pcm: Buffer.alloc(0), durationSec: 0 };
    }
  }

  private resetBuffers(): void {
    this.buffers = {
      user: { chunks: [], totalBytes: 0 },
      remote: { chunks: [], totalBytes: 0 },
    };
    this.chunkCount = 0;
  }

  static pcmToWav(pcmData: Buffer): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;

    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
}

export const localAudioService = new LocalAudioService();
