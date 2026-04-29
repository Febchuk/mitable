/**
 * Native Audio Capture
 *
 * Wraps native-audio-node to capture microphone and system audio as two
 * independent streams in the main process. No renderer/Web Audio API needed.
 *
 * Two separate recorders produce labeled PCM buffers:
 *   - MicrophoneRecorder  -> "user"   (what the local user says)
 *   - SystemAudioRecorder -> "remote" (what remote participants say)
 *
 * Both record mono PCM at 16 kHz so the output is ready for WAV encoding
 * and transcription without resampling.
 */

import { EventEmitter } from "events";
import { createLogger } from "../../lib/logger";

const logger = createLogger("NativeAudio");

type AudioSource = "user" | "remote";

export interface NativeAudioChunk {
  source: AudioSource;
  data: Buffer;
}

interface NativeAudioEvents {
  data: (chunk: NativeAudioChunk) => void;
  error: (error: Error, source: AudioSource) => void;
}

class NativeAudioCapture extends EventEmitter {
  private micRecorder: any = null;
  private systemRecorder: any = null;
  private active = false;

  on<K extends keyof NativeAudioEvents>(event: K, listener: NativeAudioEvents[K]): this {
    return super.on(event, listener);
  }

  emit<K extends keyof NativeAudioEvents>(
    event: K,
    ...args: Parameters<NativeAudioEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  isActive(): boolean {
    return this.active;
  }

  async start(): Promise<{ micStarted: boolean; systemStarted: boolean }> {
    if (this.active) {
      logger.warn("start() called while already active");
      return { micStarted: true, systemStarted: !!this.systemRecorder };
    }

    let nativeAudio: typeof import("native-audio-node");
    try {
      nativeAudio = await import("native-audio-node");
    } catch (err) {
      logger.error("Failed to import native-audio-node:", String(err));
      throw new Error("native-audio-node is not available");
    }

    let micStarted = false;
    let systemStarted = false;

    // --- Microphone ---
    try {
      const devices = nativeAudio.listAudioDevices().filter((d: any) => d.isInput);
      if (devices.length > 0) {
        logger.info(`Found ${devices.length} input device(s), using default`);
      }

      this.micRecorder = new nativeAudio.MicrophoneRecorder({
        sampleRate: 16000,
        chunkDurationMs: 200,
        stereo: false,
        gain: 1.0,
      });

      this.micRecorder.on("data", (chunk: { data: Buffer }) => {
        this.emit("data", { source: "user", data: chunk.data });
      });

      this.micRecorder.on("error", (err: Error) => {
        logger.error("Mic recorder error:", String(err));
        this.emit("error", err, "user");
      });

      await this.micRecorder.start();
      micStarted = true;
      logger.info("Microphone recorder started (16kHz mono)");
    } catch (err) {
      logger.error("Failed to start microphone recorder:", String(err));
    }

    // --- System Audio (loopback) ---
    try {
      this.systemRecorder = new nativeAudio.SystemAudioRecorder({
        sampleRate: 16000,
        chunkDurationMs: 200,
        stereo: false,
        emitSilence: false,
      });

      this.systemRecorder.on("data", (chunk: { data: Buffer }) => {
        this.emit("data", { source: "remote", data: chunk.data });
      });

      this.systemRecorder.on("error", (err: Error) => {
        logger.error("System audio recorder error:", String(err));
        this.emit("error", err, "remote");
      });

      await this.systemRecorder.start();
      systemStarted = true;
      logger.info("System audio recorder started (16kHz mono loopback)");
    } catch (err) {
      logger.warn("System audio capture unavailable:", String(err));
    }

    this.active = micStarted || systemStarted;

    if (!this.active) {
      throw new Error("Neither microphone nor system audio could be started");
    }

    return { micStarted, systemStarted };
  }

  async stop(): Promise<void> {
    if (!this.active) return;

    const errors: string[] = [];

    if (this.micRecorder) {
      try {
        await this.micRecorder.stop();
        logger.info("Microphone recorder stopped");
      } catch (err) {
        errors.push(`mic: ${String(err)}`);
      }
      this.micRecorder = null;
    }

    if (this.systemRecorder) {
      try {
        await this.systemRecorder.stop();
        logger.info("System audio recorder stopped");
      } catch (err) {
        errors.push(`system: ${String(err)}`);
      }
      this.systemRecorder = null;
    }

    this.active = false;

    if (errors.length > 0) {
      logger.warn("Errors during stop:", errors.join("; "));
    }
  }
}

export const nativeAudioCapture = new NativeAudioCapture();
