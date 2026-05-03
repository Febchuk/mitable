// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
