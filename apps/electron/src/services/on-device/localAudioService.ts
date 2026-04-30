/**
 * Local Audio Service
 *
 * Captures microphone + system audio natively in the main process via
 * native-audio-node. Two independent PCM buffers accumulate audio:
 *   - "user"   — microphone input (what the local user says)
 *   - "remote" — system audio loopback (what remote participants say)
 *
 * Audio is NOT transcribed here. The inference service calls `drainAll()`
 * on batch boundaries to get all accumulated PCM, then transcribes it
 * via Ollama (Gemma 4 native audio). This keeps audio perfectly aligned
 * with the 20-frame capture batches.
 */

import { createLogger } from "../../lib/logger";
import { nativeAudioCapture, type NativeAudioChunk } from "./nativeAudioCapture";

const logger = createLogger("LocalAudio");

const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB cap per source

type AudioSource = "user" | "remote";

interface SourceBuffer {
  chunks: Buffer[];
  totalBytes: number;
}

export interface DrainedAudio {
  user: { pcm: Buffer; durationSec: number };
  remote: { pcm: Buffer; durationSec: number };
}

class LocalAudioService {
  private buffers: Record<AudioSource, SourceBuffer> = {
    user: { chunks: [], totalBytes: 0 },
    remote: { chunks: [], totalBytes: 0 },
  };

  private active = false;

  private chunkCount = 0;

  private onAudioData = (chunk: NativeAudioChunk) => {
    const buf = this.buffers[chunk.source];
    if (buf.totalBytes >= MAX_BUFFER_BYTES) return;
    buf.chunks.push(chunk.data);
    buf.totalBytes += chunk.data.length;
    this.chunkCount++;
    if (this.chunkCount === 1 || this.chunkCount % 500 === 0) {
      logger.info(
        `Audio buffer: ${this.chunkCount} chunks received ` +
          `(user=${this.buffers.user.totalBytes}B, remote=${this.buffers.remote.totalBytes}B)`
      );
    }
  };

  async start(sessionId: string): Promise<{ micStarted: boolean; systemStarted: boolean }> {
    this.resetBuffers();
    this.active = true;

    nativeAudioCapture.on("data", this.onAudioData);
    const result = await nativeAudioCapture.start();

    logger.info(
      `Started audio capture for session ${sessionId} ` +
        `(mic: ${result.micStarted}, system: ${result.systemStarted})`
    );

    return result;
  }

  async stop(): Promise<void> {
    nativeAudioCapture.removeListener("data", this.onAudioData);
    await nativeAudioCapture.stop();
    this.active = false;
    logger.info("Stopped audio capture");
  }

  /**
   * Drain all accumulated audio from both sources and reset buffers.
   * Called by the inference service on batch boundaries so audio
   * aligns with the 20-frame capture window.
   *
   * Returns raw PCM buffers wrapped in WAV headers, ready for Ollama.
   */
  drainAll(): DrainedAudio {
    const result: DrainedAudio = {
      user: this.drainSource("user"),
      remote: this.drainSource("remote"),
    };

    logger.info(
      `Drained audio: user=${result.user.durationSec}s (${result.user.pcm.length}B), ` +
        `remote=${result.remote.durationSec}s (${result.remote.pcm.length}B)`
    );

    return result;
  }

  isActive(): boolean {
    return this.active;
  }

  clear(): void {
    this.resetBuffers();
    logger.info("Cleared audio buffers");
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private drainSource(source: AudioSource): { pcm: Buffer; durationSec: number } {
    const buf = this.buffers[source];

    if (buf.totalBytes === 0) {
      return { pcm: Buffer.alloc(0), durationSec: 0 };
    }

    const pcm = Buffer.concat(buf.chunks);
    const alignedBytes = Math.floor(pcm.length / BYTES_PER_SAMPLE) * BYTES_PER_SAMPLE;
    const sampleCount = alignedBytes / BYTES_PER_SAMPLE;
    const durationSec = Math.round(sampleCount / SAMPLE_RATE);

    buf.chunks = [];
    buf.totalBytes = 0;

    return { pcm: pcm.subarray(0, alignedBytes), durationSec };
  }

  private resetBuffers(): void {
    this.buffers = {
      user: { chunks: [], totalBytes: 0 },
      remote: { chunks: [], totalBytes: 0 },
    };
  }

  /**
   * Wrap raw mono PCM16 data in a WAV header for Ollama audio input.
   */
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
