"use client";

/**
 * Push-to-talk audio capture. Records to a Float32Array at 16kHz mono — the
 * sample rate Whisper expects. The browser's AudioContext does the resampling
 * for us; we just collect chunks until stopped.
 */

const TARGET_SAMPLE_RATE = 16_000;

export interface RecordingHandle {
  stop(): Promise<{ audio: Float32Array; sampleRate: number; durationMs: number }>;
  cancel(): void;
}

export async function startRecording(): Promise<RecordingHandle> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access not available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });

  const AudioContextCtor =
    (typeof window !== "undefined" &&
      ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) ||
    null;
  if (!AudioContextCtor) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("AudioContext unavailable.");
  }
  const audioCtx = new AudioContextCtor({ sampleRate: TARGET_SAMPLE_RATE });
  const source = audioCtx.createMediaStreamSource(stream);

  // ScriptProcessorNode is deprecated but universally supported. AudioWorklet
  // would require shipping a separate worklet module; not worth it for v1.
  const bufferSize = 4096;
  const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (ev) => {
    const data = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
  };
  source.connect(processor);
  processor.connect(audioCtx.destination);

  const startedAt = performance.now();
  let stopped = false;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    try {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void audioCtx.close();
    } catch {
      // Already-disconnected / closed audio nodes throw; cleanup is best-effort.
    }
  };

  return {
    async stop() {
      if (stopped) throw new Error("Already stopped.");
      const durationMs = performance.now() - startedAt;
      cleanup();
      // Concatenate.
      let total = 0;
      for (const c of chunks) total += c.length;
      const out = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return { audio: out, sampleRate: audioCtx.sampleRate, durationMs };
    },
    cancel() {
      cleanup();
    },
  };
}
