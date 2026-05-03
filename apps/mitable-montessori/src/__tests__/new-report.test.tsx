// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewReportSheet } from "@/components/montessori/new-report/new-report-sheet";
import type { PickerChild } from "@/components/montessori/new-report/child-picker";
import type {
  NewReportPayload,
  ReportTemplate,
} from "@/components/montessori/new-report/mock-data";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("notFound");
  },
}));

void React;

afterEach(() => cleanup());

const ROSTER: PickerChild[] = [
  { id: "ada", name: "Ada Okafor", age: "4y 7m", tone: "clay" },
  { id: "bea", name: "Bea Chen", age: "3y 11m", tone: "sage" },
  { id: "dgo", name: "Diego Ramos", age: "5y 2m", tone: "butter" },
];

const TEMPLATES: ReportTemplate[] = [
  {
    id: "tpl-sunflower-daily",
    name: "Sunflower daily",
    description: "Morning · Language · Math · Afternoon · Social",
    kind: "Daily",
    sections: ["Morning", "Language", "Math", "Afternoon", "Social"],
    iconTone: "clay",
  },
];

const CAPTURED: Record<string, { voice: number; photos: number }> = {
  ada: { voice: 4, photos: 2 },
  dgo: { voice: 2, photos: 1 },
};

const baseProps = {
  roster: ROSTER,
  capturedToday: CAPTURED,
  templates: TEMPLATES,
};

describe("NewReportSheet", () => {
  it("renders with a disabled CTA until child + type are picked", () => {
    render(<NewReportSheet open={true} onClose={() => {}} onSubmit={() => {}} {...baseProps} />);
    expect(screen.getByRole("dialog", { name: /start a report/i })).toBeTruthy();
    const cta = screen.getByRole("button", { name: /start drafting/i }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("filters the picker by typed query", () => {
    render(<NewReportSheet open={true} onClose={() => {}} onSubmit={() => {}} {...baseProps} />);
    const search = screen.getByLabelText("Search children") as HTMLInputElement;
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Diego" } });
    expect(screen.getByText("Diego Ramos")).toBeTruthy();
    expect(screen.queryByText("Bea Chen")).toBeNull();
  });

  it("submits payload with child, kind, optional template", () => {
    const onSubmit = vi.fn<(payload: NewReportPayload) => void>();
    render(<NewReportSheet open={true} onClose={() => {}} onSubmit={onSubmit} {...baseProps} />);

    const search = screen.getByLabelText("Search children") as HTMLInputElement;
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: /Ada Okafor/ }));

    fireEvent.click(screen.getByRole("button", { name: /^Daily/ }));

    fireEvent.click(screen.getByRole("button", { name: /Pick a template/i }));
    fireEvent.click(screen.getByRole("button", { name: /Sunflower daily/i }));

    fireEvent.click(screen.getByRole("button", { name: /start drafting/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.childId).toBe("ada");
    expect(payload.kind).toBe("Daily");
    expect(payload.templateId).toBe(TEMPLATES[0].id);
    expect(payload.audio).toBeNull();
    expect(payload.notes).toEqual([]);
  });

  it("does not render when open is false", () => {
    render(<NewReportSheet open={false} onClose={() => {}} onSubmit={() => {}} {...baseProps} />);
    expect(screen.queryByRole("dialog", { name: /start a report/i })).toBeNull();
  });
});
