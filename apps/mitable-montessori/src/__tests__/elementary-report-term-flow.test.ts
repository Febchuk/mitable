import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toddlerReportFixture, ROOM, CHILD, GUARDIAN } from "./helpers/toddler-report-fixture";
import { decodeExamGrades } from "@/lib/reports/exam-grades-payload";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";

const mocks = vi.hoisted(() => ({ db: null as unknown, schoolId: "school", agent: vi.fn() }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => mocks.db }));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    ok: true,
    user: { userId: "teacher", schoolId: mocks.schoolId, role: "teacher" },
  }),
  requireTeacherForClassroom: async () => true,
}));
vi.mock("@/lib/app/active-classroom", async (original) => ({
  ...(await original<object>()),
  getCurrentUserContext: async () => ({
    userId: "teacher",
    schoolId: mocks.schoolId,
    role: "teacher",
  }),
  getActiveClassroomForCurrentUser: async () => ({ id: ROOM }),
  listTeacherClassroomsForCurrentUser: async () => [
    { id: ROOM, name: "Elementary", code: "Lower Elementary" },
  ],
}));
vi.mock("@/lib/audit/log", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/reports/agent-loop", async (original) => ({
  ...(await original<object>()),
  runReportAgent: mocks.agent,
}));
import { POST as saveGrade } from "@/app/api/v1/elementary-grades/route";
import { POST as saveComment } from "@/app/api/v1/elementary-grade-comments/route";
import { POST as create } from "@/app/api/v1/reports/route";
import { POST as regenerate } from "@/app/api/v1/reports/[id]/draft/route";
import { GET as listTerms } from "@/app/api/v1/school-terms/route";
import { getReport } from "@/lib/queries/reports";
import { sendReport } from "@/lib/reports/workflow";

const CURRENT = "44444444-4444-4444-8444-444444444444";
const FUTURE = "55555555-5555-4555-8555-555555555555";
let fixture: ReturnType<typeof toddlerReportFixture>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T13:00:00Z"));
  mocks.schoolId = "school";
  mocks.agent.mockReset();
  fixture = toddlerReportFixture();
  fixture.tables.classrooms[0].code = "Lower Elementary";
  fixture.tables.student_progress_history = [];
  fixture.tables.school_terms = [
    {
      id: FUTURE,
      school_id: "school",
      name: "Term II",
      start_date: "2027-01-11",
      end_date: "2027-03-27",
    },
    {
      id: CURRENT,
      school_id: "school",
      name: "Term I",
      start_date: "2026-09-09",
      end_date: "2026-12-22",
    },
  ];
  fixture.tables.elementary_exam_grades = [];
  fixture.tables.elementary_term_grade_comments = [];
  mocks.db = fixture.db;
});
afterEach(() => vi.useRealTimers());
const req = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
async function saveResults() {
  for (const [subject, percentage] of [
    ["Math", 80],
    ["Language", 90],
    ["Science", 100],
  ] as const) {
    const saved = await saveGrade(
      req({
        classroomId: ROOM,
        studentId: CHILD,
        termId: FUTURE,
        subject,
        percentage,
        assessmentName: "End-of-term exam",
        gradeLabel: "A",
      })
    );
    expect(saved.status).toBe(200);
  }
  expect(
    (
      await saveComment(
        req({ classroomId: ROOM, studentId: CHILD, termId: FUTURE, comment: "A strong term." })
      )
    ).status
  ).toBe(200);
}
async function createReport(termId?: string) {
  const response = await create(
    req({ childId: CHILD, kind: "Major", templateId: "__builtin:major", termId })
  );
  expect(response.status).toBe(200);
  const { reportId } = await response.json();
  const report = fixture.tables.reports.find((row) => row.id === reportId)!;
  report.students = fixture.tables.students[0];
  report.classrooms = { id: ROOM, name: "Elementary" };
  return report;
}
function summary(report: { sections?: unknown }) {
  const sections = report.sections as Array<{
    heading: string;
    paragraphs: Array<{ html: string }>;
  }>;
  return decodeExamGrades(
    sections.find((section) => section.heading === "Exam grades")!.paragraphs[0].html
  );
}

