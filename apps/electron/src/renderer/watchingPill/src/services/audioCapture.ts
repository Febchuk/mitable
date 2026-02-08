/**
 * Audio Capture Service (Renderer Side)
 *
 * Captures microphone + system audio using Web Audio API
 * Sends PCM16 stereo chunks to main process via IPC
 *
 * Uses AudioWorklet for off-main-thread processing (replaces deprecated ScriptProcessorNode)
 */

// AudioWorklet processor source — inlined as Blob URL to avoid file-serving issues in Electron
const WORKLET_SOURCE = `
class PCM16StereoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._chunkCount = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length < 2) return true;

    const left = input[0];
    const right = input[1];
    if (!left || left.length === 0) return true;

    // Convert Float32 stereo to interleaved Int16 PCM
    const pcm16 = new Int16Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      const l = Math.max(-1, Math.min(1, left[i]));
      const r = Math.max(-1, Math.min(1, right[i] || 0));
      pcm16[i * 2] = l < 0 ? l * 0x8000 : l * 0x7FFF;
      pcm16[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7FFF;
    }

    // Transfer buffer to main thread (zero-copy)
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor('pcm16-stereo-processor', PCM16StereoProcessor);
`;

interface AudioCaptureState {
  sessionId: string;
  micStream: MediaStream | null;
  systemStream: MediaStream | null;
  audioContext: AudioContext | null;
  workletNode: AudioWorkletNode | null;
  isCapturing: boolean;
}

class AudioCaptureService {
  private captureState: AudioCaptureState | null = null;
  private workletBlobUrl: string | null = null;

  /**
   * Create a Blob URL for the AudioWorklet processor module
   */
  private getWorkletUrl(): string {
    if (!this.workletBlobUrl) {
      const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      this.workletBlobUrl = URL.createObjectURL(blob);
    }
    return this.workletBlobUrl;
  }

  /**
   * Start capturing audio and send chunks via IPC
   */
  async startCapture(sessionId: string): Promise<{
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

    console.log(`[AudioCapture] Starting for session: ${sessionId}`);

    try {
      // Step 1: Capture microphone
      console.log("🎤 Requesting microphone access...");
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      const micTrack = micStream.getAudioTracks()[0];
      console.log("✅ Microphone captured:", micTrack.label);

      // Step 2: Try system audio (may fail)
      let systemStream: MediaStream | null = null;
      try {
        systemStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true, // Required on some platforms
        });
        const systemTrack = systemStream.getAudioTracks()[0];
        if (systemTrack) {
          console.log("✅ System audio captured:", systemTrack.label);
        }
      } catch (error) {
        console.warn("⚠️ System audio not available:", error);
      }

      // Step 3: Create stereo audio context (L=mic, R=system)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const micSource = audioContext.createMediaStreamSource(micStream);

      // Mic gain
      const micGain = audioContext.createGain();
      micGain.gain.value = 1.0;
      micSource.connect(micGain);

      // Merge to stereo: L=mic, R=system
      const merger = audioContext.createChannelMerger(2);
      micGain.connect(merger, 0, 0); // mic -> left

      if (systemStream) {
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        const systemGain = audioContext.createGain();
        systemGain.gain.value = 1.0;
        systemSource.connect(systemGain);
        systemGain.connect(merger, 0, 1); // system -> right
      } else {
        // Silence on right channel
        const silenceNode = audioContext.createConstantSource();
        silenceNode.offset.value = 0;
        silenceNode.connect(merger, 0, 1);
        silenceNode.start();
      }

      // Step 4: Register AudioWorklet and create processor node
      await audioContext.audioWorklet.addModule(this.getWorkletUrl());

      const workletNode = new AudioWorkletNode(audioContext, "pcm16-stereo-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 0, // No audio output needed — we only extract data
        channelCount: 2,
        channelCountMode: "explicit",
      });

      // Receive PCM16 buffers from the worklet thread
      let chunkCount = 0;
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        window.watchingPillAPI?.sendAudioChunk(event.data);

        chunkCount++;
        if (chunkCount % 50 === 0) {
          console.log(`📊 Sent ${chunkCount} audio chunks (${event.data.byteLength} bytes each)`);
        }
      };

      // Connect: merger → workletNode (no output connection needed)
      merger.connect(workletNode);

      // Save state
      this.captureState = {
        sessionId,
        micStream,
        systemStream,
        audioContext,
        workletNode,
        isCapturing: true,
      };

      console.log("✅ Audio capture started (AudioWorklet)", {
        sessionId,
        hasSystemAudio: !!systemStream,
        sampleRate: audioContext.sampleRate,
        channels: 2,
      });

      return {
        success: true,
        hasSystemAudio: !!systemStream,
      };
    } catch (error) {
      console.error("❌ Failed to start audio capture:", error);
      await this.stopCapture();
      return {
        success: false,
        hasSystemAudio: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Stop capturing audio
   */
  async stopCapture(): Promise<void> {
    if (!this.captureState) {
      return;
    }

    console.log("🛑 Stopping audio capture");

    try {
      this.captureState.micStream?.getTracks().forEach((track) => track.stop());
      this.captureState.systemStream?.getTracks().forEach((track) => track.stop());

      if (this.captureState.workletNode) {
        this.captureState.workletNode.port.close();
        this.captureState.workletNode.disconnect();
      }

      if (this.captureState.audioContext) {
        await this.captureState.audioContext.close();
      }

      console.log("✅ Audio capture stopped");
    } catch (error) {
      console.error("❌ Error stopping audio capture:", error);
    } finally {
      this.captureState = null;
    }
  }

  isCapturing(): boolean {
    return this.captureState?.isCapturing ?? false;
  }
}

export const audioCaptureService = new AudioCaptureService();
