import { beforeEach, expect, it, vi } from "vitest";
import { toddlerReportFixture, ROOM, CHILD, GUARDIAN, DAY } from "./helpers/toddler-report-fixture";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";
const mocks = vi.hoisted(() => ({
  db: null as unknown,
  allowed: true,
  classroomCode: "Toddler",
  drain: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => mocks.db }));
vi.mock("@/utils/supabase/server", () => ({ createClient: () => mocks.db }));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    ok: true,
    user: { userId: "teacher", schoolId: "school", role: "teacher" },
  }),
  requireTeacherForClassroom: async () => mocks.allowed,
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
  getActiveClassroomForCurrentUser: async () => ({ id: ROOM }),
  listTeacherClassroomsForCurrentUser: async () => [
    { id: ROOM, name: "Toddler", code: mocks.classroomCode },
  ],
}));
import { POST as prepare } from "@/app/api/v1/sen-reports/[id]/report/route";
import { POST as send } from "@/app/api/v1/reports/send/route";
import { POST as create } from "@/app/api/v1/reports/route";
import { POST as batchSend } from "@/app/api/v1/reports/daily-progress/route";
let fixture: ReturnType<typeof toddlerReportFixture>;
const SOURCE = "44444444-4444-4444-8444-444444444444";
beforeEach(() => {
  fixture = toddlerReportFixture();
  mocks.db = {
    ...fixture.db,
    rpc: async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("consolidate_sen_daily_drafts");
      if (fixture.failures.has("consolidation")) return { data: null, error: { message: "retry" } };
      const canonical = fixture.tables.reports.find(
        (row) => row.id === args.p_canonical_report_id
      )!;
      const duplicate = fixture.tables.reports.find(
        (row) => row.id === args.p_duplicate_report_id
      )!;
      if (
        ![canonical, duplicate].every((row) =>
          ["draft", "changes_requested"].includes(String(row.status))
        )
      )
        return { data: null, error: { message: "changed" } };
      Object.assign(canonical, args.p_patch);
      fixture.tables.reports = fixture.tables.reports.filter((row) => row !== duplicate);
      return { data: canonical.id, error: null };
    },
  };
  mocks.allowed = true;
  mocks.classroomCode = "Toddler";
  mocks.drain.mockReset().mockResolvedValue({ sent: 1, failed: 0, failures: [] });
  fixture.tables.sen_daily_reports = [
    {
      id: SOURCE,
      school_id: "school",
      student_id: CHILD,
      report_date: DAY,
      sen_report_group_id: "team",
      remarks: "Calm transitions.",
      sen_daily_report_scores: [{ metric_id: "skill", score: 5 }],
    },
  ];
  fixture.tables.sen_report_groups = [
    { id: "team", classroom_id: ROOM, template_id: "sen-template", name: "Red" },
  ];
  fixture.tables.sen_report_metrics = [
    {
      id: "skill",
      template_id: "sen-template",
      is_active: true,
      label: "Communication",
      section: "skill",
      score_labels: ["None", "Minimum", "Satisfactory", "Good", "Excellent"],
    },
  ];
});
const req = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
const prepareCombined = () =>
  prepare(req({ includeDailyReport: true }), { params: Promise.resolve({ id: SOURCE }) });
const createDaily = () =>
  create(
    req({ childId: CHILD, kind: "Daily", reportDate: DAY, templateId: `__default:daily:${ROOM}` })
  );

it.each(["Reports", "Progress"])(
  "bundles care, progress and SEN into one draft and one parent send from %s",
  async (entry) => {
    const existing = await (await createDaily()).json();
    const response = await prepareCombined();
    expect(response.status).toBe(200);
    const { reportId } = await response.json();
    expect(reportId).toBe(existing.reportId);
    expect(fixture.tables.reports).toHaveLength(1);
    const report = fixture.tables.reports[0];
    expect(report).toMatchObject({ report_type: "daily", sen_daily_report_id: SOURCE });
    // Reopening from Reports must keep both types together.
    expect(await (await createDaily()).json()).toEqual({ reportId });
    expect(JSON.stringify(report.sections)).toContain("SEN — Skills");
    // Final send reads the latest saved SEN notes as well.
    fixture.tables.sen_daily_reports[0].remarks = "New SEN observation.";
    const sent =
      entry === "Reports"
        ? await send(req({ reportId, guardianRefs: [GUARDIAN] }))
        : await batchSend(req({ reportDate: DAY, utcOffsetMinutes: -60, studentIds: [CHILD] }));
    expect(sent.status).toBe(200);
    expect(fixture.tables.reports).toHaveLength(1);
    expect(fixture.tables.report_recipients).toHaveLength(1);
    const blocks = JSON.stringify(
      buildReportPdfBlocks(
        report.sections as Parameters<typeof buildReportPdfBlocks>[0],
        report.section_meta as Parameters<typeof buildReportPdfBlocks>[1]
      )
    );
    for (const text of [
      "Daily log",
      "Stringing",
      "Communication",
      "Excellent",
      "New SEN observation.",
    ])
      expect(blocks).toContain(text);
    expect(report.status).toBe("sent");
    const snapshot = JSON.stringify(report.sections);
    fixture.tables.sen_daily_reports[0].remarks = "After sending";
    expect(await (await prepareCombined()).json()).toEqual({ reportId });
    expect(JSON.stringify(report.sections)).toBe(snapshot);
  }
);

