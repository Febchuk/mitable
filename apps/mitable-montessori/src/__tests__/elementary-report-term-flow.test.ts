import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toddlerReportFixture, ROOM, CHILD, GUARDIAN } from "./helpers/toddler-report-fixture";
import { decodeExamGrades } from "@/lib/reports/exam-grades-payload";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";
import { decodeProgressTopic } from "@/lib/reports/progress-topic-payload";
import { fieldPayloadToReadableText } from "@/lib/reports/template-field-payload";
import { encodeTermSkills, termSkillsForDisplay } from "@/lib/reports/term-skills";

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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/anthropic/client", () => ({ getAnthropic: () => ({}), SONNET_MODEL: "test-model" }));
vi.mock("@/lib/reports/agent-loop", async (original) => ({
  ...(await original<object>()),
  runReportAgent: mocks.agent,
}));
import { POST as saveGrade } from "@/app/api/v1/elementary-grades/route";
import { POST as saveComment } from "@/app/api/v1/elementary-grade-comments/route";
import { POST as create } from "@/app/api/v1/reports/route";
import { POST as regenerate } from "@/app/api/v1/reports/[id]/draft/route";
import { PATCH as updateReport } from "@/app/api/v1/reports/[id]/route";
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
  expect(summary(report)).toMatchObject({ averagePercentage: 90, comment: "A strong term." });
  expect(summary(report)?.rows).toEqual([
    {
      subject: "Language",
      assessmentName: "End-of-term exam",
      caScore: null,
      classParticipationScore: null,
      aflScore: null,
      total: 90,
    },
    {
      subject: "Math",
      assessmentName: "End-of-term exam",
      caScore: null,
      classParticipationScore: null,
      aflScore: null,
      total: 80,
    },
    {
      subject: "Science",
      assessmentName: "End-of-term exam",
      caScore: null,
      classParticipationScore: null,
      aflScore: null,
      total: 100,
    },
  ]);
  expect(
    buildReportPdfBlocks(
      report.sections as Parameters<typeof buildReportPdfBlocks>[0],
      report.section_meta as Parameters<typeof buildReportPdfBlocks>[1]
    )
  ).toContainEqual({
    kind: "exam_grades",
    heading: "Exam grades",
    summary: expect.objectContaining({ averagePercentage: 90, comment: "A strong term." }),
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
  expect(summary(preview!)).toMatchObject({
    averagePercentage: 96.67,
    comment: "Updated comment.",
  });
  expect(summary(report)).toMatchObject({ averagePercentage: 90, comment: "A strong term." });
  const drafted = await regenerate(req({}), { params: Promise.resolve({ id: String(report.id) }) });
  expect(drafted.status).toBe(200);
  expect(summary(report)).toMatchObject({ averagePercentage: 96.67, comment: "Updated comment." });
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
  expect(summary(await createReport(FUTURE))).toMatchObject({
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
  expect(summary(fixture.tables.reports[0])).toMatchObject({
    averagePercentage: 90,
    comment: "A strong term.",
  });
});

it("compiles shared term reports on creation and regeneration without sending their text to the drafting agent", async () => {
  fixture.tables.reports.push({
    id: "shared-source",
    student_id: CHILD,
    students: { school_id: "school" },
    report_type: "sen",
    status: "sent",
    report_date: "2027-02-01",
    sections: null,
    body: "Communication improved with support.",
  });
  const report = await createReport(FUTURE);
  const highlights = () =>
    (report.sections as Array<{ heading: string; paragraphs: Array<{ html: string }> }>).find(
      (section) => section.heading === "SEN reports — term highlights"
    )!;
  expect(fieldPayloadToReadableText(highlights().paragraphs[0].html)).toContain(
    "Communication improved with support."
  );
  highlights().paragraphs.push({ html: "Teacher follow-up." });
  const response = await regenerate(req({}), {
    params: Promise.resolve({ id: String(report.id) }),
  });
  expect(response.status).toBe(200);
  expect(fieldPayloadToReadableText(highlights().paragraphs[0].html)).toContain(
    "Communication improved with support."
  );
  expect(highlights().paragraphs[1].html).toBe("Teacher follow-up.");
  expect((report.section_meta as Record<string, unknown>)[highlights().heading]).toEqual({
    type: "term_history",
  });
  expect(mocks.agent).not.toHaveBeenCalled();
});

it("shows the term's furthest milestone on preview and send, then freezes it for parents", async () => {
  fixture.tables.student_progress_history = [
    {
      id: "first",
      student_id: CHILD,
      curriculum_subtopic_id: "beads",
      new_status: "mastered",
      comment: null,
      changed_at: "2027-02-01T09:00:00Z",
    },
    {
      id: "second",
      student_id: CHILD,
      curriculum_subtopic_id: "beads",
      new_status: "practicing",
      comment: "Practised again.",
      changed_at: "2027-02-02T09:00:00Z",
    },
  ];
  const report = await createReport(FUTURE);
  const grid = (source: { sections?: unknown }) =>
    decodeProgressTopic(
      (source.sections as Array<{ heading: string; paragraphs: Array<{ html: string }> }>).find(
        (section) => section.heading === "Practical Life"
      )!.paragraphs[0].html
    );
  expect(grid(report)?.[0].status).toBe("mastered");
  expect(grid((await getReport(String(report.id)))!)?.[0].status).toBe("mastered");
  await sendReport(
    { supabase: fixture.db, reportId: String(report.id), actorUserId: "teacher" },
    [],
    {}
  );
  fixture.tables.student_progress_history.push({
    id: "clear",
    student_id: CHILD,
    curriculum_subtopic_id: "beads",
    new_status: "na",
    changed_at: "2027-02-03T09:00:00Z",
  });
  expect(grid((await getReport(String(report.id)))!)?.[0].status).toBe("mastered");
});

it("keeps manual term skills through save, reopen, regeneration, send and parent PDF conversion", async () => {
  const report = await createReport(FUTURE);
  const sections = report.sections as Array<{
    id: string;
    heading: string;
    paragraphs: Array<{ id: string; html: string }>;
  }>;
  const skills = sections.find((section) => section.heading === "Skills report")!;
  expect(
    termSkillsForDisplay(skills.paragraphs[0].html).every((group) =>
      group.rows.every((row) => !row.value)
    )
  ).toBe(true);
  skills.paragraphs[0].html = encodeTermSkills({ "0-0": "Excellent", "2-0": "Developing" });
  const updated = await updateReport(
    new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify({ sections }) }),
    { params: Promise.resolve({ id: String(report.id) }) }
  );
  expect(updated.status).toBe(200);
  const reopened = await getReport(String(report.id));
  expect(
    reopened?.sections?.find((section) => section.heading === "Skills report")?.paragraphs[0].html
  ).toBe(skills.paragraphs[0].html);
  expect(
    (await regenerate(req({}), { params: Promise.resolve({ id: String(report.id) }) })).status
  ).toBe(200);
  expect(mocks.agent).not.toHaveBeenCalled();
  await sendReport(
    { supabase: fixture.db, reportId: String(report.id), actorUserId: "teacher" },
    [],
    {}
  );
  const blocks = buildReportPdfBlocks(
    report.sections as Parameters<typeof buildReportPdfBlocks>[0],
    report.section_meta as Parameters<typeof buildReportPdfBlocks>[1]
  );
  const block = blocks.find((block) => block.kind === "term_skills");
  expect(block?.kind).toBe("term_skills");
  if (block?.kind === "term_skills") expect(block.groups[0].rows[0].value).toBe("Excellent");
});

