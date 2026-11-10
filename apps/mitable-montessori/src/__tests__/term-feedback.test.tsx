// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { withTermFeedback, TERM_FEEDBACK_FIELDS } from "@/lib/reports/term-feedback";
import { withDirectorComment } from "@/lib/reports/director-comment";
import { buildBuiltinReportTemplate } from "@/lib/reports/default-template";
import { sectionExcludedFromAgent } from "@/lib/report-templates/sections";
import { ReportPane } from "@/components/montessori/report-detail/report-pane";
import { ParentReportView } from "@/components/parents/parent-report-view";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";

afterEach(cleanup);

it("adds both editable feedback fields before the director's review", () => {
  const director = withDirectorComment([], {});
  const built = withTermFeedback(director.sections, director.sectionMeta);
  expect(built.sections.map((section) => section.heading)).toEqual([
    "Teacher's comment",
    "Specials report",
    "Director's comment",
  ]);
  render(
    <ReportPane
      detail={{
        title: "Term report",
        observer: "Teacher",
        classroom: "Elementary",
        dayLabel: "",
        savedMeta: "",
        sources: { voiceNotes: 0, photos: 0, worksheets: 0 },
        visibleTo: [],
        sections: built.sections,
        templateSectionMeta: built.sectionMeta,
      }}
      onChange={vi.fn()}
    />
  );
  for (const field of TERM_FEEDBACK_FIELDS) {
    expect(screen.getByRole("textbox", { name: `${field.heading} paragraph` })).toBeTruthy();
    expect(sectionExcludedFromAgent(built.sectionMeta[field.heading])).toBe(true);
  }
});

it("keeps existing teacher and specials text, recognizes heading variants, and adds no duplicates", () => {
  const existing = [
    {
      id: "teacher",
      heading: "TEACHER’S COMMENT",
      paragraphs: [{ id: "t", html: "A thoughtful term." }],
    },
    {
      id: "specials",
      heading: "Specials report",
      paragraphs: [{ id: "s", html: "Enjoyed music and art." }],
    },
  ];
  const built = withTermFeedback(existing, {});
  expect(built.sections).toEqual(existing);
  expect(withTermFeedback(built.sections, built.sectionMeta)).toEqual(built);
  expect(built.sectionMeta["TEACHER’S COMMENT"]).toEqual({ type: "manual_text" });
});

it("shows both fields in the end-of-term template without adding them to daily or incident templates", () => {
  for (const field of TERM_FEEDBACK_FIELDS) {
    expect(buildBuiltinReportTemplate("Major").sections).toContain(field.heading);
    expect(buildBuiltinReportTemplate("Daily").sections).not.toContain(field.heading);
    expect(buildBuiltinReportTemplate("Incident").sections).not.toContain(field.heading);
  }
});

it("renders saved feedback in the parent report using the same blocks as the PDF", () => {
  const built = withTermFeedback([], {});
  built.sections[0].paragraphs[0].html = "Growing in confidence.";
  built.sections[1].paragraphs[0].html = "Enjoyed music and art.";
  const blocks = buildReportPdfBlocks(built.sections, built.sectionMeta);
  expect(blocks).toEqual([
    {
      kind: "section",
      heading: "Teacher's comment",
      paragraphs: [{ text: "Growing in confidence." }],
    },
    {
      kind: "section",
      heading: "Specials report",
      paragraphs: [{ text: "Enjoyed music and art." }],
    },
  ]);
  render(
    <ParentReportView
      title="Term report"
      studentName="Avery"
      reportType="End-of-term"
      periodLabel="Term I"
      blocks={blocks}
      fallbackBody=""
      media={[]}
      schoolName="The Learning Place"
    />
  );
  expect(screen.getByText("Growing in confidence.")).toBeTruthy();
  expect(screen.getByText("Enjoyed music and art.")).toBeTruthy();
});
