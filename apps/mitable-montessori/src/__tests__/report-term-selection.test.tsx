// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewReportModal } from "@/components/montessori/new-report/new-report-modal";
import { NewReportMobile } from "@/components/montessori/new-report/new-report-mobile";
import { ReportTermPicker } from "@/components/montessori/new-report/report-term-picker";
import { defaultSchoolTermId } from "@/lib/queries/school-terms";
import GradesClient from "@/app/app/grades/grades-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/montessori/primitives", () => ({ ToastBus: { push: vi.fn() } }));
const CURRENT = "current";
const FUTURE = "future";
const terms = [
  { id: FUTURE, name: "Term II", startDate: "2027-01-11", endDate: "2027-03-27", sortOrder: 1 },
  { id: CURRENT, name: "Term I", startDate: "2026-09-09", endDate: "2026-12-22", sortOrder: 0 },
];
const props = {
  open: true,
  onClose: vi.fn(),
  roster: [{ id: "child", name: "Ada Test", age: "8y", tone: "clay" as const }],
  capturedToday: {},
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T13:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ terms, defaultTermId: CURRENT }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(["desktop", "mobile"])(
  "lets the %s flow select Term II before creating an end-of-term report",
  async (view) => {
    const onSubmit = vi.fn();
    if (view === "desktop") {
      render(<NewReportModal {...props} onSubmit={onSubmit} />);
      fireEvent.click(screen.getByRole("button", { name: /Ada Test/ }));
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    } else {
      render(<NewReportMobile {...props} onSubmit={onSubmit} />);
      fireEvent.click(screen.getByRole("button", { name: /Ada Test/ }));
    }
    fireEvent.click(screen.getByRole("radio", { name: /^End-of-term/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    const select = await screen.findByRole("combobox", { name: "Report term" });
    expect((select as HTMLSelectElement).value).toBe(CURRENT);
    fireEvent.change(select, { target: { value: FUTURE } });
    fireEvent.click(screen.getByRole("button", { name: "Start end-of-term report" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        childId: "child",
        kind: "Major",
        termId: FUTURE,
        templateId: "__builtin:major",
      })
    );
  }
);
it("does not create a report when school terms failed to load", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "Terms unavailable" }, { status: 500 }))
  );
  const onContinue = vi.fn();
  render(<ReportTermPicker onContinue={onContinue} />);
  await screen.findByRole("alert");
  const start = screen.getByRole("button", {
    name: "Start end-of-term report",
  }) as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  fireEvent.click(start);
  expect(onContinue).not.toHaveBeenCalled();
});
it("defaults the Grades screen to the current term even when a future term is listed first", () => {
  render(
    <GradesClient
      initialData={{
        classrooms: [{ id: "room", name: "Elementary" }],
        terms,
        students: [{ id: "child", classroomId: "room", name: "Ada Test" }],
        grades: [],
        termComments: [],
      }}
    />
  );
  expect((screen.getByRole("combobox", { name: "Term" }) as HTMLSelectElement).value).toBe(CURRENT);
});
it("handles school holidays, all-future terms and an empty term list predictably", () => {
  expect(defaultSchoolTermId(terms, new Date("2026-12-30T12:00:00Z"))).toBe(CURRENT);
  expect(defaultSchoolTermId(terms, new Date("2026-08-01T12:00:00Z"))).toBe(CURRENT);
  expect(defaultSchoolTermId([], new Date("2026-10-29T12:00:00Z"))).toBeNull();
});
