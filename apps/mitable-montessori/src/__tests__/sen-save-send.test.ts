import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  drain: vi.fn(),
  classroom: "11111111-1111-4111-8111-111111111111",
  child: "22222222-2222-4222-8222-222222222222",
  group: "33333333-3333-4333-8333-333333333333",
  metric: "44444444-4444-4444-8444-444444444444",
  report: "55555555-5555-4555-8555-555555555555",
  guardian: "66666666-6666-4666-8666-666666666666",
}));

// Persist writes between the real save, prepare and send route handlers.
function from(table: string) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let operation = "select";
  let payload: Record<string, unknown> | Array<Record<string, unknown>>;
  const execute = () => {
    const rows = (state.tables[table] ??= []);
    if (operation === "insert" || operation === "upsert") {
      rows.push(...(Array.isArray(payload) ? payload : [{ id: state.report, ...payload }]));
    }
    let data = rows.filter((row) => filters.every((filter) => filter(row)));
    if (operation === "update") data.forEach((row) => Object.assign(row, payload));
    if (table === "sen_daily_reports")
      data = data.map((row) => ({
        ...row,
        sen_daily_report_scores: state.tables.sen_daily_report_scores.filter(
          (score) => score.sen_daily_report_id === row.id
        ),
      }));
    return { data, error: null };
  };
  const q = {
    select: () => q,
    order: () => q,
    eq: (key: string, value: unknown) => {
      filters.push((row) => row[key] === value);
      return q;
    },
    in: (key: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[key]));
      return q;
    },
    insert: (value: typeof payload) => {
      operation = "insert";
      payload = value;
      return q;
    },
    upsert: (value: typeof payload) => {
      operation = "upsert";
      payload = value;
      return q;
    },
    update: (value: typeof payload) => {
      operation = "update";
      payload = value;
      return q;
    },
    maybeSingle: async () => {
      const result = execute();
      return { ...result, data: result.data[0] ?? null };
    },
    single: async () => q.maybeSingle(),
    then: (resolve: (result: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
  };
  return q;
}
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    ok: true,
    user: { userId: "teacher", schoolId: "school", role: "teacher" },
  }),
  requireTeacherForClassroom: async () => true,
}));
vi.mock("@/lib/app/active-classroom", () => ({
  resolveClassroomForCurrentUser: async () => ({ id: state.classroom }),
}));
vi.mock("@/utils/supabase/server", () => ({ createClient: () => ({ from }) }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));
vi.mock("@/lib/audit/log", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/queries/reports", () => ({ getReport: async () => ({ reportType: "sen" }) }));
vi.mock("@/lib/admin/email-worker", () => ({
  drainPendingReports: state.drain,
  StubEmailSender: class {},
}));
import { POST as save } from "@/app/api/v1/sen-reports/route";
import { POST as prepare } from "@/app/api/v1/sen-reports/[id]/report/route";
import { POST as send } from "@/app/api/v1/reports/send/route";

beforeEach(() => {
  state.drain.mockResolvedValue({ sent: 1, failed: 0, failures: [] });
  state.tables = {
    sen_report_groups: [
      {
        id: state.group,
        classroom_id: state.classroom,
        template_id: "template",
        name: "Red",
        is_active: true,
      },
    ],
    sen_report_metrics: [
      {
        id: state.metric,
        template_id: "template",
        is_active: true,
        label: "Communication",
        section: "skill",
        score_labels: ["None", "Minimum", "Satisfactory", "Good", "Excellent"],
      },
    ],
    sen_daily_reports: [],
    sen_daily_report_scores: [],
    reports: [],
    report_review_actions: [],
    report_recipients: [],
    student_guardians: [
      {
        student_id: state.child,
        guardian_id: state.guardian,
        receives_reports: true,
        guardians: { id: state.guardian, email: "parent@example.test" },
      },
    ],
  };
});
const request = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

it("saves an SEN assessment, prepares a draft, then sends it to an eligible parent", async () => {
  const saved = await save(
    request({
      classroomId: state.classroom,
      groupId: state.group,
      studentId: state.child,
      reportDate: "2026-10-20",
      remarks: "A steady day",
      scores: [{ metricId: state.metric, score: 5 }],
    })
  );
  expect(saved.status).toBe(200);
  const assessment = await saved.json();
  const prepared = await prepare(request({}), { params: Promise.resolve({ id: assessment.id }) });
  expect(prepared.status).toBe(200);
  const { reportId } = await prepared.json();
  expect(state.tables.reports[0]).toMatchObject({
    status: "draft",
    report_type: "sen",
    sen_daily_report_id: assessment.id,
  });
  expect(JSON.stringify(state.tables.reports[0].sections)).toContain(
    "Communication: 5/5 — Excellent"
  );
  const sent = await send(request({ reportId, guardianRefs: [state.guardian] }));
  expect(sent.status).toBe(200);
  expect(state.tables.reports[0].status).toBe("sent");
  expect(state.tables.report_recipients).toEqual([
    expect.objectContaining({
      report_id: reportId,
      guardian_id: state.guardian,
      delivery_status: "pending",
      email_snapshot: "parent@example.test",
    }),
  ]);
  expect(state.drain).toHaveBeenCalledWith(expect.anything(), expect.anything(), { reportId });
});
