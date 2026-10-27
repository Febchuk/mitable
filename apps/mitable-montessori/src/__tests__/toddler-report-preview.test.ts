import { beforeEach, expect, it, vi } from "vitest";
import { toddlerReportFixture, ROOM, CHILD, DAY } from "./helpers/toddler-report-fixture";

const mocks = vi.hoisted(() => ({ db: null as unknown, schoolId: "school" }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => mocks.db }));
vi.mock("@/lib/app/active-classroom", async (original) => ({
  ...(await original<object>()),
  getCurrentUserContext: async () => ({
    userId: "teacher",
    schoolId: mocks.schoolId,
    role: "teacher",
  }),
}));
import { getReport } from "@/lib/queries/reports";

let fixture: ReturnType<typeof toddlerReportFixture>;
beforeEach(() => {
  fixture = toddlerReportFixture();
  mocks.db = fixture.db;
  mocks.schoolId = "school";
  fixture.tables.reports.push({
    id: "report",
    student_id: CHILD,
    classroom_id: ROOM,
    report_type: "daily",
    report_date: DAY,
    period_end: DAY,
    status: "draft",
    template_id: null,
    created_by_user_id: "teacher",
    students: fixture.tables.students[0],
    classrooms: { id: ROOM, name: "Toddler's House" },
    sections: [
      { id: "stale", heading: "Daily log", paragraphs: [{ id: "old", html: "Old care note" }] },
      {
        id: "extra",
        heading: "A note for home",
        paragraphs: [{ id: "note", html: "Please bring spare clothes." }],
      },
    ],
    section_meta: { "Daily log": { type: "hardcoded" } },
    toddler_daily_log_id: null,
  });
});

it("pulls same-day progress and care into a saved draft preview while preserving teacher additions", async () => {
  fixture.tables.student_progress_history[0].comment = "A new observation after draft creation.";
  const persisted = JSON.stringify(fixture.tables.reports[0]);
  const report = await getReport("report");
  expect(report?.toddlerDailyLogId).toBe("log");
  expect(report?.templateSectionMeta).toMatchObject({
    "Practical Life": { type: "progress_topic" },
  });
  const preview = JSON.stringify(report?.sections);
  for (const text of [
    "Stringing",
    "A new observation after draft creation.",
    "Cheerful",
    "Please bring spare clothes.",
  ])
    expect(preview).toContain(text);
  expect(preview).not.toContain("Old care note");
  expect(JSON.stringify(fixture.tables.reports[0])).toBe(persisted);
});

it("keeps sent report content frozen when later progress or care notes change", async () => {
  fixture.tables.reports[0].status = "sent";
  fixture.tables.toddler_daily_logs[0].teacher_comments = "Changed after sending";
  const report = await getReport("report");
  expect(JSON.stringify(report?.sections)).toContain("Old care note");
  expect(JSON.stringify(report?.sections)).not.toContain("Changed after sending");
});

it("leaves another classroom's daily preview unchanged", async () => {
  fixture.tables.classrooms[0].code = "Primary";
  const report = await getReport("report");
  expect(JSON.stringify(report?.sections)).toContain("Old care note");
  expect(JSON.stringify(report?.sections)).not.toContain("Stringing");
});

it("checks report access before reading the child's progress", async () => {
  mocks.schoolId = "another-school";
  const reads = vi.spyOn(fixture.db, "from");
  expect(await getReport("report")).toBeNull();
  expect(reads.mock.calls.map(([table]) => table)).toEqual(["reports"]);
});

it("fails visibly when a source cannot be read instead of showing an incomplete preview", async () => {
  fixture.failures.set("student_progress_history", "Progress unavailable");
  await expect(getReport("report")).rejects.toThrow("Progress unavailable");
});
