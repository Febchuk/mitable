import { expect, it } from "vitest";
import { toddlerReportFixture, ROOM, CHILD, DAY } from "@/__tests__/helpers/toddler-report-fixture";
import { buildToddlerDailyReportSections, toddlerReportDayWindow } from "./toddler-daily-report";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";

const args = { schoolId: "school", classroomId: ROOM, studentId: CHILD, reportDate: DAY };
it("combines care, marks, notes and an overview in saved parent report blocks", async () => {
  const fixture = toddlerReportFixture();
  const built = await buildToddlerDailyReportSections(fixture.db, args);
  expect(built.toddlerDailyLogId).toBe("log");
  expect(built.sections.map((s) => s.heading)).toEqual([
    "Daily overview",
    "Daily log",
    "Practical Life",
  ]);
  const blocks = JSON.stringify(buildReportPdfBlocks(built.sections, built.sectionMeta));
  for (const text of [
    "Cheerful",
    "Slept briefly",
    "Painting",
    "Stringing",
    "Practicing",
    "Threaded three beads independently.",
    "Shared the paintbrush.",
  ])
    expect(blocks).toContain(text);
});
it("includes marks made just after midnight in the school's day, not the device's day", async () => {
  const fixture = toddlerReportFixture();
  fixture.tables.student_progress_history[0].changed_at = "2026-10-19T23:05:00.000Z";
  expect(toddlerReportDayWindow(DAY)).toEqual({
    start: "2026-10-19T23:00:00.000Z",
    end: "2026-10-20T22:59:59.999Z",
  });
  expect(
    JSON.stringify((await buildToddlerDailyReportSections(fixture.db, args)).sections)
  ).toContain("Stringing");
});
it.each([
  "toddler_daily_logs",
  "attendance_records",
  "student_progress_history",
  "curriculum_subjects",
])("refuses an incomplete report when reading %s fails", async (table) => {
  const fixture = toddlerReportFixture();
  fixture.failures.set(table, "Read failed");
  await expect(buildToddlerDailyReportSections(fixture.db, args)).rejects.toThrow("Read failed");
});
it("supports either recorded source and refuses an empty day", async () => {
  const fixture = toddlerReportFixture();
  fixture.tables.student_progress_history = [];
  expect((await buildToddlerDailyReportSections(fixture.db, args)).toddlerDailyLogId).toBe("log");
  fixture.tables.toddler_daily_logs = [];
  await expect(buildToddlerDailyReportSections(fixture.db, args)).rejects.toThrow(
    "Save a Daily Log or mark progress"
  );
});