it("computes the subject total from components and snapshots the overall letter grade in the selected term", async () => {
  const saved = await saveGrade(
    req({
      classroomId: ROOM,
      studentId: CHILD,
      termId: FUTURE,
      subject: "Geography",
      assessmentName: "Term assessment",
      caScore: 31.5,
      classParticipationScore: 18,
      aflScore: 17,
      percentage: 99,
      gradeLabel: "A",
    })
  );
  expect(saved.status).toBe(200);
  expect((await saved.json()).grade).toMatchObject({
    percentage: 66.5,
    caScore: 31.5,
    classParticipationScore: 18,
    aflScore: 17,
    gradeLabel: "",
  });
  expect(
    (
      await saveComment(
        req({
          classroomId: ROOM,
          studentId: CHILD,
          termId: FUTURE,
          comment: "A productive term.",
          overallGradeLabel: "B",
        })
      )
    ).status
  ).toBe(200);
  const report = await createReport(FUTURE);
  expect(summary(report)).toEqual({
    averagePercentage: 66.5,
    comment: "A productive term.",
    overallGradeLabel: "B",
    rows: [
      {
        subject: "Geography",
        assessmentName: "Term assessment",
        caScore: 31.5,
        classParticipationScore: 18,
        aflScore: 17,
        total: 66.5,
      },
    ],
  });
  await saveComment(
    req({
      classroomId: ROOM,
      studentId: CHILD,
      termId: FUTURE,
      comment: "Reviewed feedback.",
      overallGradeLabel: "A",
    })
  );
  expect(summary((await getReport(String(report.id)))!)?.overallGradeLabel).toBe("A");
  await sendReport(
    { supabase: fixture.db, reportId: String(report.id), actorUserId: "teacher" },
    [],
    {}
  );
  expect(summary(report)?.overallGradeLabel).toBe("A");
  await saveComment(
    req({
      classroomId: ROOM,
      studentId: CHILD,
      termId: FUTURE,
      comment: "Later feedback.",
      overallGradeLabel: "C",
    })
  );
  expect(summary((await getReport(String(report.id)))!)?.overallGradeLabel).toBe("A");
});

