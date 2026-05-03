// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewReportSheet } from "@/components/montessori/new-report/new-report-sheet";
import { TEMPLATES, type NewReportPayload } from "@/components/montessori/new-report/mock-data";

// next/navigation router shim — useRouter is referenced by anything using
// app-router primitives; the sheet itself doesn't, but downstream imports
// might pull it in.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("notFound");
  },
}));

void React;

afterEach(() => cleanup());

describe("NewReportSheet", () => {
  it("renders with a disabled CTA until child + type are picked", () => {
    render(<NewReportSheet open={true} onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole("dialog", { name: /start a report/i })).toBeTruthy();
    const cta = screen.getByRole("button", { name: /start drafting/i }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("filters the picker by typed query", () => {
    render(<NewReportSheet open={true} onClose={() => {}} onSubmit={() => {}} />);
    const search = screen.getByLabelText("Search children") as HTMLInputElement;
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Diego" } });
    expect(screen.getByText("Diego Ramos")).toBeTruthy();
    expect(screen.queryByText("Bea Chen")).toBeNull();
  });

  it("submits payload with child, kind, optional template", () => {
    const onSubmit = vi.fn<(payload: NewReportPayload) => void>();
    render(<NewReportSheet open={true} onClose={() => {}} onSubmit={onSubmit} />);

    // Pick Ada via the popover
    const search = screen.getByLabelText("Search children") as HTMLInputElement;
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: /Ada Okafor/ }));

    // Pick Daily
    fireEvent.click(screen.getByRole("button", { name: /^Daily/ }));

    // Pick a template via the optional card
    fireEvent.click(screen.getByRole("button", { name: /Pick a template/i }));
    fireEvent.click(screen.getByRole("button", { name: /Sunflower daily/i }));

    // Submit
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
    render(<NewReportSheet open={false} onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByRole("dialog", { name: /start a report/i })).toBeNull();
  });
});
