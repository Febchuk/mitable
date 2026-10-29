// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TermSkillsField } from "@/components/montessori/report-detail/term-skills-field";
import { encodeTermSkills, termSkillsForDisplay } from "@/lib/reports/term-skills";
import {
  fieldPayloadToReadableText,
  paragraphHasTeacherContent,
} from "@/lib/reports/template-field-payload";
import { UpdateReportRequestSchema } from "@/lib/schemas/report";

afterEach(cleanup);
it("starts all 29 skills rows blank and saves only the teacher's choice", () => {
  const commit = vi.fn();
  render(<TermSkillsField html={encodeTermSkills({})} onCommit={commit} />);
  expect(screen.getAllByRole("group")).toHaveLength(29);
  expect(screen.queryAllByRole("radio", { checked: true })).toHaveLength(0);
  fireEvent.click(
    within(screen.getByRole("group", { name: "Stays on task" })).getByRole("radio", {
      name: "Adequate",
    })
  );
  const saved = commit.mock.calls[0][0];
  expect(termSkillsForDisplay(saved)[0].rows[0].value).toBe("Adequate");
  expect(paragraphHasTeacherContent(saved)).toBe(true);
  expect(paragraphHasTeacherContent(encodeTermSkills({}))).toBe(false);
  expect(fieldPayloadToReadableText(saved)).toContain("Stays on task: Adequate");
});
it("preserves other ratings and allows clearing a selected row", () => {
  const commit = vi.fn();
  render(
    <TermSkillsField
      html={encodeTermSkills({ "0-0": "Excellent", "2-0": "Mature" })}
      onCommit={commit}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear Stays on task" }));
  const groups = termSkillsForDisplay(commit.mock.calls[0][0]);
  expect(groups[0].rows[0].value).toBeNull();
  expect(groups[2].rows[0].value).toBe("Mature");
});
it("rejects unknown ratings and limits N/A to the matching source rows", () => {
  const groups = termSkillsForDisplay(
    encodeTermSkills({
      "0-0": "Invented",
      "3-0": "Not Applicable",
      "3-2": "Not Applicable",
      bogus: "Yes",
    })
  );
  expect(groups[0].rows[0].value).toBeNull();
  expect(groups[3].rows[0].value).toBeNull();
  expect(groups[3].rows[2].value).toBe("Not Applicable");
  expect(termSkillsForDisplay("malformed")[0].rows[0].value).toBeNull();
});
it("renders the parent's saved skills without editable controls", () => {
  render(<TermSkillsField html={encodeTermSkills({ "0-0": "Excellent" })} />);
  expect(
    within(screen.getByRole("group", { name: "Stays on task" })).getByText("Excellent")
  ).toBeTruthy();
  expect(screen.queryByRole("radio")).toBeNull();
});
it("accepts saving a full curriculum and compiled term history", () => {
  const sections = Array.from({ length: 40 }, (_, index) => ({
    id: `s-${index}`,
    heading: `Area ${index}`,
    paragraphs: [{ id: `p-${index}`, html: "Recorded work." }],
  }));
  expect(
    UpdateReportRequestSchema.safeParse({ body: "Recorded work. ".repeat(1500), sections }).success
  ).toBe(true);
});
