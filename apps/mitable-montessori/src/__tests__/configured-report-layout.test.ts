import { expect, it } from "vitest";
import { toddlerReportFixture, CHILD, ROOM } from "./helpers/toddler-report-fixture";
import { dbToRows, rowsToDb, TemplateSectionsSchema } from "@/lib/report-templates/sections";
import {
  buildConfiguredReportSections,
  findClassroomReportTemplate,
} from "@/lib/reports/configured-template";
import { refreshConfiguredTermHistory } from "@/lib/reports/term-history";
import { termSkillsForDisplay } from "@/lib/reports/term-skills";
const scope = {
  schoolId: "school",
  classroomId: ROOM,
  studentId: CHILD,
  termId: null,
  periodStart: "2026-09-01",
  periodEnd: "2026-12-31",
  reportingPeriod: "end_of_term" as const,
  elementary: false,
  kind: "Major",
};

it("round trips report blocks without losing their field type, options, or order", () => {
  const rows = TemplateSectionsSchema.parse([
    { section: "Skills", fieldType: "term_skills" },
    { section: "Learning", fieldType: "progress_summary" },
    { section: "Results", fieldType: "exam_grades" },
    { section: "Our note", fieldType: "manual_text" },
    { section: "Review", fieldType: "director_comment" },
    { section: "Incidents", fieldType: "incident_highlights" },
    { section: "Daily", fieldType: "daily_highlights" },
    { section: "SEND", fieldType: "sen_highlights" },
    { section: "Projects", fieldType: "project_highlights" },
    { section: "Choices", fieldType: "checklist", options: ["Yes", "No"] },
  ]);
  const db = rowsToDb(rows);
  expect(dbToRows(db.sections, db.section_guidance, db.section_meta)).toEqual(rows);
});
it("expands progress in the configured position, includes unrated skills for younger children and leaves out elementary grades", async () => {
  const f = toddlerReportFixture();
  const template = {
    id: "template",
    ...rowsToDb(
      TemplateSectionsSchema.parse([
        {
          section: "School note",
          fieldType: "hardcoded",
          description: "Welcome to the term report.",
        },
        { section: "Skills", fieldType: "term_skills" },
        { section: "Learning", fieldType: "progress_summary" },
        { section: "Results", fieldType: "exam_grades" },
        { section: "Comments", fieldType: "manual_text" },
      ])
    ),
  };
  const built = await buildConfiguredReportSections(f.db, template, scope);
  expect(built.sections.map((section) => section.heading)).toEqual([
    "School note",
    "Skills",
    "Practical Life",
    "Practical Life — Comments",
    "Comments",
  ]);
  expect(built.sections[0].paragraphs[0].html).toBe("Welcome to the term report.");
  expect(
    termSkillsForDisplay(built.sections[1].paragraphs[0].html)[0].rows.every(
      (row) => row.value === null
    )
  ).toBe(true);
});
it("prefers the classroom-family default over a school-wide fallback and never crosses schools", async () => {
  const f = toddlerReportFixture();
  f.tables.report_templates = [
    { id: "fallback", school_id: "school", kind: "Major", is_active: true, default_for: "all" },
    {
      id: "elementary",
      school_id: "school",
      kind: "Major",
      is_active: true,
      default_for: "elementary",
    },
    {
      id: "private",
      school_id: "other",
      kind: "Major",
      is_active: true,
      default_for: "toddler_house",
    },
  ];
  expect((await findClassroomReportTemplate(f.db, "school", "Major", "Lower Elementary"))?.id).toBe(
    "elementary"
  );
  expect((await findClassroomReportTemplate(f.db, "school", "Major", "Toddler"))?.id).toBe(
    "fallback"
  );
});
it("refreshes only the configured highlights without moving the block or losing teacher additions", async () => {
  const f = toddlerReportFixture();
  f.tables.reports = [
    {
      id: "source",
      student_id: CHILD,
      students: { school_id: "school" },
      status: "sent",
      report_type: "sen",
      report_date: "2026-10-20",
      body: "Communication improved.",
    },
  ];
  const sections = [
    { id: "before", heading: "Before", paragraphs: [] },
    {
      id: "sen",
      heading: "Support",
      paragraphs: [
        { id: "value", html: "" },
        { id: "extra", html: "Teacher note." },
      ],
    },
    { id: "after", heading: "After", paragraphs: [] },
  ];
  const built = await refreshConfiguredTermHistory(f.db, scope, sections, {
    Support: { type: "term_history", reportType: "sen" },
  });
  expect(built.map((section) => section.heading)).toEqual(["Before", "Support", "After"]);
  expect(built[1].paragraphs[0].html).toContain("Communication improved.");
  expect(built[1].paragraphs[1].html).toBe("Teacher note.");
});
