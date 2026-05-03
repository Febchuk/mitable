// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReportDetail } from "@/components/montessori/report-detail";
import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("notFound");
  },
}));

void React;

const ADA_REPORT: ReportDetailRow = {
  id: "r1",
  studentId: "ada",
  studentName: "Ada Okafor",
  classroomId: "c1",
  reportType: "daily",
  reportDate: "2026-05-02",
  periodStart: "2026-05-02",
  periodEnd: "2026-05-02",
  status: "draft",
  title: "A steady Friday for Ada",
  body: null,
  sections: [
    {
      id: "morning",
      heading: "Morning",
      paragraphs: [{ id: "morning-p1", html: "Ada arrived at 8:42." }],
    },
    {
      id: "language",
      heading: "Language",
      paragraphs: [{ id: "language-p1", html: "Worked with sandpaper letters." }],
    },
    {
      id: "afternoon",
      heading: "Afternoon",
      paragraphs: [{ id: "afternoon-p1", html: "Chose the metal insets." }],
    },
    {
      id: "social",
      heading: "Social & emotional",
      paragraphs: [{ id: "social-p1", html: "Shared at snack." }],
    },
  ],
  templateId: null,
  createdByUserId: "u1",
  approvedByUserId: null,
  approvedAt: null,
  sentAt: null,
  createdAt: "2026-05-02T09:00:00Z",
  updatedAt: "2026-05-02T12:00:00Z",
};

const EMPTY_REPORT: ReportDetailRow = {
  ...ADA_REPORT,
  id: "r-empty",
  body: null,
  sections: null,
  // Promote out of "draft" so the auto-draft effect doesn't fire.
  status: "approved",
};

beforeEach(() => {
  // Stub fetch so PATCH/draft calls succeed without a real server.
  globalThis.fetch = vi.fn(
    async () => new Response("{}", { status: 200 })
  ) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReportDetail", () => {
  it("renders the seeded title and section headings", () => {
    render(<ReportDetail report={ADA_REPORT} />);
    const title = screen.getByLabelText("Report title") as HTMLInputElement;
    expect(title.value).toBe(ADA_REPORT.title);
    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Afternoon")).toBeTruthy();
    expect(screen.getByText("Social & emotional")).toBeTruthy();
  });

  it("renders the empty state for a report without a body or sections", () => {
    render(<ReportDetail report={EMPTY_REPORT} />);
    expect(screen.getByRole("heading", { name: "No draft yet" })).toBeTruthy();
  });

  it("flips the saved-meta to 'Unsaved changes' after a paragraph edit", () => {
    render(<ReportDetail report={ADA_REPORT} />);
    expect(screen.queryByText("Unsaved changes")).toBeNull();

    const morningPara = screen.getByRole("textbox", { name: "Morning paragraph" });
    act(() => {
      morningPara.innerHTML = "Edited morning paragraph for the test.";
      fireEvent.blur(morningPara);
    });

    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("flips the saved-meta when the title is edited", () => {
    render(<ReportDetail report={ADA_REPORT} />);
    const title = screen.getByLabelText("Report title") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "A different title" } });
    expect(title.value).toBe("A different title");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("creates a new section via the inline prompt", () => {
    render(<ReportDetail report={ADA_REPORT} />);

    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    const input = screen.getByLabelText("New section heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Outdoor" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Outdoor")).toBeTruthy();
    expect(screen.queryByLabelText("New section heading")).toBeNull();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Outdoor paragraph" })).toBeTruthy();
  });

  it("cancels the inline prompt on Escape", () => {
    render(<ReportDetail report={ADA_REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    const input = screen.getByLabelText("New section heading") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByLabelText("New section heading")).toBeNull();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("deletes a section via the inline confirm", () => {
    render(<ReportDetail report={ADA_REPORT} />);
    expect(screen.getByText("Afternoon")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete Afternoon section" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(screen.queryByText("Afternoon")).toBeNull();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });
});
