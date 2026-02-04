/**
 * Audio Transcription Service
 *
 * Captures microphone + system audio for session transcription via Deepgram.
 *
 * Features:
 * - Dual audio capture (mic + system audio when available)
 * - Web Audio API mixing to single 16kHz mono stream
 * - Streams audio chunks to backend via IPC
 * - Graceful degradation if system audio unavailable
 *
 * @module audioTranscriptionService
 */

import { createLogger } from "../lib/logger";

const logger = createLogger("AudioTranscription");

// ===========================
// Types & Interfaces
// ===========================

interface AudioCaptureState {
  sessionId: string;
  micStream: MediaStream | null;
  systemStream: MediaStream | null;
  audioContext: AudioContext | null;
  audioWorkletNode: AudioWorkletNode | null;
  isCapturing: boolean;
}

// ===========================
// AudioTranscriptionService Class
// ===========================

class AudioTranscriptionService {
  private captureState: AudioCaptureState | null = null;

  /**
   * Start capturing audio for a session
   */
  async startCapture(
    sessionId: string,
    onAudioChunk: (chunk: ArrayBuffer) => void,
    options?: { micDeviceId?: string }
  ): Promise<{
    success: boolean;
    hasSystemAudio: boolean;
    error?: string;
  }> {
    if (this.captureState?.isCapturing) {
      return {
        success: false,
        hasSystemAudio: false,
        error: "Audio capture already active",
      };
    }

    logger.info(`[AudioTranscription] Starting audio capture for session: ${sessionId}`);

    try {
      logger.info(`🎤 Requesting microphone access...`);

      // Step 1: Capture microphone (always required)
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: options?.micDeviceId ? { exact: options.micDeviceId } : undefined,
          // Keep default processing to capture everything clearly
          echoCancellation: false, // Keep both voices (mic + system picked up by mic)
          noiseSuppression: false, // Don't filter out background voices
          autoGainControl: true, // Normalize volume differences
          channelCount: 1,
          sampleRate: 16000, // Deepgram's preferred sample rate
        },
      });

      const micTrack = micStream.getAudioTracks()[0];
      const micSettings = micTrack.getSettings();
      logger.info("✅ Microphone stream captured", {
        deviceLabel: micTrack.label || "Unknown device",
        deviceId: micTrack.id,
        appliedSettings: micSettings,
        constraints: micTrack.getConstraints(),
      });

      // Step 2: Try to capture system audio (may fail in Citrix/RDP)
      let systemStream: MediaStream | null = null;
      try {
        systemStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true, // Request system audio
          video: true, // Required on some platforms to get audio reliably
        });
        const systemTrack = systemStream.getAudioTracks()[0];
        if (systemTrack) {
          const systemSettings = systemTrack.getSettings();
          logger.info("✅ System audio stream captured", {
            deviceLabel: systemTrack.label || "Unknown device",
            appliedSettings: systemSettings,
          });
        }
      } catch (error) {
        logger.warn("⚠️ System audio not available (expected in Citrix/RDP scenarios):", error);
      }

      // Step 3: Create STEREO audio context (L=mic, R=system)
      const audioContext = new AudioContext({ sampleRate: 16000 });

      // Create sources
      const micSource = audioContext.createMediaStreamSource(micStream);

      // Optional per-device gain (TODO: load from stored calibration)
      const micGain = audioContext.createGain();
      micGain.gain.value = 1.0; // Default, can be calibrated later
      micSource.connect(micGain);

      // Merge into stereo: Channel 0 (Left) = mic, Channel 1 (Right) = system
      const merger = audioContext.createChannelMerger(2);
      micGain.connect(merger, 0, 0); // mic -> left channel

      if (systemStream) {
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        const systemGain = audioContext.createGain();
        systemGain.gain.value = 1.0; // Default
        systemSource.connect(systemGain);
        systemGain.connect(merger, 0, 1); // system -> right channel
      } else {
        // If no system audio, fill right channel with silence
        const silenceNode = audioContext.createConstantSource();
        silenceNode.offset.value = 0;
        silenceNode.connect(merger, 0, 1);
        silenceNode.start();
      }

      // Create destination from stereo merger
      const destination = audioContext.createMediaStreamDestination();
      merger.connect(destination);

      const stereoStream = destination.stream;

      // Step 4: Extract STEREO PCM16 with ScriptProcessor
      // NOTE: Using ScriptProcessor (deprecated) for now, migrate to AudioWorklet later
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 2, 2); // 2 input, 2 output channels

      const stereoSource = audioContext.createMediaStreamSource(stereoStream);
      stereoSource.connect(processor);
      processor.connect(audioContext.destination); // Required for some browsers

      let chunkCount = 0;
      processor.onaudioprocess = (event) => {
        const left = event.inputBuffer.getChannelData(0); // Mic channel
        const right = event.inputBuffer.getChannelData(1); // System channel

        // Convert to INTERLEAVED stereo PCM16: L0,R0,L1,R1,L2,R2,...
        // This is the format Deepgram expects for multichannel audio
        const pcm16 = new Int16Array(left.length * 2);

        for (let i = 0; i < left.length; i++) {
          const l = Math.max(-1, Math.min(1, left[i]));
          const r = Math.max(-1, Math.min(1, right[i]));

          pcm16[i * 2] = l < 0 ? l * 0x8000 : l * 0x7fff; // Left sample
          pcm16[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff; // Right sample
        }

        // Send interleaved stereo PCM16 data
        // Chunk size: 4096 frames × 2 channels × 2 bytes = 16384 bytes (16 KB)
        onAudioChunk(pcm16.buffer);

        chunkCount++;
        if (chunkCount % 50 === 0) {
          // Log every 50 chunks (~2 seconds at 4096 buffer)
          logger.info(
            `📊 Stereo audio chunks: ${chunkCount} (${pcm16.buffer.byteLength} bytes each, ${left.length} frames)`
          );
        }
      };

      // Save state
      this.captureState = {
        sessionId,
        micStream,
        systemStream,
        audioContext,
        audioWorkletNode: processor as unknown as AudioWorkletNode, // Store processor
        isCapturing: true,
      };

      logger.info("✅ Stereo audio capture started", {
        sessionId,
        hasSystemAudio: !!systemStream,
        sampleRate: audioContext.sampleRate,
        channels: 2,
        format: "interleaved PCM16 stereo (L=mic, R=system)",
      });

      return {
        success: true,
        hasSystemAudio: !!systemStream,
      };
    } catch (error) {
      logger.error("❌ Failed to start audio capture:", error);

      // Cleanup any partial state
      await this.stopCapture();

      return {
        success: false,
        hasSystemAudio: false,
        error: `Failed to capture audio: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Stop capturing audio
   */
  async stopCapture(): Promise<void> {
    if (!this.captureState) {
      logger.warn(" No active capture to stop");
      return;
    }

    logger.info(` Stopping audio capture for session: ${this.captureState.sessionId}`);

    try {
      // Stop all tracks
      this.captureState.micStream?.getTracks().forEach((track) => track.stop());
      this.captureState.systemStream?.getTracks().forEach((track) => track.stop());

      // Disconnect audio nodes
      if (this.captureState.audioWorkletNode) {
        this.captureState.audioWorkletNode.disconnect();
      }

      // Close audio context
      if (this.captureState.audioContext) {
        await this.captureState.audioContext.close();
      }

      logger.info("✅ Audio capture stopped successfully");
    } catch (error) {
      logger.error("❌ Error stopping audio capture:", error);
    } finally {
      // Clear state
      this.captureState = null;
    }
  }

  /**
   * Check if currently capturing
   */
  isCapturing(): boolean {
    return this.captureState?.isCapturing ?? false;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.captureState?.sessionId ?? null;
  }
}

// Export singleton instance
export const audioTranscriptionService = new AudioTranscriptionService();
