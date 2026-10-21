// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SenReportsFeature } from "./index";

const mocks = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/montessori/primitives", () => ({ ToastBus: { push: mocks.toast } }));
vi.mock("@/components/montessori/store", () => ({
  useMontessori: () => ({ selectedClassroomId: "class", classrooms: [], classroomBusy: false }),
}));

type Saved = { id: string; remarks: string; scores: Array<{ metricId: string; score: number }> };
let saved: Saved | null;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  saved = null;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url.endsWith("/report"))
      return Response.json({ reportId: "parent-report" });
    if (init?.method === "POST") {
      const input = JSON.parse(init.body as string);
      saved = { id: "assessment", remarks: input.remarks, scores: input.scores };
      return Response.json({ ok: true, id: saved.id });
    }
    return Response.json({
      classroom: { id: "class", name: "SEN class" },
      date: "2026-10-20",
      group: { id: "team", name: "Red" },
      groups: [{ id: "team", name: "Red" }],
      metrics: [
        {
          id: "active",
          label: "Communication",
          section: "skill",
          score_labels: ["None", "Minimum", "Satisfactory", "Good", "Excellent"],
        },
      ],
      students: [{ id: "child", name: "Ada", report: saved }],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("can save, reopen the assessment, and prepare its parent report", async () => {
  render(<SenReportsFeature />);
  fireEvent.click(await screen.findByRole("button", { name: "Communication: 5, Excellent" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Remarks" }), {
    target: { value: "A steady day" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save SEN report" }));
  await screen.findByText("Saved");
  cleanup();
  render(<SenReportsFeature />);
  await screen.findByText("Saved");
  await waitFor(() =>
    expect((screen.getByRole("textbox", { name: "Remarks" }) as HTMLTextAreaElement).value).toBe(
      "A steady day"
    )
  );
  const send = screen.getByRole("button", { name: "Save & prepare to send" }) as HTMLButtonElement;
  expect(send.disabled).toBe(false);
  fireEvent.click(send);
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/app/reports/parent-report"));
  expect(saved).toMatchObject({
    remarks: "A steady day",
    scores: [{ metricId: "active", score: 5 }],
  });
});

it("can prepare a saved assessment after an old scored item is archived", async () => {
  saved = {
    id: "assessment",
    remarks: "Saved yesterday",
    scores: [
      { metricId: "active", score: 5 },
      { metricId: "archived", score: 3 },
    ],
  };
  render(<SenReportsFeature />);
  await screen.findByText("Saved");
  await waitFor(() =>
    expect((screen.getByRole("textbox", { name: "Remarks" }) as HTMLTextAreaElement).value).toBe(
      "Saved yesterday"
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Save & prepare to send" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/app/reports/parent-report"));
  expect(saved!.scores).toEqual([{ metricId: "active", score: 5 }]);
});

it("explains an incomplete assessment without trying to send it", async () => {
  render(<SenReportsFeature />);
  fireEvent.click(await screen.findByRole("button", { name: "Save & prepare to send" }));
  expect(mocks.toast).toHaveBeenCalledWith({ message: "Choose a score for every item first" });
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});