it.each([
  { caScore: 41, classParticipationScore: 10, aflScore: 10 },
  { caScore: 10, classParticipationScore: 21, aflScore: 10 },
  { caScore: 10, classParticipationScore: 10, aflScore: 41 },
  { caScore: -1, classParticipationScore: 10, aflScore: 10 },
  { caScore: 10, classParticipationScore: 10 },
  { caScore: 10.125, classParticipationScore: 10, aflScore: 10 },
])("rejects invalid or incomplete component scores: %j", async (scores) => {
  const response = await saveGrade(
    req({
      classroomId: ROOM,
      studentId: CHILD,
      termId: FUTURE,
      subject: "Math",
      assessmentName: "Term assessment",
      ...scores,
    })
  );
  expect(response.status).toBe(400);
  expect(fixture.tables.elementary_exam_grades).toHaveLength(0);
});

it("accepts zero scores and total-only results without inventing components or requiring subject letter grades", async () => {
  const context = {
    classroomId: ROOM,
    studentId: CHILD,
    termId: FUTURE,
    assessmentName: "Term assessment",
  };
  const zero = await saveGrade(
    req({ ...context, subject: "Math", caScore: 0, classParticipationScore: 0, aflScore: 0 })
  );
  expect(zero.status).toBe(200);
  expect((await zero.json()).grade).toMatchObject({
    percentage: 0,
    caScore: 0,
    classParticipationScore: 0,
    aflScore: 0,
    gradeLabel: "",
  });
  const total = await saveGrade(req({ ...context, subject: "Language", percentage: 80 }));
  expect(total.status).toBe(200);
  expect((await total.json()).grade).toMatchObject({
    percentage: 80,
    caScore: null,
    classParticipationScore: null,
    aflScore: null,
  });
  expect(summary(await createReport(FUTURE))?.averagePercentage).toBe(40);
});

it("saves an overall grade without a comment and preserves it when an older client updates the comment", async () => {
  const context = { classroomId: ROOM, studentId: CHILD, termId: FUTURE };
  expect(
    (await saveComment(req({ ...context, comment: null, overallGradeLabel: "B" }))).status
  ).toBe(200);
  expect(fixture.tables.elementary_term_grade_comments[0]).toMatchObject({
    comment: "",
    overall_grade_label: "B",
  });
  await saveComment(req({ ...context, comment: "New comment." }));
  expect(fixture.tables.elementary_term_grade_comments[0]).toMatchObject({
    comment: "New comment.",
    overall_grade_label: "B",
  });
  await saveComment(req({ ...context, comment: null }));
  expect(fixture.tables.elementary_term_grade_comments[0].overall_grade_label).toBe("B");
  await saveComment(req({ ...context, comment: null, overallGradeLabel: null }));
  expect(fixture.tables.elementary_term_grade_comments).toHaveLength(0);
});

it("rejects unsupported overall letters and updates to a grade outside the selected child/class/term", async () => {
  const context = { classroomId: ROOM, studentId: CHILD, termId: FUTURE };
  expect(
    (await saveComment(req({ ...context, comment: null, overallGradeLabel: "A*" }))).status
  ).toBe(400);
  const id = "88888888-8888-4888-8888-888888888888";
  fixture.tables.elementary_exam_grades.push({
    id,
    school_id: "school",
    classroom_id: "other-class",
    student_id: CHILD,
    term_id: FUTURE,
    percentage: 50,
  });
  expect(
    (
      await saveGrade(
        req({
          ...context,
          id,
          subject: "Math",
          assessmentName: "Term assessment",
          caScore: 40,
          classParticipationScore: 20,
          aflScore: 40,
        })
      )
    ).status
  ).toBe(500);
  expect(fixture.tables.elementary_exam_grades[0].percentage).toBe(50);
});

it("preserves teacher-marked skills when the writing assistant drafts the term's narrative", async () => {
  fixture.tables.student_progress_history = [
    {
      id: "work",
      student_id: CHILD,
      curriculum_subtopic_id: "beads",
      new_status: "mastered",
      comment: null,
      changed_at: "2027-02-01T09:00:00Z",
    },
  ];
  const report = await createReport(FUTURE);
  const skills = (
    report.sections as Array<{ heading: string; paragraphs: Array<{ html: string }> }>
  ).find((section) => section.heading === "Skills report")!;
  skills.paragraphs[0].html = encodeTermSkills({ "0-0": "Excellent" });
  mocks.agent.mockResolvedValue({
    draft: {
      title: "Term report",
      sections: [{ heading: "Practical Life — Comments", content: "Specific recorded work." }],
    },
    references: { refs: [] },
    turns: 1,
    regenerations: 0,
  });
  const response = await regenerate(req({ notes: ["Recorded observations."] }), {
    params: Promise.resolve({ id: String(report.id) }),
  });
  expect(await response.clone().json()).not.toHaveProperty("error");
  expect(response.status).toBe(200);
  expect(mocks.agent).toHaveBeenCalledOnce();
  const saved = (report.sections as (typeof skills)[]).find(
    (section) => section.heading === "Skills report"
  )!;
  expect(termSkillsForDisplay(saved.paragraphs[0].html)[0].rows[0].value).toBe("Excellent");
  expect(
    mocks.agent.mock.calls[0][0].templateSections.map(
      (section: { heading: string }) => section.heading
    )
  ).not.toContain("Skills report");
});
