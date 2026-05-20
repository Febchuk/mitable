// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ChatPane } from "@/components/montessori/report-detail/chat-pane";
import { WhisperAsrEngine } from "@/lib/capture/asr-engine";

void React;

const SECTIONS = [
  {
    id: "morning",
    heading: "Morning",
    paragraphs: [{ id: "morning-p1", html: "Ada arrived at 8:42." }],
  },
];

vi.mock("@/components/montessori/new-report/use-audio-recorder", () => ({
  useAudioRecorder: () => ({
    state: "recorded",
    memo: {
      url: "blob:memo-1",
      blob: new Blob(["fake-audio"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      durationSec: 45,
    },
    elapsed: 45,
    start: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock("@/lib/capture/decode-audio-blob", () => ({
  decodeBlobToMonoFloat32: vi.fn(async () => ({
    audio: new Float32Array(16_000 * 45),
    sampleRate: 16_000,
  })),
}));

describe("ChatPane report mic", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("transcribes memo.blob without fetching the object URL", async () => {
    const transcribeSpy = vi
      .spyOn(WhisperAsrEngine.prototype, "transcribe")
      .mockResolvedValue({ text: "late sentence at end", durationMs: 10 });

    const initSpy = vi.spyOn(WhisperAsrEngine.prototype, "init").mockResolvedValue();

    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === "string" && url.endsWith("/chat")) {
        return { ok: true, json: async () => ({ messages: [] }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatPane
        reportId="r1"
        sections={SECTIONS}
        onApplyProposal={vi.fn()}
        onPullObservation={vi.fn()}
        onApplyGhostEdits={vi.fn()}
        flushPendingSave={vi.fn().mockResolvedValue(undefined)}
      />
    );

    await waitFor(() => expect(transcribeSpy).toHaveBeenCalled());
    expect(initSpy).toHaveBeenCalled();
    const blobFetch = fetchMock.mock.calls.some(([url]) => url === "blob:memo-1");
    expect(blobFetch).toBe(false);

    const pcm = transcribeSpy.mock.calls[0]![0] as Float32Array;
    expect(pcm.length).toBe(16_000 * 45);

    await waitFor(() => {
      const textarea = document.querySelector("textarea");
      expect(textarea?.value).toContain("late sentence at end");
    });
  });
});
