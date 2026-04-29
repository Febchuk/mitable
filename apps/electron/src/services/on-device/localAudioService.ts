/**
 * Local Audio Service
 *
 * Captures microphone + system audio natively in the main process via
 * native-audio-node (no renderer/Web Audio API needed).
 *
 * Two independent PCM buffers accumulate audio from each source:
 *   - "user"   — microphone input (what the local user says)
 *   - "remote" — system audio loopback (what remote participants say)
 *
 * On each flush cycle the buffers are independently converted to mono WAV
 * and transcribed via Ollama (Gemma 4 native audio) or Whisper (CPU fallback).
 * Each transcript is stored with a `source` label so the storyteller can
 * attribute speech to the correct party.
 *
 * Flush intervals:
 *   - Constrained tier (Gemma E2B): 20s clips
 *   - Capable tier (Gemma 12B + Whisper): 60s clips
 */

import { randomUUID } from "crypto";
import { createLogger } from "../../lib/logger";
import { ollamaService } from "./ollamaService";
import { whisperServerService } from "./whisperServerService";
import { localDb } from "./localDb";
import { getTier } from "./ollamaLifecycle";
import { nativeAudioCapture, type NativeAudioChunk } from "./nativeAudioCapture";

const logger = createLogger("LocalAudio");

const FLUSH_INTERVAL_CONSTRAINED_MS = 20_000;
const FLUSH_INTERVAL_CAPABLE_MS = 60_000;
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM

const ERROR_BACKOFF_MS = 60_000;
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_BUFFER_BYTES = 5 * 1024 * 1024; // 5 MB cap per source (~160s of 16kHz mono)

type AudioSource = "user" | "remote";

interface SourceBuffer {
  chunks: Buffer[];
  totalBytes: number;
  samplesProcessed: number;
}

class LocalAudioService {
  private buffers: Record<AudioSource, SourceBuffer> = {
    user: { chunks: [], totalBytes: 0, samplesProcessed: 0 },
    remote: { chunks: [], totalBytes: 0, samplesProcessed: 0 },
  };

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private chunkIndex = 0;
  private currentSessionId: string | null = null;
  private sessionStartMs = 0;
  private processing = false;

  private consecutiveErrors = 0;
  private backoffUntil = 0;

  private onAudioData = (chunk: NativeAudioChunk) => {
    const buf = this.buffers[chunk.source];
    if (buf.totalBytes >= MAX_BUFFER_BYTES) return;
    buf.chunks.push(chunk.data);
    buf.totalBytes += chunk.data.length;
  };

  async start(sessionId: string): Promise<{ micStarted: boolean; systemStarted: boolean }> {
    this.currentSessionId = sessionId;
    this.chunkIndex = 0;
    this.sessionStartMs = Date.now();
    this.processing = false;
    this.consecutiveErrors = 0;
    this.backoffUntil = 0;
    this.resetBuffers();

    nativeAudioCapture.on("data", this.onAudioData);

    const result = await nativeAudioCapture.start();

    const tier = getTier();
    const intervalMs =
      tier === "capable" ? FLUSH_INTERVAL_CAPABLE_MS : FLUSH_INTERVAL_CONSTRAINED_MS;

    this.flushTimer = setInterval(() => {
      if (!this.processing) {
        this.flushAll().catch((err) => logger.error("Auto-flush failed:", String(err)));
      }
    }, intervalMs);

    logger.info(
      `Started native audio capture for session ${sessionId} ` +
        `(tier: ${tier ?? "unknown"}, interval: ${intervalMs}ms, ` +
        `mic: ${result.micStarted}, system: ${result.systemStarted})`
    );

    return result;
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    nativeAudioCapture.removeListener("data", this.onAudioData);

    await nativeAudioCapture.stop();

    this.currentSessionId = null;
    logger.info("Stopped native audio capture");
  }

  async flushRemaining(): Promise<void> {
    await this.flushAll();
  }

  clear(): void {
    this.resetBuffers();
    this.processing = false;
    logger.info("Cleared audio buffers");
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private resetBuffers(): void {
    this.buffers = {
      user: { chunks: [], totalBytes: 0, samplesProcessed: 0 },
      remote: { chunks: [], totalBytes: 0, samplesProcessed: 0 },
    };
  }

  private async flushAll(): Promise<void> {
    if (this.processing) return;

    // Back off after repeated Ollama failures to avoid spamming a dead model
    if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      if (Date.now() < this.backoffUntil) {
        logger.debug(
          `Skipping audio flush (backing off until ${new Date(this.backoffUntil).toLocaleTimeString()})`
        );
        this.dropBuffers();
        return;
      }
      logger.info("Backoff expired, retrying transcription");
      this.consecutiveErrors = 0;
    }

    this.processing = true;

    try {
      await this.flushSource("user");
      await this.flushSource("remote");
    } finally {
      this.processing = false;
    }
  }

