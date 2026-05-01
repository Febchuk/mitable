/**
 * Audio Capture
 *
 * Captures microphone and system audio as two independent streams in the
 * main process.
 *
 * - Microphone ("user"): captured via ffmpeg (DirectShow) which goes through
 *   Windows' audio enhancement stack (noise suppression, echo cancellation).
 *   native-audio-node's MicrophoneRecorder produced corrupt/noisy PCM on
 *   many setups, so ffmpeg is used as a proven alternative.
 *
 * - System audio ("remote"): captured via native-audio-node's
 *   SystemAudioRecorder (WASAPI loopback), which works reliably for this.
 *
 * Both produce mono PCM at 16 kHz, ready for WAV encoding and transcription.
 */

import { EventEmitter } from "events";
import { spawn, execSync, type ChildProcess } from "child_process";
import { createLogger } from "../../lib/logger";

const logger = createLogger("AudioCapture");

type AudioSource = "user" | "remote";

export interface NativeAudioChunk {
  source: AudioSource;
  data: Buffer;
}

interface NativeAudioEvents {
  data: (chunk: NativeAudioChunk) => void;
  error: (error: Error, source: AudioSource) => void;
}

function findFfmpegPath(): string | null {
  try {
    const result = execSync("where ffmpeg", {
      encoding: "utf-8",
      shell: "cmd.exe",
      timeout: 5000,
    }).trim();
    const first = result.split("\n")[0]?.trim();
    if (first) return first;
  } catch {
    /* ffmpeg not found */
  }
  return null;
}

function discoverDefaultMicName(ffmpegPath: string): string | null {
  try {
    const output = execSync(`"${ffmpegPath}" -list_devices true -f dshow -i dummy 2>&1`, {
      encoding: "utf-8",
      shell: "cmd.exe",
      timeout: 5000,
    });
    const audioLines = output.split("\n").filter((l) => l.includes("(audio)"));
    for (const line of audioLines) {
      const match = line.match(/"([^"]+)"/);
      if (match) {
        logger.info(`Discovered default mic: ${match[1]}`);
        return match[1];
      }
    }
  } catch (err: any) {
    const stderr = err.stdout || err.stderr || "";
    const audioLines = stderr.split("\n").filter((l: string) => l.includes("(audio)"));
    for (const line of audioLines) {
      const match = line.match(/"([^"]+)"/);
      if (match) {
        logger.info(`Discovered default mic (from stderr): ${match[1]}`);
        return match[1];
      }
    }
  }
  return null;
}

function resolveDeviceName(deviceId: string | null | undefined): string | null {
  if (!deviceId) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nativeAudio = require("native-audio-node");
    const devices = nativeAudio.listAudioDevices().filter((d: any) => d.isInput);
    const match = devices.find((d: any) => d.id === deviceId);
    if (match) return match.name;
    logger.warn(`Device ID "${deviceId}" not found in native-audio-node list`);
  } catch (err) {
    logger.warn("Could not resolve device name via native-audio-node:", String(err));
  }

  return null;
}

class NativeAudioCapture extends EventEmitter {
  private ffmpegProc: ChildProcess | null = null;
  private systemRecorder: any = null;
  private active = false;
  private emitCount = 0;
  private ffmpegPath: string | null = null;

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

