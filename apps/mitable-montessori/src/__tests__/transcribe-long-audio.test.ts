import { describe, expect, it, vi } from "vitest";
import {
  mergeTranscriptParts,
  transcribeLongAudio,
  WHISPER_CHUNK_LENGTH_S,
} from "@/lib/capture/transcribe-long-audio";

describe("transcribe-long-audio", () => {
  it("mergeTranscriptParts dedupes overlapping words at chunk boundaries", () => {
    expect(
      mergeTranscriptParts(["Ada worked on the pink tower", "pink tower for twenty minutes today"])
    ).toBe("Ada worked on the pink tower for twenty minutes today");
  });

  it("transcribeLongAudio uses a single pipeline call for short audio", async () => {
    const pipeline = vi.fn(async () => ({ text: "short clip" }));
    const sampleRate = 16_000;
    const audio = new Float32Array(sampleRate * 10);

    const text = await transcribeLongAudio(pipeline, audio, sampleRate);
    expect(text).toBe("short clip");
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.mock.calls[0]![1]).toMatchObject({
      chunk_length_s: WHISPER_CHUNK_LENGTH_S,
    });
  });

  it("transcribeLongAudio walks long audio in multiple pipeline calls", async () => {
    const sampleRate = 16_000;
    const audio = new Float32Array(sampleRate * 60);
    let call = 0;
    const pipeline = vi.fn(async () => {
      call += 1;
      return { text: `chunk-${call}` };
    });

    const text = await transcribeLongAudio(pipeline, audio, sampleRate);
    expect(pipeline.mock.calls.length).toBeGreaterThan(1);
    expect(text).toContain("chunk-1");
    expect(text).toContain("chunk-2");
  });
});
