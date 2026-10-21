import { beforeEach, expect, it, vi } from "vitest";
import { toddlerReportFixture, ROOM, CHILD, GUARDIAN, DAY } from "./helpers/toddler-report-fixture";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";

const mocks = vi.hoisted(() => ({ db: null as unknown, drain: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => mocks.db }));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    ok: true,
    user: { userId: "teacher", schoolId: "school", role: "teacher" },
  }),
}));
vi.mock("@/lib/audit/log", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/queries/reports", () => ({
  getReport: async () => ({ reportType: "daily" }),
  listReports: vi.fn(),
}));
vi.mock("@/lib/admin/email-worker", () => ({
  drainPendingReports: mocks.drain,
  StubEmailSender: class {},
}));
vi.mock("@/lib/app/active-classroom", async (original) => ({
  ...(await original<object>()),
  getActiveClassroomForCurrentUser: async () => ({
    id: ROOM,
    name: "Toddler's House",
    code: "Toddler",
  }),
  listTeacherClassroomsForCurrentUser: async () => [
    { id: ROOM, name: "Toddler's House", code: "Toddler" },
  ],
}));
import { POST as create } from "@/app/api/v1/reports/route";
import { POST as send } from "@/app/api/v1/reports/send/route";
import { GET as summary, POST as batchSend } from "@/app/api/v1/reports/daily-progress/route";

let fixture: ReturnType<typeof toddlerReportFixture>;
beforeEach(() => {
  fixture = toddlerReportFixture();
  mocks.db = fixture.db;
  mocks.drain.mockResolvedValue({ sent: 1, failed: 0, failures: [] });
});
const request = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
const createRequest = () =>
  request({
    childId: CHILD,
    kind: "Daily",
    reportDate: DAY,
    templateId: `__default:daily:${ROOM}`,
  });
const batchRequest = () => request({ reportDate: DAY, utcOffsetMinutes: 240, studentIds: [CHILD] });

it.each(["Reports", "Progress"])("sends both saved sources from the %s page", async (entry) => {
  if (entry === "Reports") {
    const created = await create(createRequest());
    expect(created.status).toBe(200);
    const { reportId } = await created.json();
    expect(JSON.stringify(fixture.tables.reports[0].sections)).toContain("Daily overview");
    expect(JSON.stringify(fixture.tables.reports[0].sections)).toContain("Stringing");
    expect((await send(request({ reportId, guardianRefs: [GUARDIAN] }))).status).toBe(200);
  } else {
    const sent = await batchSend(batchRequest());
    expect(await sent.json()).toMatchObject({ sentCount: 1, failedCount: 0 });
  }
  const report = fixture.tables.reports[0];
  expect(report).toMatchObject({ status: "sent", toddler_daily_log_id: "log" });
  const blocks = JSON.stringify(
    buildReportPdfBlocks(
      report.sections as Parameters<typeof buildReportPdfBlocks>[0],
      report.section_meta as Parameters<typeof buildReportPdfBlocks>[1]
    )
  );
  for (const text of [
    "Daily overview",
    "Daily log",
    "Cheerful",
    "Slept briefly",
    "Practical Life",
    "Stringing",
    "Threaded three beads independently.",
  ])
    expect(blocks).toContain(text);
  expect(fixture.tables.report_recipients).toHaveLength(1);
});

it("refreshes late Daily Log and Progress edits at send time and keeps teacher additions", async () => {
  const { reportId } = await (await create(createRequest())).json();
  const report = fixture.tables.reports[0];
  (report.sections as Array<unknown>).push({
    id: "extra",
    heading: "A note for home",
    paragraphs: [{ id: "extra-p", html: "Please bring spare clothes." }],
  });
  fixture.tables.toddler_daily_logs[0].teacher_comments = "A new observation after review.";
  fixture.tables.student_progress_history[0].new_status = "mastered";
  fixture.tables.student_progress_history[0].comment = "Completed five beads.";
  report.status = "approved";
  expect((await send(request({ reportId, guardianRefs: [GUARDIAN] }))).status).toBe(200);
  const snapshot = JSON.stringify(report.sections);
  for (const text of [
    "A new observation after review.",
    "Completed five beads.",
    "mastered",
    "Please bring spare clothes.",
  ])
    expect(snapshot).toContain(text);
  fixture.tables.toddler_daily_logs[0].teacher_comments = "Changed after sending";
  expect((await send(request({ reportId, guardianRefs: [GUARDIAN] }))).status).toBe(409);
  expect(JSON.stringify(report.sections)).toBe(snapshot);
});

it("includes a Daily Log-only child in Progress-page sending", async () => {
  fixture.tables.student_progress_history = [];
  const response = await summary(
    new Request(`http://localhost/api?date=${DAY}&utcOffsetMinutes=240`)
  );
  expect(await response.json()).toMatchObject({
    readyCount: 1,
    classrooms: [{ children: [{ dailyLogRecorded: true, progressCount: 0, sendable: true }] }],
  });
  expect(await (await batchSend(batchRequest())).json()).toMatchObject({ sentCount: 1 });
});

it("does not send or change status when a source cannot be read", async () => {
  const { reportId } = await (await create(createRequest())).json();
  fixture.failures.set("toddler_daily_logs", "Care log unavailable");
  expect((await send(request({ reportId, guardianRefs: [GUARDIAN] }))).status).toBe(500);
  expect(fixture.tables.reports[0].status).toBe("draft");
  expect(fixture.tables.report_recipients).toHaveLength(0);
});

it("skips a child outside the teacher's roster and skips a duplicate batch send", async () => {
  expect(await (await batchSend(batchRequest())).json()).toMatchObject({ sentCount: 1 });
  expect(await (await batchSend(batchRequest())).json()).toMatchObject({ sentCount: 0 });
  expect(
    await (
      await batchSend(request({ reportDate: DAY, utcOffsetMinutes: 240, studentIds: [GUARDIAN] }))
    ).json()
  ).toMatchObject({ sentCount: 0 });
  expect(fixture.tables.reports).toHaveLength(1);
  expect(fixture.tables.report_recipients).toHaveLength(1);
});

it("reports the same school day from either entry point around midnight", async () => {
  fixture.tables.student_progress_history[0].changed_at = "2026-10-19T23:05:00.000Z";
  const created = await create(createRequest());
  expect(created.status).toBe(200);
  const fromReports = JSON.stringify(fixture.tables.reports[0].sections);
  fixture.tables.reports = [];
  expect(await (await batchSend(batchRequest())).json()).toMatchObject({ sentCount: 1 });
  expect(JSON.stringify(fixture.tables.reports[0].sections)).toBe(fromReports);
});
