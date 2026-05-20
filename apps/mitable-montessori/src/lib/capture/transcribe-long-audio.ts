/**
 * Long-form ASR helpers for Whisper via transformers.js.
 * The pipeline defaults to ~30s windows; without explicit chunking/merge,
 * longer recordings can return only the opening segment.
 */

export const WHISPER_CHUNK_LENGTH_S = 25;
export const WHISPER_STRIDE_LENGTH_S = 5;

export type AsrPipelineFn = (
  audio: Float32Array,
  opts?: Record<string, unknown>
) => Promise<{ text?: string }>;

/** Merge consecutive chunk transcripts, trimming duplicate word overlap at boundaries. */
export function mergeTranscriptParts(parts: string[]): string {
  const trimmed = parts.map((p) => p.trim()).filter(Boolean);
  if (trimmed.length === 0) return "";
  let merged = trimmed[0]!;
  for (let i = 1; i < trimmed.length; i++) {
    merged = mergeAdjacentTranscripts(merged, trimmed[i]!);
  }
  return merged.trim();
}

function mergeAdjacentTranscripts(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const leftWords = left.split(/\s+/);
  const rightWords = right.split(/\s+/);
  const maxOverlap = Math.min(leftWords.length, rightWords.length, 12);
  for (let n = maxOverlap; n >= 2; n--) {
    const suffix = leftWords.slice(-n).join(" ").toLowerCase();
    const prefix = rightWords.slice(0, n).join(" ").toLowerCase();
    if (suffix === prefix) {
      return `${left} ${rightWords.slice(n).join(" ")}`.replace(/\s+/g, " ").trim();
    }
  }
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}

/**
 * Transcribe arbitrary-length mono PCM. Uses pipeline chunk params when the
 * buffer fits one window; otherwise walks the audio with overlap and merges.
 */
export async function transcribeLongAudio(
  pipeline: AsrPipelineFn,
  audio: Float32Array,
  sampleRate: number
): Promise<string> {
  const chunkSamples = Math.max(1, Math.floor(WHISPER_CHUNK_LENGTH_S * sampleRate));
  const strideSamples = Math.max(1, Math.floor(WHISPER_STRIDE_LENGTH_S * sampleRate));

  if (audio.length <= chunkSamples) {
    const result = await pipeline(audio, {
      sampling_rate: sampleRate,
      chunk_length_s: WHISPER_CHUNK_LENGTH_S,
      stride_length_s: WHISPER_STRIDE_LENGTH_S,
    });
    return (result.text ?? "").trim();
  }

  const parts: string[] = [];
  let offset = 0;
  while (offset < audio.length) {
    const end = Math.min(offset + chunkSamples, audio.length);
    const slice = audio.subarray(offset, end);
    const result = await pipeline(slice, { sampling_rate: sampleRate });
    const text = (result.text ?? "").trim();
    if (text) parts.push(text);
    if (end >= audio.length) break;
    const nextOffset = offset + chunkSamples - strideSamples;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }

  return mergeTranscriptParts(parts);
}

export function pcmDurationSec(audio: Float32Array, sampleRate: number): number {
  if (sampleRate <= 0) return 0;
  return audio.length / sampleRate;
}