  private dropBuffers(): void {
    for (const source of ["user", "remote"] as AudioSource[]) {
      const buf = this.buffers[source];
      if (buf.totalBytes > 0) {
        buf.samplesProcessed += Math.floor(buf.totalBytes / BYTES_PER_SAMPLE);
        buf.chunks = [];
        buf.totalBytes = 0;
      }
    }
  }

  private async flushSource(source: AudioSource): Promise<void> {
    const buf = this.buffers[source];
    if (buf.totalBytes === 0) return;

    const chunks = buf.chunks;
    const totalBytes = buf.totalBytes;
    buf.chunks = [];
    buf.totalBytes = 0;

    const pcm = Buffer.concat(chunks);
    const alignedBytes = Math.floor(totalBytes / BYTES_PER_SAMPLE) * BYTES_PER_SAMPLE;
    const sampleCount = alignedBytes / BYTES_PER_SAMPLE;

    if (sampleCount === 0) return;

    const startSample = buf.samplesProcessed;
    buf.samplesProcessed += sampleCount;

    const startTimeMs = this.sessionStartMs + Math.round((startSample / SAMPLE_RATE) * 1000);
    const endTimeMs = this.sessionStartMs + Math.round((buf.samplesProcessed / SAMPLE_RATE) * 1000);
    const durationSec = Math.round(sampleCount / SAMPLE_RATE);

    try {
      const monoWav = this.pcmToWav(pcm.subarray(0, alignedBytes), sampleCount);

      logger.debug(`Flushing ${source} audio: ${monoWav.length} bytes, ${durationSec}s`);

      const tier = getTier();
      let transcript: string;

      if (tier === "constrained" && ollamaService.isReady()) {
        transcript = await this.transcribeWithGemma(monoWav);
      } else {
        transcript = await this.transcribeWithWhisper(monoWav);
      }

      if (transcript && transcript.length > 0) {
        const chunkIdx = this.chunkIndex++;
        localDb.insertTranscription({
          id: randomUUID(),
          sessionId: this.currentSessionId!,
          chunkIndex: chunkIdx,
          speakerId: 0,
          transcript,
          startTimeMs,
          endTimeMs,
          confidence: 0.85,
          source,
        });

        logger.info(
          `[${source}] Transcribed chunk ${chunkIdx} (${durationSec}s): "${transcript.slice(0, 80)}..."`
        );
        this.consecutiveErrors = 0;
      } else {
        logger.debug(`[${source}] Empty transcription (silence), skipping`);
      }
    } catch (err) {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        this.backoffUntil = Date.now() + ERROR_BACKOFF_MS;
        logger.warn(
          `[${source}] ${this.consecutiveErrors} consecutive transcription failures — ` +
            `backing off for ${ERROR_BACKOFF_MS / 1000}s. Audio will be dropped until Ollama recovers.`
        );
      } else {
        logger.error(
          `[${source}] Transcription failed (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
          String(err)
        );
      }
    }
  }

  private async transcribeWithGemma(monoWav: Buffer): Promise<string> {
    const audioBase64 = monoWav.toString("base64");
    const audioDataUrl = `data:audio/wav;base64,${audioBase64}`;

    const response = await ollamaService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a speech-to-text transcription engine. Given an audio clip, output ONLY the verbatim transcription of the speech. No commentary, no descriptions, no formatting — just the words spoken.",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: audioDataUrl } },
            { type: "text", text: "Transcribe this audio clip." },
          ],
        },
      ],
      { temperature: 0.0, max_tokens: 512 }
    );

    return response.trim();
  }

  private async transcribeWithWhisper(monoWav: Buffer): Promise<string> {
    if (!whisperServerService.isRunning()) {
      logger.warn("Whisper not available, dropping audio buffer");
      return "";
    }
    return await whisperServerService.transcribe(monoWav);
  }

  /**
   * Wrap raw mono PCM16 data in a WAV header.
   */
  private pcmToWav(pcmData: Buffer, _sampleCount: number): Buffer {
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
