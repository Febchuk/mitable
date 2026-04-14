/**
 * Local Audio Service
 *
 * Buffers incoming PCM16 stereo audio chunks from the WatchingPill renderer
 * and periodically transcribes them via the local whisper-server.
 *
 * Audio flow:
 *   WatchingPill AudioWorklet (PCM16 stereo, 16kHz)
 *     -> IPC "audio-chunk"
 *     -> localAudioService.addChunk(buffer)
 *     -> accumulate ~10s of audio
 *     -> convert stereo PCM16 -> mono WAV
 *     -> POST to whisper-server /inference
 *     -> store transcript in localDb.transcriptions
 *
 * The Storyteller reads these transcriptions at session end to enrich
 * the session narrative with what was spoken.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../../lib/logger";
import { whisperServerService } from "./whisperServerService";
import { localDb } from "./localDb";

const logger = createLogger("LocalAudio");

const FLUSH_INTERVAL_MS = 10_000;
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const CHANNELS = 2;

class LocalAudioService {
  private pcmBuffer: Buffer[] = [];
  private pcmBufferBytes = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private chunkIndex = 0;
  private currentSessionId: string | null = null;
  private sessionStartMs: number = 0;
  private totalSamplesProcessed = 0;
  private processing = false;

  start(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.chunkIndex = 0;
    this.pcmBuffer = [];
    this.pcmBufferBytes = 0;
    this.totalSamplesProcessed = 0;
    this.sessionStartMs = Date.now();
    this.processing = false;

    this.flushTimer = setInterval(() => {
      if (this.pcmBufferBytes > 0 && !this.processing) {
        this.flush().catch((err) =>
          logger.error("Auto-flush failed:", String(err))
        );
      }
    }, FLUSH_INTERVAL_MS);

    logger.info("Started local audio capture for session", sessionId);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.currentSessionId = null;
    logger.info("Stopped local audio capture");
  }

  addChunk(buffer: Buffer): void {
    this.pcmBuffer.push(buffer);
    this.pcmBufferBytes += buffer.length;
  }

  async flushRemaining(): Promise<void> {
    if (this.pcmBufferBytes > 0) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.processing || this.pcmBufferBytes === 0) return;
    if (!whisperServerService.isRunning()) {
      logger.warn("Whisper server not running, dropping audio buffer");
      this.pcmBuffer = [];
      this.pcmBufferBytes = 0;
      return;
    }

    this.processing = true;

    const chunks = this.pcmBuffer;
    const totalBytes = this.pcmBufferBytes;
    this.pcmBuffer = [];
    this.pcmBufferBytes = 0;

    const stereoPcm = Buffer.concat(chunks);
    const frameBytes = BYTES_PER_SAMPLE * CHANNELS; // 4 bytes per stereo frame
    const alignedBytes = Math.floor(totalBytes / frameBytes) * frameBytes;
    const samplesPerChannel = alignedBytes / frameBytes;

    if (samplesPerChannel === 0) {
      logger.debug("Audio buffer too small to form a complete frame, skipping");
      this.processing = false;
      return;
    }

    const startSample = this.totalSamplesProcessed;
    this.totalSamplesProcessed += samplesPerChannel;

    const startTimeMs = this.sessionStartMs + Math.round((startSample / SAMPLE_RATE) * 1000);
    const endTimeMs = this.sessionStartMs + Math.round((this.totalSamplesProcessed / SAMPLE_RATE) * 1000);

    try {
      const monoWav = this.stereoToMonoWav(stereoPcm.subarray(0, alignedBytes), samplesPerChannel);
      logger.debug(`WAV buffer: ${monoWav.length} bytes, ${samplesPerChannel} samples, ${Math.round(samplesPerChannel / SAMPLE_RATE)}s`);

      const transcript = await whisperServerService.transcribe(monoWav);

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
        });

        logger.info(
          `Transcribed chunk ${chunkIdx} (${Math.round(samplesPerChannel / SAMPLE_RATE)}s): "${transcript.slice(0, 80)}..."`
        );
      } else {
        logger.debug("Empty transcription (silence), skipping storage");
      }
    } catch (err) {
      logger.error("Transcription failed:", String(err));
    } finally {
      this.processing = false;
    }
  }

  /**
   * Convert interleaved stereo PCM16 to mono WAV.
   * Takes left channel only (microphone) since L=mic, R=system audio.
   */
  private stereoToMonoWav(stereoPcm: Buffer, samplesPerChannel: number): Buffer {
    const monoPcm = Buffer.alloc(samplesPerChannel * BYTES_PER_SAMPLE);

    for (let i = 0; i < samplesPerChannel; i++) {
      const stereoOffset = i * BYTES_PER_SAMPLE * CHANNELS;
      const left = stereoPcm.readInt16LE(stereoOffset);
      monoPcm.writeInt16LE(left, i * BYTES_PER_SAMPLE);
    }

    return this.wrapWavHeader(monoPcm, 1, SAMPLE_RATE, BYTES_PER_SAMPLE * 8);
  }

  private wrapWavHeader(
    pcmData: Buffer,
    numChannels: number,
    sampleRate: number,
    bitsPerSample: number
  ): Buffer {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
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
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
}

export const localAudioService = new LocalAudioService();
