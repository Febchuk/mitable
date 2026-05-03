// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReportDetail } from "@/components/montessori/report-detail";
import { findChild, findReport } from "@/components/montessori/data";

void React;

afterEach(() => cleanup());

describe("ReportDetail", () => {
  it("renders the seeded title, byline, and section headings for r1 (Ada)", () => {
    const report = findReport("r1");
    expect(report).toBeTruthy();
    expect(report?.detail).toBeTruthy();
    const child = findChild(report!.childId);

    render(<ReportDetail report={report!} child={child} />);

    // Title is in an input
    const title = screen.getByLabelText("Report title") as HTMLInputElement;
    expect(title.value).toBe(report!.detail!.title);

    // Section headings render
    expect(screen.getByText("Morning")).toBeTruthy();
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Afternoon")).toBeTruthy();
    expect(screen.getByText("Social & emotional")).toBeTruthy();
  });

  it("renders the empty state for a report without a detail body", () => {
    // r3 (Mira) has no `detail` seeded.
    const report = findReport("r3");
    expect(report).toBeTruthy();
    expect(report?.detail).toBeUndefined();

    render(<ReportDetail report={report!} child={findChild(report!.childId)} />);
    expect(screen.getByRole("heading", { name: "No draft yet" })).toBeTruthy();
  });

  it("flips the saved-meta to 'Unsaved changes' after a paragraph edit", () => {
    const report = findReport("r1")!;
    render(<ReportDetail report={report} child={findChild(report.childId)} />);

    // Baseline: top-bar shows the seeded savedMeta, no dirty class.
    expect(screen.getByText(report.detail!.savedMeta)).toBeTruthy();
    expect(screen.queryByText("Unsaved changes")).toBeNull();

    // The Morning paragraph is the contenteditable for the Morning heading.
    const morningPara = screen.getByRole("textbox", { name: "Morning paragraph" });
    expect(morningPara).toBeTruthy();

    // Mutate innerHTML directly (jsdom doesn't simulate caret typing) then
    // blur — EditableParagraph reads e.currentTarget.innerHTML on blur and
    // calls onCommit, which lifts state and flips isDirty.
    act(() => {
      morningPara.innerHTML = "Edited morning paragraph for the test.";
      fireEvent.blur(morningPara);
    });

    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(screen.queryByText(report.detail!.savedMeta)).toBeNull();
  });

  it("flips the saved-meta when the title is edited", () => {
    const report = findReport("r1")!;
    render(<ReportDetail report={report} child={findChild(report.childId)} />);

    const title = screen.getByLabelText("Report title") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "A different title" } });

    expect(title.value).toBe("A different title");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("creates a new section via the inline prompt", () => {
    const report = findReport("r1")!;
    render(<ReportDetail report={report} child={findChild(report.childId)} />);

    // Open the prompt
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    const input = screen.getByLabelText("New section heading") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Outdoor" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Heading appears, the prompt is gone, the report is dirty.
    expect(screen.getByText("Outdoor")).toBeTruthy();
    expect(screen.queryByLabelText("New section heading")).toBeNull();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    // The new section has one focusable empty paragraph.
    expect(screen.getByRole("textbox", { name: "Outdoor paragraph" })).toBeTruthy();
  });

  it("cancels the inline prompt on Escape", () => {
    const report = findReport("r1")!;
    render(<ReportDetail report={report} child={findChild(report.childId)} />);

    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    const input = screen.getByLabelText("New section heading") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByLabelText("New section heading")).toBeNull();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("deletes a section via the inline confirm", () => {
    const report = findReport("r1")!;
    render(<ReportDetail report={report} child={findChild(report.childId)} />);

    expect(screen.getByText("Afternoon")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete Afternoon section" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(screen.queryByText("Afternoon")).toBeNull();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });
});
