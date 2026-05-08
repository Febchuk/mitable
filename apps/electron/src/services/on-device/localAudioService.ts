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
 * Each flush records an AudioSegmentMeta in the session timeline.
 * Streaming transcription runs every 30s and produces timestamped
 * TranscriptSegments (offsetMs relative to session start) that are
 * persisted to the timeline for crash-safe, chronologically aligned output.
 */

import { createLogger } from "../../lib/logger";
import { nativeAudioCapture, type NativeAudioChunk } from "./nativeAudioCapture";
import { existsSync, appendFileSync, readFileSync, unlinkSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { sessionTimeline } from "./sessionTimeline";
import type { TranscriptSegment } from "./sessionTimeline";
import { preferencesService } from "../preferencesService";

const logger = createLogger("LocalAudio");

const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const FLUSH_INTERVAL_MS = 15_000;
const FLUSH_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5 MB
const TRANSCRIBE_INTERVAL_MS = 30_000;

const MIC_ENERGY_GATE_THRESHOLD = 800;
const ENERGY_WINDOW_SECS = 5;
const ENERGY_WINDOW_BYTES = ENERGY_WINDOW_SECS * SAMPLE_RATE * BYTES_PER_SAMPLE;

type AudioSource = "user" | "remote";

interface SourceBuffer {
  chunks: Buffer[];
  totalBytes: number;
}

interface SourceState {
  bytesTranscribed: number;
  bytesFlushed: number;
  segmentIndex: number;
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
  private sourceState: Record<AudioSource, SourceState> = {
    user: { bytesTranscribed: 0, bytesFlushed: 0, segmentIndex: 0 },
    remote: { bytesTranscribed: 0, bytesFlushed: 0, segmentIndex: 0 },
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

    this.sourceState = {
      user: { bytesTranscribed: 0, bytesFlushed: 0, segmentIndex: 0 },
      remote: { bytesTranscribed: 0, bytesFlushed: 0, segmentIndex: 0 },
    };

    nativeAudioCapture.on("data", this.onAudioData);

    const audioPrefs = preferencesService.getAudioPreferences();
    const result = await nativeAudioCapture.start(audioPrefs.microphoneDeviceId);

    sessionTimeline.recordAudioStart();

    this.flushTimer = setInterval(() => {
      this.flushToDisk("user");
      this.flushToDisk("remote");
    }, FLUSH_INTERVAL_MS);

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

    // Wait for any in-progress transcription tick to finish
    const maxWait = 120_000;
    const start = Date.now();
    while (this.transcribing && Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 200));
    }

    // Final transcription pass on ALL remaining audio
    this.transcribing = false;
    await this.transcribeNewAudio();

    sessionTimeline.recordAudioEnd();

    this.active = false;
    logger.info("Stopped audio capture (final flush + transcription done)");
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Hot-swap the microphone during an active session.
   * Flushes current audio to disk before switching so the gap is minimal.
   */
  async switchMicrophone(
    deviceId?: string | null
  ): Promise<{ success: boolean; deviceName?: string }> {
    if (!this.active) {
      logger.warn("switchMicrophone() called while not active");
      return { success: false };
    }

    this.flushToDisk("user");

    const result = await nativeAudioCapture.switchMicrophone(deviceId);

    if (result.success) {
      sessionTimeline.recordMicSwitch(deviceId ?? null, result.deviceName ?? "System Default");
      logger.info(`Microphone switched to: ${result.deviceName ?? "System Default"}`);
    }

    return result;
  }

  clear(): void {
    this.resetBuffers();
    this.sourceState = {
      user: { bytesTranscribed: 0, bytesFlushed: 0, segmentIndex: 0 },
      remote: { bytesTranscribed: 0, bytesFlushed: 0, segmentIndex: 0 },
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
   * Returns timestamped transcript segments accumulated during recording.
   * Each segment has offsetMs relative to session start for timeline alignment.
   * Call after stop() for complete results.
   */
  getAccumulatedTranscripts(): TranscriptSegment[] {
    return sessionTimeline.getAllTranscriptSegments();
  }

  /**
   * Transcribe any new audio that has been flushed to disk since the last pass.
   * Produces timestamped TranscriptSegments aligned to session start.
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

      const audioStartOffsetMs = sessionTimeline.get()?.audioStartOffsetMs ?? 0;

      const transcribeSource = async (source: AudioSource) => {
        const filePath = this.audioFilePath(source);
        if (!existsSync(filePath)) return null;

        const fileSize = statSync(filePath).size;
        const already = this.sourceState[source].bytesTranscribed;
        const newBytes = fileSize - already;

        const minBytes = SAMPLE_RATE * BYTES_PER_SAMPLE * 2;
        if (newBytes < minBytes) return null;

        const fullPcm = readFileSync(filePath);
        const newPcm = fullPcm.subarray(already, fileSize);

        const aligned = Math.floor(newPcm.length / BYTES_PER_SAMPLE) * BYTES_PER_SAMPLE;
        let chunk: Buffer = Buffer.from(newPcm.subarray(0, aligned));

        // For mic audio, apply energy gating to filter out speaker bleed
        if (source === "user") {
          const gated = this.energyGateMicAudio(Buffer.from(chunk));
          if (gated.length === 0) {
            this.sourceState[source].bytesTranscribed = already + aligned;
            logger.info("Energy gate: all windows below threshold, skipping user transcription");
            return null;
          }
          chunk = gated;
        }

        const startByteSec = already / (SAMPLE_RATE * BYTES_PER_SAMPLE);
        const endByteSec = (already + aligned) / (SAMPLE_RATE * BYTES_PER_SAMPLE);
        const startOffsetMs = audioStartOffsetMs + startByteSec * 1000;
        const endOffsetMs = audioStartOffsetMs + endByteSec * 1000;

        const durationSec = Math.round(aligned / (SAMPLE_RATE * BYTES_PER_SAMPLE));
        logger.info(
          `Streaming transcription [${source}]: ${durationSec}s new audio ` +
            `(offset ${(startOffsetMs / 1000).toFixed(1)}s-${(endOffsetMs / 1000).toFixed(1)}s)`
        );

        const text = await whisperCliService.transcribeChunked(Buffer.from(chunk), 45);
        this.sourceState[source].bytesTranscribed = already + aligned;

        if (text.length > 0) {
          const segment: TranscriptSegment = {
            startOffsetMs,
            endOffsetMs,
            text,
            source,
          };
          sessionTimeline.addTranscriptSegment(segment);
          logger.info(`Transcript segment added [${source}]: "${text.slice(0, 80)}..."`);

          // Also append to block.md in real-time (if markdown file exists)
          try {
            const { hybridInferenceService } = await import("./hybridInferenceService");
            await hybridInferenceService.appendTranscript(text, source, startOffsetMs, endOffsetMs);
          } catch {
            // Non-critical - transcript will still be in timeline
          }
        }
      };

      await Promise.all([transcribeSource("user"), transcribeSource("remote")]);
    } catch (err) {
      logger.debug("Streaming transcription error:", String(err));
    } finally {
      this.transcribing = false;
    }
  }

  /**
   * Split mic PCM into 5s windows and discard windows below the energy
   * threshold (speaker bleed). Returns only the windows where the user
   * is actually speaking, stitched back into a contiguous buffer.
   */
  private energyGateMicAudio(pcm: Buffer): Buffer {
    const totalWindows = Math.ceil(pcm.length / ENERGY_WINDOW_BYTES);
    const kept: Buffer[] = [];
    let skipped = 0;

    for (let i = 0; i < totalWindows; i++) {
      const start = i * ENERGY_WINDOW_BYTES;
      const end = Math.min(start + ENERGY_WINDOW_BYTES, pcm.length);
      const window = pcm.subarray(start, end);
      const rms = LocalAudioService.computeRMS(window);

      if (rms >= MIC_ENERGY_GATE_THRESHOLD) {
        kept.push(Buffer.from(window));
      } else {
        skipped++;
      }
    }

    logger.info(
      `Energy gate: ${totalWindows} windows, ${kept.length} passed, ` +
        `${skipped} skipped (threshold=${MIC_ENERGY_GATE_THRESHOLD})`
    );

    if (kept.length === 0) return Buffer.alloc(0);
    return Buffer.concat(kept);
  }

  private static computeRMS(pcm: Buffer): number {
    const samples = pcm.length / BYTES_PER_SAMPLE;
    if (samples === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < pcm.length; i += BYTES_PER_SAMPLE) {
      const sample = pcm.readInt16LE(i);
      sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / samples);
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

      const byteOffset = this.sourceState[source].bytesFlushed;
      appendFileSync(filePath, pcm);

      const audioStartOffsetMs = sessionTimeline.get()?.audioStartOffsetMs ?? 0;
      const startSec = byteOffset / (SAMPLE_RATE * BYTES_PER_SAMPLE);
      const endSec = (byteOffset + pcm.length) / (SAMPLE_RATE * BYTES_PER_SAMPLE);

      sessionTimeline.recordAudioSegment({
        index: this.sourceState[source].segmentIndex++,
        startOffsetMs: audioStartOffsetMs + startSec * 1000,
        endOffsetMs: audioStartOffsetMs + endSec * 1000,
        byteOffset,
        byteLength: pcm.length,
        source,
        transcribed: false,
      });

      this.sourceState[source].bytesFlushed += pcm.length;
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
