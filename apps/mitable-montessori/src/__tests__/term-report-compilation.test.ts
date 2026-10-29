import { describe, expect, it } from "vitest";
import { toddlerReportFixture, CHILD, ROOM } from "./helpers/toddler-report-fixture";
import { buildTermHistorySections, mergeTermHistory } from "@/lib/reports/term-history";
import { buildDefaultReportSections } from "@/lib/reports/default-template";
import { fieldPayloadToReadableText, encodeChecklist } from "@/lib/reports/template-field-payload";
import { decodeProgressTopic } from "@/lib/reports/progress-topic-payload";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";

const scope = {
  schoolId: "school",
  studentId: CHILD,
  periodStart: "2026-09-01",
  periodEnd: "2026-12-31",
};
const shared = (id: string, type = "daily", extra: Record<string, unknown> = {}) => ({
  id,
  student_id: CHILD,
  students: { school_id: "school" },
  report_type: type,
  status: "sent",
  report_date: "2026-10-20",
  body: "A recorded note.",
  sections: null,
  section_meta: null,
  ...extra,
});
describe("shared term report compilation", () => {
  it("includes all four report types and excludes other terms, children, schools, drafts and major reports", async () => {
    const fixture = toddlerReportFixture();
    fixture.tables.reports = [
      shared("daily"),
      shared("sen", "sen"),
      shared("incident", "incident"),
      shared("project", "project"),
      shared("old", "daily", { report_date: "2026-08-31", body: "Outside term" }),
      shared("future", "daily", { report_date: "2027-01-01", body: "Outside term" }),
      shared("other-child", "daily", { student_id: "other", body: "Private child" }),
      shared("other-school", "daily", { students: { school_id: "other" }, body: "Private school" }),
      shared("draft", "daily", { status: "draft", body: "Unfinished" }),
      shared("major", "major", { body: "Previous summary" }),
    ];
    const built = await buildTermHistorySections(fixture.db, scope);
    expect(built.sections.map((section) => section.heading)).toEqual([
      "Daily reports — term highlights",
      "SEN reports — term highlights",
      "Incident reports — term highlights",
      "Project letters — term highlights",
    ]);
    const text = built.sections
      .map((section) => fieldPayloadToReadableText(section.paragraphs[0].html))
      .join("\n");
    expect(text).toContain("A recorded note.");
    expect(text).not.toMatch(/Outside term|Private|Unfinished|Previous summary/);
    expect(buildReportPdfBlocks(built.sections, built.sectionMeta)).toHaveLength(4);
  });
  it("groups repeated notes, keeps combined daily/SEN fields, and omits duplicate progress and boilerplate", async () => {
    const fixture = toddlerReportFixture();
    const sections = [
      {
        id: "notes",
        heading: "Teacher notes",
        paragraphs: [{ id: "p", html: "Practised turn taking." }],
      },
      { id: "sen", heading: "SEN skills", paragraphs: [{ id: "s", html: "Communication: 4/5" }] },
      {
        id: "choices",
        heading: "Activities",
        paragraphs: [{ id: "c", html: encodeChecklist(["Painting"]) }],
      },
      {
        id: "progress",
        heading: "Curriculum progress",
        paragraphs: [{ id: "g", html: "DUPLICATE GRID" }],
      },
      { id: "fixed", heading: "Contact", paragraphs: [{ id: "f", html: "BOILERPLATE" }] },
    ];
    const section_meta = {
      "Curriculum progress": { type: "progress_topic", topicId: "topic" },
      Contact: { type: "hardcoded" },
    };
    fixture.tables.reports = [
      shared("one", "daily", { sections, section_meta }),
      shared("two", "daily", { report_date: "2026-10-21", sections, section_meta }),
    ];
    const built = await buildTermHistorySections(fixture.db, scope);
    const text = fieldPayloadToReadableText(built.sections[0].paragraphs[0].html);
    expect(text).toContain("2 reports shared");
    expect(text.match(/Practised turn taking\./g)).toHaveLength(1);
    expect(text).toContain("2026-10-20–2026-10-21 (2 reports)");
    expect(text).toContain("Communication: 4/5");
    expect(text).toContain("Painting");
    expect(text).not.toMatch(/DUPLICATE GRID|BOILERPLATE|__MITABLE_FIELD/);
  });
  it("loads every page rather than cutting off a busy term", async () => {
    const fixture = toddlerReportFixture();
    fixture.tables.reports = Array.from({ length: 1001 }, (_, index) => shared(String(index)));
    const built = await buildTermHistorySections(fixture.db, scope);
    expect(fieldPayloadToReadableText(built.sections[0].paragraphs[0].html)).toContain(
      "1001 reports shared"
    );
  });
  it("keeps source text escaped and preserves teacher-added paragraphs on refresh", async () => {
    const fixture = toddlerReportFixture();
    fixture.tables.reports = [
      shared("one", "incident", { body: "A literal &lt;script&gt;example&lt;/script&gt;." }),
    ];
    const built = await buildTermHistorySections(fixture.db, scope);
    expect(built.sections[0].paragraphs[0].html).not.toContain("<script>");
    built.sections[0].paragraphs.push({ id: "teacher", html: "Teacher follow-up." });
    const merged = mergeTermHistory(
      { sections: built.sections, sectionMeta: built.sectionMeta },
      await buildTermHistorySections(fixture.db, scope)
    );
    expect(merged.sections[0].paragraphs[1]).toEqual({ id: "teacher", html: "Teacher follow-up." });
  });
  it("surfaces failed source reads instead of silently creating an incomplete term report", async () => {
    const fixture = toddlerReportFixture();
    fixture.failures.set("reports", "History unavailable");
    await expect(buildTermHistorySections(fixture.db, scope)).rejects.toThrow(
      "History unavailable"
    );
  });
});

