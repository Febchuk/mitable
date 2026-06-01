// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportDetail } from "@/components/montessori/report-detail";
import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("notFound");
  },
}));

vi.mock("@/lib/capture/draft-capture-storage", () => ({
  readStoredDraftCapture: vi.fn(() => null),
  clearStoredDraftCapture: vi.fn(),
}));

void React;

const ADA_REPORT: ReportDetailRow = {
  id: "r1",
  studentId: "ada",
  studentName: "Ada Okafor",
  classroomId: "c1",
  classroomName: "Primary 1",
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
  templateSectionMeta: {},
  templateLogoUrl: null,
  createdByUserId: "u1",
  approvedByUserId: null,
  approvedAt: null,
  sentAt: null,
  aiScore: null,
  aiFlags: null,
  aiReasoning: null,
  aiScoredAt: null,
  createdAt: "2026-05-02T09:00:00Z",
  updatedAt: "2026-05-02T12:00:00Z",
  hasBeenSubmitted: false,
};

const EMPTY_REPORT: ReportDetailRow = {
  ...ADA_REPORT,
  id: "r-empty",
  body: null,
  sections: null,
  // Promote out of "draft" so the auto-draft effect doesn't fire.
  status: "approved",
};

/** Triggers the auto-`useEffect` that POSTs `/draft` (empty body + empty/placeholder sections). */
const EMPTY_DRAFT_FOR_AUTO: ReportDetailRow = {
  ...ADA_REPORT,
  id: "r-auto-draft",
  body: null,
  sections: null,
  status: "draft",
  title: null,
};

/** Simulated API payload after `draft` completes — same id as `EMPTY_DRAFT_FOR_AUTO`. */
const AFTER_DRAFT_REPORT: ReportDetailRow = {
  ...ADA_REPORT,
  id: "r-auto-draft",
  status: "draft",
  title: "A steady Friday for Ada",
  body: null,
  sections: ADA_REPORT.sections,
  updatedAt: "2026-05-02T12:30:00Z",
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
  it("POSTs /draft when Autofill is clicked on a draft report", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
      if (url.includes("/draft") && init?.method === "POST") {
        return new Response(JSON.stringify({ report: AFTER_DRAFT_REPORT }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<ReportDetail report={ADA_REPORT} />);
    fireEvent.click(screen.getByRole("button", { name: /^Autofill$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/reports/r1/draft"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("renders the seeded title and section headings", () => {
    render(<ReportDetail report={ADA_REPORT} />);
    const title = screen.getByLabelText("Report title") as HTMLInputElement;
    expect(title.value).toBe(ADA_REPORT.title);
    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Afternoon")).toBeTruthy();
    expect(screen.getByText("Social & emotional")).toBeTruthy();
  });

  it("renders the editor (no sections, with Add section) for an empty report", () => {
    render(<ReportDetail report={EMPTY_REPORT} />);
    // No section headings present
    expect(screen.queryByText("Morning")).toBeNull();
    // Title input is editable
    expect(screen.getByLabelText("Report title")).toBeTruthy();
    // Add section button is available so the user can compose from scratch
    expect(screen.getByRole("button", { name: "Add section" })).toBeTruthy();
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

  /**
   * Guards the dev-only Strict Mode issue: a `cancelled` flag tied to effect cleanup could drop a
   * late `/draft` JSON response (spinner stuck). React Strict Mode double-invokes effects only in
   * development — production builds do not replay this. This test only documents that a delayed
   * success response still reaches the UI when Strict Mode is on.
   */
  it("still applies a delayed auto-draft response when wrapped in StrictMode", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
      if (url.includes("/reports/r-auto-draft/draft") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(JSON.stringify({ report: AFTER_DRAFT_REPORT }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
          }, 40);
        });
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;

    render(
      <React.StrictMode>
        <ReportDetail report={EMPTY_DRAFT_FOR_AUTO} />
      </React.StrictMode>
    );

    expect(screen.getByText("Drafting with assistant…")).toBeTruthy();

    await waitFor(
      () => {
        expect(screen.getByText("Morning")).toBeTruthy();
      },
      { timeout: 4000 }
    );

    expect(screen.queryByText("Drafting with assistant…")).toBeNull();
  });
});
