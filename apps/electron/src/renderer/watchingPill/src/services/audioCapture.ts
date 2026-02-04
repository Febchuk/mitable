/**
 * Audio Capture Service (Renderer Side)
 *
 * Captures microphone + system audio using Web Audio API
 * Sends PCM16 stereo chunks to main process via IPC
 */

interface AudioCaptureState {
  sessionId: string;
  micStream: MediaStream | null;
  systemStream: MediaStream | null;
  audioContext: AudioContext | null;
  processor: ScriptProcessorNode | null;
  isCapturing: boolean;
}

class AudioCaptureService {
  private captureState: AudioCaptureState | null = null;

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

      // Create destination
      const destination = audioContext.createMediaStreamDestination();
      merger.connect(destination);
      const stereoStream = destination.stream;

      // Step 4: Extract PCM16 with ScriptProcessor
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 2, 2);

      const stereoSource = audioContext.createMediaStreamSource(stereoStream);
      stereoSource.connect(processor);
      processor.connect(audioContext.destination);

      let chunkCount = 0;
      processor.onaudioprocess = (event) => {
        const left = event.inputBuffer.getChannelData(0);
        const right = event.inputBuffer.getChannelData(1);

        // Convert to interleaved stereo PCM16
        const pcm16 = new Int16Array(left.length * 2);

        for (let i = 0; i < left.length; i++) {
          const l = Math.max(-1, Math.min(1, left[i]));
          const r = Math.max(-1, Math.min(1, right[i]));

          pcm16[i * 2] = l < 0 ? l * 0x8000 : l * 0x7fff;
          pcm16[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
        }

        // Send to main process via IPC
        window.watchingPillAPI?.sendAudioChunk(pcm16.buffer);

        chunkCount++;
        if (chunkCount % 50 === 0) {
          console.log(`📊 Sent ${chunkCount} audio chunks (${pcm16.buffer.byteLength} bytes each)`);
        }
      };

      // Save state
      this.captureState = {
        sessionId,
        micStream,
        systemStream,
        audioContext,
        processor,
        isCapturing: true,
      };

      console.log("✅ Audio capture started", {
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

      if (this.captureState.processor) {
        this.captureState.processor.disconnect();
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
