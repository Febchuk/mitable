// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAudioRecorder } from "@/components/montessori/new-report/use-audio-recorder";

class MockMediaRecorder {
  static isTypeSupported = () => true;
  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  private timeslice: number | undefined;

  constructor(_stream: MediaStream, _opts?: { mimeType?: string }) {}

  start(timeslice?: number) {
    this.timeslice = timeslice;
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    const blob = new Blob(["chunk-a", "chunk-b"], { type: this.mimeType });
    this.ondataavailable?.({ data: blob });
    this.onstop?.();
  }
}

describe("useAudioRecorder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts MediaRecorder with a timeslice and assembles blob + url on stop", async () => {
    const startSpy = vi.spyOn(MockMediaRecorder.prototype, "start");
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test-memo"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal(
      "navigator",
      Object.assign(navigator, {
        mediaDevices: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [{ stop: vi.fn() }],
          })),
        },
      })
    );

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });
    expect(startSpy).toHaveBeenCalledWith(1000);

    await act(async () => {
      result.current.stop();
    });

    expect(result.current.state).toBe("recorded");
    expect(result.current.memo?.blob).toBeInstanceOf(Blob);
    expect(result.current.memo?.url).toBe("blob:test-memo");
    expect(result.current.memo?.mimeType).toBe("audio/webm");
  });
});