  async start(deviceId?: string | null): Promise<{ micStarted: boolean; systemStarted: boolean }> {
    if (this.active) {
      logger.warn("start() called while already active");
      return { micStarted: !!this.ffmpegProc, systemStarted: !!this.systemRecorder };
    }
    this.emitCount = 0;

    let micStarted = false;
    let systemStarted = false;

    // --- Microphone via ffmpeg (DirectShow) ---
    micStarted = await this.startMicFfmpeg(deviceId);

    // --- System Audio via native-audio-node (WASAPI loopback) ---
    try {
      const nativeAudio = await import("native-audio-node");

      this.systemRecorder = new nativeAudio.SystemAudioRecorder({
        sampleRate: 16000,
        chunkDurationMs: 200,
        stereo: false,
        emitSilence: false,
      });

      this.systemRecorder.on("data", (chunk: { data: Buffer }) => {
        if (this.emitCount < 5) {
          logger.info(`System audio data event: ${chunk.data?.length ?? 0}B`);
        }
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

  private async startMicFfmpeg(deviceId?: string | null): Promise<boolean> {
    if (!this.ffmpegPath) {
      this.ffmpegPath = findFfmpegPath();
    }

    if (!this.ffmpegPath) {
      logger.error("ffmpeg not found in PATH — mic capture unavailable");
      return false;
    }

    let deviceName = resolveDeviceName(deviceId);

    // If no device specified (or not found), discover the default input device
    if (!deviceName) {
      deviceName = discoverDefaultMicName(this.ffmpegPath);
    }

    if (!deviceName) {
      logger.error("No microphone device found for ffmpeg capture");
      return false;
    }

    const args = [
      "-f",
      "dshow",
      "-i",
      `audio=${deviceName}`,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-f",
      "s16le",
      "pipe:1",
    ];

    logger.info(`Starting ffmpeg mic capture: ${deviceName ?? "system default"}`);
    logger.info(`ffmpeg args: ${args.join(" ")}`);

    try {
      this.ffmpegProc = spawn(this.ffmpegPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      this.ffmpegProc.stdout!.on("data", (chunk: Buffer) => {
        this.emitCount++;
        if (this.emitCount === 1) {
          logger.info(
            `First ffmpeg mic data: ${chunk.length}B, listeners=${this.listenerCount("data")}`
          );
        }
        this.emit("data", { source: "user", data: chunk });
      });

      this.ffmpegProc.stderr!.on("data", (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        // ffmpeg logs everything to stderr — only log errors, not status
        if (msg.includes("Error") || msg.includes("error") || msg.includes("Invalid")) {
          logger.error("ffmpeg stderr:", msg.slice(0, 200));
        }
      });

      this.ffmpegProc.on("close", (code) => {
        if (this.active) {
          logger.warn(`ffmpeg mic process exited unexpectedly with code ${code}`);
          this.emit("error", new Error(`ffmpeg exited with code ${code}`), "user");
        }
      });

      this.ffmpegProc.on("error", (err) => {
        logger.error("ffmpeg process error:", String(err));
        this.emit("error", err, "user");
      });

      // Give ffmpeg a moment to initialize and check it didn't immediately crash
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (this.ffmpegProc.killed || this.ffmpegProc.exitCode !== null) {
        logger.error("ffmpeg mic process failed to start");
        this.ffmpegProc = null;
        return false;
      }

      logger.info(
        `Microphone capture started via ffmpeg (16kHz mono, device: ${deviceName ?? "default"})`
      );
      return true;
    } catch (err) {
      logger.error("Failed to start ffmpeg mic capture:", String(err));
      this.ffmpegProc = null;
      return false;
    }
  }

  private stopMicFfmpeg(): void {
    if (!this.ffmpegProc) return;

    try {
      // Send 'q' to ffmpeg's stdin for graceful shutdown
      this.ffmpegProc.stdin?.write("q");
      this.ffmpegProc.stdin?.end();

      // Force kill after 2s if it doesn't exit
      const proc = this.ffmpegProc;
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
          logger.warn("ffmpeg mic process force-killed after timeout");
        }
      }, 2000);

      logger.info("ffmpeg mic capture stopped");
    } catch (err) {
      logger.warn("Error stopping ffmpeg mic:", String(err));
      try {
        this.ffmpegProc.kill("SIGKILL");
      } catch {
        /* force kill fallback */
      }
    }
    this.ffmpegProc = null;
  }

  async stop(): Promise<void> {
    if (!this.active) return;

    const errors: string[] = [];

    // Stop mic (ffmpeg)
    try {
      this.stopMicFfmpeg();
    } catch (err) {
      errors.push(`mic: ${String(err)}`);
    }

    // Stop system audio (native-audio-node)
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

  /**
   * Hot-swap the microphone without touching system audio.
   * Kills the current ffmpeg process and spawns a new one with the given device.
   */
  async switchMicrophone(
    deviceId?: string | null
  ): Promise<{ success: boolean; deviceName?: string }> {
    if (!this.active) {
      logger.warn("switchMicrophone() called while not active");
      return { success: false };
    }

    this.stopMicFfmpeg();

    const deviceName = resolveDeviceName(deviceId) ?? "System Default";
    logger.info(`Switching microphone to: ${deviceName}`);

    const success = await this.startMicFfmpeg(deviceId);

    if (success) {
      logger.info(`Microphone switched to ${deviceName} (16kHz mono via ffmpeg)`);
      return { success: true, deviceName };
    } else {
      logger.error("Failed to start new microphone after switch");
      return { success: false };
    }
  }
}

export const nativeAudioCapture = new NativeAudioCapture();