it("can create a unified draft directly without a previous daily draft", async () => {
  expect((await prepareCombined()).status).toBe(200);
  expect(fixture.tables.reports).toHaveLength(1);
  const again = await prepareCombined();
  expect(again.status).toBe(200);
  expect(fixture.tables.reports).toHaveLength(1);
});
it("keeps the SEN-only option available", async () => {
  expect(
    (await prepare(req({ includeDailyReport: false }), { params: Promise.resolve({ id: SOURCE }) }))
      .status
  ).toBe(200);
  expect(fixture.tables.reports[0].report_type).toBe("sen");
  expect(JSON.stringify(fixture.tables.reports[0].sections)).not.toContain("Daily log");
});
it("checks classroom access before preparing a combined report", async () => {
  mocks.allowed = false;
  expect((await prepareCombined()).status).toBe(403);
  expect(fixture.tables.reports).toHaveLength(0);
});
it("does not generate another parent draft after the daily report was sent", async () => {
  await createDaily();
  fixture.tables.reports[0].status = "sent";
  expect((await prepareCombined()).status).toBe(409);
  expect(fixture.tables.reports).toHaveLength(1);
});

it("consolidates a previously separate SEN draft and daily draft without losing additions", async () => {
  const sen = await (await prepare(req({}), { params: Promise.resolve({ id: SOURCE }) })).json();
  await createDaily();
  expect(fixture.tables.reports).toHaveLength(2);
  const daily = fixture.tables.reports.find((row) => row.id !== sen.reportId)!;
  (daily.sections as Array<unknown>).push({
    id: "home-note",
    heading: "A note for home",
    paragraphs: [{ id: "home-p", html: "Please bring spare clothes." }],
  });
  expect(await (await prepareCombined()).json()).toEqual({ reportId: sen.reportId });
  expect(fixture.tables.reports).toHaveLength(1);
  expect(JSON.stringify(fixture.tables.reports[0].sections)).toContain(
    "Please bring spare clothes."
  );
  expect(JSON.stringify(fixture.tables.reports[0].sections)).toContain("SEN — Skills");
});
it("preserves teacher additions when a non-Toddler combined report is sent from Progress", async () => {
  mocks.classroomCode = "Children";
  fixture.tables.classrooms[0].code = "Children";
  const prepared = await prepareCombined();
  expect(prepared.status).toBe(200);
  const report = fixture.tables.reports[0];
  (report.sections as Array<unknown>).push({
    id: "extra",
    heading: "Home note",
    paragraphs: [{ id: "extra-p", html: "Teacher addition" }],
  });
  const response = await batchSend(
    req({ reportDate: DAY, utcOffsetMinutes: -60, studentIds: [CHILD] })
  );
  expect(await response.json()).toMatchObject({ sentCount: 1 });
  expect(JSON.stringify(report.sections)).toContain("Teacher addition");
  expect(JSON.stringify(report.sections)).toContain("SEN — Skills");
});
it.each(["approved", "submitted_for_review", "in_review"])(
  "does not pretend to combine a daily report in %s",
  async (status) => {
    await createDaily();
    fixture.tables.reports[0].status = status;
    expect((await prepareCombined()).status).toBe(409);
    expect(fixture.tables.reports[0].sen_daily_report_id).toBeUndefined();
  }
);

it("keeps teacher notes once when duplicate-draft cleanup fails and is retried", async () => {
  await prepare(req({}), { params: Promise.resolve({ id: SOURCE }) });
  await createDaily();
  const daily = fixture.tables.reports.find((row) => row.report_type === "daily")!;
  (daily.sections as Array<unknown>).push({
    id: "extra",
    heading: "Home note",
    paragraphs: [{ id: "extra-p", html: "Teacher addition" }],
  });
  fixture.failures.set("consolidation", "temporary consolidation failure");
  expect((await prepareCombined()).status).toBe(409);
  expect(fixture.tables.reports).toHaveLength(2);
  fixture.failures.clear();
  expect((await prepareCombined()).status).toBe(200);
  expect(fixture.tables.reports).toHaveLength(1);
  const notes = (fixture.tables.reports[0].sections as Array<{ heading: string }>).filter(
    (section) => section.heading === "Home note"
  );
  expect(notes).toHaveLength(1);
});