describe("term progress milestones", () => {
  const history = (status: string, day: string) => ({
    id: day,
    student_id: CHILD,
    curriculum_subtopic_id: "beads",
    new_status: status,
    changed_at: `${day}T09:00:00Z`,
    comment: `Note for ${day}`,
  });
  it("shows the furthest level for a term while daily reports keep the latest level", async () => {
    const fixture = toddlerReportFixture();
    fixture.tables.student_progress_history = [
      history("introduced", "2026-10-01"),
      history("mastered", "2026-10-02"),
      history("practicing", "2026-10-03"),
    ];
    const build = (reportingPeriod: "daily" | "end_of_term") =>
      buildDefaultReportSections(fixture.db, {
        classroomId: ROOM,
        studentId: CHILD,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-03",
        reportingPeriod,
      });
    expect(
      decodeProgressTopic((await build("end_of_term")).sections[0].paragraphs[0].html)?.[0]
    ).toMatchObject({ status: "mastered", comment: "Note for 2026-10-03" });
    expect(
      decodeProgressTopic((await build("daily")).sections[0].paragraphs[0].html)?.[0].status
    ).toBe("practicing");
  });
  it("honors a clear or N/A mark and never borrows a level from outside the selected term", async () => {
    const fixture = toddlerReportFixture();
    fixture.tables.student_progress_history = [
      history("mastered", "2026-09-30"),
      history("introduced", "2026-10-01"),
      history("mastered", "2026-10-02"),
      history("not_applicable", "2026-10-03"),
    ];
    const build = () =>
      buildDefaultReportSections(fixture.db, {
        classroomId: ROOM,
        studentId: CHILD,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-05",
        reportingPeriod: "end_of_term",
      });
    expect(decodeProgressTopic((await build()).sections[0].paragraphs[0].html)).toEqual([]);
    fixture.tables.student_progress_history.push(history("introduced", "2026-10-04"));
    expect(decodeProgressTopic((await build()).sections[0].paragraphs[0].html)?.[0].status).toBe(
      "introduced"
    );
  });
});
