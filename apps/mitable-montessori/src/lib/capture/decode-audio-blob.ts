/**
 * Decode a recorded audio Blob (e.g. from MediaRecorder) to mono Float32 PCM
 * at 16 kHz for Whisper in the capture worker.
 */

const TARGET_SAMPLE_RATE = 16_000;

export async function decodeBlobToMonoFloat32(
  blob: Blob
): Promise<{ audio: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    (typeof window !== "undefined" &&
      ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) ||
    null;
  if (!AudioContextCtor) {
    throw new Error("AudioContext unavailable.");
  }
  const ctx = new AudioContextCtor();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < numChannels; c++) {
      const ch = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += ch[i] / numChannels;
    }
    const srcRate = audioBuffer.sampleRate;
    if (srcRate === TARGET_SAMPLE_RATE) {
      return { audio: mono, sampleRate: TARGET_SAMPLE_RATE };
    }
    const ratio = srcRate / TARGET_SAMPLE_RATE;
    const outLength = Math.max(1, Math.round(length / ratio));
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const srcIdx = i * ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0 + 1, length - 1);
      const t = srcIdx - i0;
      out[i] = mono[i0] * (1 - t) + mono[i1] * t;
    }
    return { audio: out, sampleRate: TARGET_SAMPLE_RATE };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