it("uses the explicitly chosen future term for saved grades, comment and reporting dates", async () => {
  await saveResults();
  const report = await createReport(FUTURE);
  expect(report).toMatchObject({
    term_id: FUTURE,
    period_start: "2027-01-11",
    period_end: "2027-03-27",
  });
  expect(summary(report)).toEqual({ averagePercentage: 90, comment: "A strong term." });
  expect(
    buildReportPdfBlocks(
      report.sections as Parameters<typeof buildReportPdfBlocks>[0],
      report.section_meta as Parameters<typeof buildReportPdfBlocks>[1]
    )
  ).toContainEqual({
    kind: "exam_grades",
    heading: "Exam grades",
    summary: { averagePercentage: 90, comment: "A strong term." },
  });
});
it("defaults to the current term without silently borrowing another term's grades", async () => {
  await saveResults();
  const report = await createReport();
  expect(report.term_id).toBe(CURRENT);
  expect(summary(report)).toBeNull();
  expect(await (await listTerms()).json()).toMatchObject({ defaultTermId: CURRENT });
});
it("refreshes saved grades and comments on reopen and regeneration while keeping the chosen term", async () => {
  await saveResults();
  const report = await createReport(FUTURE);
  fixture.tables.elementary_exam_grades[0].percentage = 100;
  fixture.tables.elementary_term_grade_comments[0].comment = "Updated comment.";
  const preview = await getReport(String(report.id));
  expect(summary(preview!)).toEqual({ averagePercentage: 96.67, comment: "Updated comment." });
  expect(summary(report)).toEqual({ averagePercentage: 90, comment: "A strong term." });
  const drafted = await regenerate(req({}), { params: Promise.resolve({ id: String(report.id) }) });
  expect(drafted.status).toBe(200);
  expect(summary(report)).toEqual({ averagePercentage: 96.67, comment: "Updated comment." });
  expect(report.term_id).toBe(FUTURE);
  expect(mocks.agent).not.toHaveBeenCalled();
});
it("snapshots the latest saved results at send and freezes the sent document", async () => {
  await saveResults();
  const report = await createReport(FUTURE);
  fixture.tables.elementary_term_grade_comments[0].comment = "Final saved comment.";
  await sendReport(
    { supabase: fixture.db, reportId: String(report.id), actorUserId: "teacher" },
    [GUARDIAN],
    { [GUARDIAN]: "parent@example.test" }
  );
  expect(summary(report)?.comment).toBe("Final saved comment.");
  const sent = JSON.stringify(report.sections);
  fixture.tables.elementary_exam_grades[0].percentage = 0;
  fixture.tables.elementary_term_grade_comments[0].comment = "After sending.";
  expect(JSON.stringify((await getReport(String(report.id)))?.sections)).toBe(sent);
  expect(fixture.tables.report_recipients).toHaveLength(1);
});
it("isolates grades by school, classroom, child and selected term", async () => {
  await saveResults();
  const original = fixture.tables.elementary_exam_grades[0];
  fixture.tables.elementary_exam_grades.push(
    { ...original, student_id: "other-child", percentage: 0 },
    { ...original, classroom_id: "other-class", percentage: 0 },
    { ...original, school_id: "other-school", percentage: 0 },
    { ...original, term_id: CURRENT, percentage: 0 }
  );
  expect(summary(await createReport(FUTURE))).toEqual({
    averagePercentage: 90,
    comment: "A strong term.",
  });
});
it("rejects a term belonging to another school", async () => {
  fixture.tables.school_terms[0].school_id = "other-school";
  const response = await create(
    req({ childId: CHILD, kind: "Major", templateId: "__builtin:major", termId: FUTURE })
  );
  expect(response.status).toBe(400);
  expect(fixture.tables.reports).toHaveLength(0);
});
it("rejects term selection for a daily report", async () => {
  expect((await create(req({ childId: CHILD, kind: "Daily", termId: FUTURE }))).status).toBe(400);
});
it("shows a source-read failure instead of an empty grades section", async () => {
  await saveResults();
  const report = await createReport(FUTURE);
  fixture.failures.set("elementary_exam_grades", "Grades unavailable");
  await expect(getReport(String(report.id))).rejects.toThrow("Grades unavailable");
});

it("honors an explicit end-of-term selection with a legacy template period", async () => {
  await saveResults();
  const templateId = "77777777-7777-4777-8777-777777777777";
  fixture.tables.report_templates = [
    {
      id: templateId,
      school_id: "school",
      kind: "Major",
      reporting_period: "daily",
      sections: ["Teacher notes"],
      section_meta: {},
      section_guidance: {},
    },
  ];
  const response = await create(req({ childId: CHILD, kind: "Major", templateId, termId: FUTURE }));
  expect(response.status).toBe(200);
  expect(fixture.tables.reports[0]).toMatchObject({
    reporting_period: "end_of_term",
    term_id: FUTURE,
    period_start: "2027-01-11",
    period_end: "2027-03-27",
  });
  expect(summary(fixture.tables.reports[0])).toEqual({
    averagePercentage: 90,
    comment: "A strong term.",
  });
});
