// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChildDetail } from "@/components/montessori/child-detail";
import { findChild } from "@/components/montessori/data";

// Silence the unused-import warning while still pulling React into scope so
// the classic JSX runtime can resolve `React.createElement` in this file.
void React;

afterEach(() => cleanup());

describe("ChildDetail", () => {
  it("renders the looked-up child name and the three view tabs", () => {
    const ada = findChild("ada")!;
    render(<ChildDetail child={ada} />);

    expect(screen.getByRole("heading", { level: 1, name: ada.name })).toBeTruthy();

    expect(screen.getByRole("tab", { name: "Whole child" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Curriculum" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeTruthy();
  });

  it("defaults to the Whole child tab and switches when another tab is selected", () => {
    const ada = findChild("ada")!;
    render(<ChildDetail child={ada} />);

    const wholeTab = screen.getByRole("tab", { name: "Whole child" });
    expect(wholeTab.getAttribute("aria-selected")).toBe("true");

    const curriculumTab = screen.getByRole("tab", { name: "Curriculum" });
    fireEvent.click(curriculumTab);
    expect(curriculumTab.getAttribute("aria-selected")).toBe("true");
    expect(wholeTab.getAttribute("aria-selected")).toBe("false");
  });
});
