// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReportPane } from "@/components/montessori/report-detail/report-pane";
import type { ReportDetail } from "@/components/montessori/data";
import { DIRECTOR_COMMENT_HEADING, withDirectorComment } from "@/lib/reports/director-comment";

afterEach(cleanup);
function detail(value = "Director feedback."): ReportDetail {
  return {
    title: "Term report",
    observer: "Teacher",
    classroom: "Elementary",
    dayLabel: "",
    savedMeta: "",
    sources: { voiceNotes: 0, photos: 0, worksheets: 0 },
    visibleTo: [],
    sections: [
      {
        id: "teacher",
        heading: "Teacher's comment",
        paragraphs: [{ id: "teacher-value", html: "Teacher feedback." }],
      },
      {
        id: "director",
        heading: DIRECTOR_COMMENT_HEADING,
        paragraphs: [{ id: "director-value", html: value }],
      },
    ],
    templateSectionMeta: { [DIRECTOR_COMMENT_HEADING]: { type: "director_comment" } },
  };
}
it("shows the director's saved comment to a teacher without making it editable", () => {
  render(<ReportPane detail={detail()} onChange={vi.fn()} />);
  expect(screen.getByText("Director feedback.")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: DIRECTOR_COMMENT_HEADING })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Teacher's comment paragraph" })).toBeTruthy();
});
it("lets an admin edit the separate field while preserving the teacher's comment", () => {
  const changed = vi.fn();
  render(<ReportPane detail={detail()} onChange={changed} canEditDirectorComment />);
  fireEvent.change(screen.getByRole("textbox", { name: DIRECTOR_COMMENT_HEADING }), {
    target: { value: "A thoughtful <review>." },
  });
  const next = changed.mock.calls[0][0] as ReportDetail;
  expect(next.sections[0].paragraphs[0].html).toBe("Teacher feedback.");
  expect(next.sections[1].paragraphs[0].html).toBe("A thoughtful &lt;review&gt;.");
});
it("starts blank, recognizes the school's heading spelling, and never adds duplicate fields", () => {
  const fresh = withDirectorComment([], {});
  expect(fresh.sections[0].paragraphs[0].html).toBe("");
  expect(withDirectorComment(fresh.sections, fresh.sectionMeta).sections).toHaveLength(1);
  const legacy = withDirectorComment(
    [
      {
        id: "legacy",
        heading: "DIRECTOR’S COMMENT",
        paragraphs: [{ id: "value", html: "Existing review." }],
      },
    ],
    {}
  );
  expect(legacy.sections).toHaveLength(1);
  expect(legacy.sections[0].paragraphs[0].html).toBe("Existing review.");
  expect(legacy.sectionMeta["DIRECTOR’S COMMENT"]).toEqual({ type: "director_comment" });
});
