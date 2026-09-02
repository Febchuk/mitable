import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentMediaCapture } from "@/components/montessori/child-detail/student-media";
import { mediaKindForMimeType } from "@/lib/media/constants";

describe("student media device uploads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies only the media types accepted by the private upload API", () => {
    expect(mediaKindForMimeType("image/jpeg")).toBe("photo");
    expect(mediaKindForMimeType("video/mp4")).toBe("video");
    expect(mediaKindForMimeType("image/png")).toBeNull();
  });

  it("opens a selected computer photo in the existing review flow", async () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:school-photo"),
      revokeObjectURL: vi.fn(),
    });

    render(
      <StudentMediaCapture
        open
        studentId="student-1"
        studentName="Avery"
        onClose={vi.fn()}
        onShared={vi.fn()}
      />
    );

    const input = screen.getByLabelText("Choose photo or video from device");
    const file = new File(["photo"], "avery.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Review your photo")).toBeTruthy());
    expect(screen.getByRole("button", { name: /choose another/i })).toBeTruthy();
  });
});
// @vitest-environment jsdom
