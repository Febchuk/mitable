import { cookies } from "next/headers";
import {
  getCurrentUserContext,
  listTeacherClassroomsForCurrentUser,
} from "@/lib/app/active-classroom";
import { createClient } from "@/utils/supabase/server";
import type { AnswerKey, QuestionKind, TestAnswer, TestQuestion, TestStatus } from "./model";

/**
 * Everything here runs with the signed-in person's session, not the service
 * role, so the database's row level security decides what they can read.
 */
async function client() {
  return createClient(await cookies());
}

type QuestionRow = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[] | null;
  points: number | string;
  position: number;
};

const QUESTION_COLUMNS = "id, kind, prompt, options, points, position";

function toQuestion(row: QuestionRow): TestQuestion {
  return {
    id: row.id,
    kind: row.kind,
    prompt: row.prompt,
    options: row.options,
    points: Number(row.points),
  };
}

const toNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

type AnswerRow = {
  question_id: string;
  selected_option: number | null;
  answer_text: string | null;
  answer_number: number | string | null;
};

function toAnswer(row: AnswerRow): TestAnswer {
  return {
    selectedOption: row.selected_option,
    answerText: row.answer_text,
    answerNumber: toNumber(row.answer_number),
  };
}

export type ClassroomOption = { id: string; name: string };

export async function listClassroomsForTests(): Promise<ClassroomOption[]> {
  const context = await getCurrentUserContext();
  if (!context) return [];
  if (context.role !== "admin") {
    const classrooms = await listTeacherClassroomsForCurrentUser();
    return classrooms.map(({ id, name }) => ({ id, name }));
  }
  const supabase = await client();
  const { data } = await supabase
    .from("classrooms")
    .select("id, name")
    .eq("school_id", context.schoolId)
    .eq("status", "active")
    .order("name");
  return (data ?? []) as ClassroomOption[];
}

export type StaffTestSummary = {
  id: string;
  title: string;
  subject: string;
  status: TestStatus;
  classroomId: string;
  classroomName: string;
  submittedCount: number;
};

export async function listStaffTests(): Promise<StaffTestSummary[]> {
  const context = await getCurrentUserContext();
  if (!context) return [];
  const supabase = await client();
  const { data } = await supabase
    .from("tests")
    .select("id, title, subject, status, classroom_id, classrooms(name), test_submissions(status)")
    .order("created_at", { ascending: false });
  return (
    (data ?? []) as unknown as Array<{
      id: string;
      title: string;
      subject: string;
      status: TestStatus;
      classroom_id: string;
      classrooms: { name: string } | null;
      test_submissions: { status: string }[];
    }>
  ).map((row) => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    status: row.status,
    classroomId: row.classroom_id,
    classroomName: row.classrooms?.name ?? "",
    submittedCount: row.test_submissions.filter((item) => item.status === "submitted").length,
  }));
}

export type StaffTest = {
  id: string;
  title: string;
  subject: string;
  instructions: string | null;
  status: TestStatus;
  classroomId: string;
  classroomName: string;
  questions: (TestQuestion & { key: AnswerKey | null })[];
};

export async function getStaffTest(testId: string): Promise<StaffTest | null> {
  const context = await getCurrentUserContext();
  if (!context) return null;
  const supabase = await client();
  const { data: test } = await supabase
    .from("tests")
    .select("id, title, subject, instructions, status, classroom_id, classrooms(name)")
    .eq("id", testId)
    .maybeSingle();
  if (!test) return null;
  const { data: questions } = await supabase
    .from("test_questions")
    .select(`${QUESTION_COLUMNS}, test_answer_keys(correct_option, correct_number)`)
    .eq("test_id", testId)
    .order("position");
  const row = test as unknown as {
    id: string;
    title: string;
    subject: string;
    instructions: string | null;
    status: TestStatus;
    classroom_id: string;
    classrooms: { name: string } | null;
  };
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    instructions: row.instructions,
    status: row.status,
    classroomId: row.classroom_id,
    classroomName: row.classrooms?.name ?? "",
    questions: (
      (questions ?? []) as unknown as Array<
        QuestionRow & {
          test_answer_keys: {
            correct_option: number | null;
            correct_number: number | string | null;
          } | null;
        }
      >
    ).map((question) => ({
      ...toQuestion(question),
      key: question.test_answer_keys
        ? {
            correctOption: question.test_answer_keys.correct_option,
            correctNumber: toNumber(question.test_answer_keys.correct_number),
          }
        : null,
    })),
  };
}

export type RosterStudent = {
  id: string;
  name: string;
};

export async function listClassroomStudents(classroomId: string): Promise<RosterStudent[]> {
  const supabase = await client();
  const { data } = await supabase
    .from("student_classroom_enrollments")
    .select("students(id, first_name, last_name, preferred_name, archived_at)")
    .eq("classroom_id", classroomId)
    .is("end_date", null);
  return (
    (data ?? []) as unknown as Array<{
      students: {
        id: string;
        first_name: string;
        last_name: string;
        preferred_name: string | null;
        archived_at: string | null;
      } | null;
    }>
  )
    .flatMap(({ students: student }) =>
      student && !student.archived_at
        ? [
            {
              id: student.id,
              name: `${student.preferred_name?.trim() || student.first_name} ${student.last_name}`,
            },
          ]
        : []
    )
    .sort((first, second) => first.name.localeCompare(second.name));
}

export type RosterSubmission = RosterStudent & {
  submissionId: string | null;
  status: "not_started" | "in_progress" | "submitted";
  submittedAt: string | null;
  markedCount: number;
  markedPoints: number;
};

export async function listTestRoster(test: StaffTest): Promise<RosterSubmission[]> {
  const supabase = await client();
  const [students, { data }] = await Promise.all([
    listClassroomStudents(test.classroomId),
    supabase
      .from("test_submissions")
      .select("id, student_id, status, submitted_at, test_marks(points)")
      .eq("test_id", test.id),
  ]);
  const submissions = new Map(
    (
      (data ?? []) as unknown as Array<{
        id: string;
        student_id: string;
        status: "in_progress" | "submitted";
        submitted_at: string | null;
        test_marks: { points: number | string }[];
      }>
    ).map((row) => [row.student_id, row])
  );
  return students.map((student) => {
    const submission = submissions.get(student.id);
    return {
      ...student,
      submissionId: submission?.id ?? null,
      status: submission?.status ?? "not_started",
      submittedAt: submission?.submitted_at ?? null,
      markedCount: submission?.test_marks.length ?? 0,
      markedPoints: (submission?.test_marks ?? []).reduce(
        (total, mark) => total + Number(mark.points),
        0
      ),
    };
  });
}

export type MarkingData = {
  test: StaffTest;
  submissionId: string;
  studentName: string;
  submittedAt: string | null;
  answers: Record<string, TestAnswer>;
  marks: Record<string, { points: number; comment: string | null }>;
};

export async function getSubmissionForMarking(
  testId: string,
  submissionId: string
): Promise<MarkingData | null> {
  const test = await getStaffTest(testId);
  if (!test) return null;
  const supabase = await client();
  const { data: submission } = await supabase
    .from("test_submissions")
    .select("id, student_id, status, submitted_at")
    .eq("id", submissionId)
    .eq("test_id", testId)
    .eq("status", "submitted")
    .maybeSingle();
  if (!submission) return null;
  const [students, { data: answers }, { data: marks }] = await Promise.all([
    listClassroomStudents(test.classroomId),
    supabase
      .from("test_answers")
      .select("question_id, selected_option, answer_text, answer_number")
      .eq("submission_id", submissionId),
    supabase
      .from("test_marks")
      .select("question_id, points, comment")
      .eq("submission_id", submissionId),
  ]);
  return {
    test,
    submissionId,
    studentName:
      students.find((student) => student.id === submission.student_id)?.name ?? "Former student",
    submittedAt: submission.submitted_at as string | null,
    answers: Object.fromEntries(
      ((answers ?? []) as AnswerRow[]).map((row) => [row.question_id, toAnswer(row)])
    ),
    marks: Object.fromEntries(
      (
        (marks ?? []) as { question_id: string; points: number | string; comment: string | null }[]
      ).map((row) => [row.question_id, { points: Number(row.points), comment: row.comment }])
    ),
  };
}

export type StudentLoginRow = RosterStudent & { loginCode: string | null };

export async function listClassroomLogins(classroomId: string): Promise<StudentLoginRow[]> {
  const supabase = await client();
  const students = await listClassroomStudents(classroomId);
  const { data } = await supabase
    .from("student_logins")
    .select("student_id, login_code")
    .in(
      "student_id",
      students.map((student) => student.id)
    );
  const codes = new Map(
    ((data ?? []) as { student_id: string; login_code: string }[]).map((row) => [
      row.student_id,
      row.login_code,
    ])
  );
  return students.map((student) => ({ ...student, loginCode: codes.get(student.id) ?? null }));
}

export type StudentProfile = {
  studentId: string;
  displayName: string;
  schoolName: string | null;
  loginCode: string;
};

export async function getCurrentStudent(): Promise<StudentProfile | null> {
  const supabase = await client();
  const { data } = await supabase.rpc("current_student_profile");
  const row = (
    data as
      | {
          student_id: string;
          display_name: string;
          school_name: string | null;
          login_code: string;
        }[]
      | null
  )?.[0];
  return row
    ? {
        studentId: row.student_id,
        displayName: row.display_name,
        schoolName: row.school_name,
        loginCode: row.login_code,
      }
    : null;
}

export type StudentTestSummary = {
  id: string;
  title: string;
  subject: string;
  status: "not_started" | "in_progress" | "submitted";
};

export async function listStudentTests(studentId: string): Promise<StudentTestSummary[]> {
  const supabase = await client();
  const [{ data: tests }, { data: submissions }] = await Promise.all([
    supabase
      .from("tests")
      .select("id, title, subject")
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase.from("test_submissions").select("test_id, status").eq("student_id", studentId),
  ]);
  const statuses = new Map(
    ((submissions ?? []) as { test_id: string; status: "in_progress" | "submitted" }[]).map(
      (row) => [row.test_id, row.status]
    )
  );
  return ((tests ?? []) as { id: string; title: string; subject: string }[]).map((test) => ({
    ...test,
    status: statuses.get(test.id) ?? "not_started",
  }));
}

export type StudentTest = {
  id: string;
  title: string;
  subject: string;
  instructions: string | null;
  questions: TestQuestion[];
  submissionId: string | null;
  submitted: boolean;
  answers: Record<string, TestAnswer>;
};

export async function getStudentTest(
  testId: string,
  studentId: string
): Promise<StudentTest | null> {
  const supabase = await client();
  const { data: test } = await supabase
    .from("tests")
    .select("id, title, subject, instructions")
    .eq("id", testId)
    .eq("status", "published")
    .maybeSingle();
  if (!test) return null;
  const [{ data: questions }, { data: submission }] = await Promise.all([
    supabase
      .from("test_questions")
      .select(QUESTION_COLUMNS)
      .eq("test_id", testId)
      .order("position"),
    supabase
      .from("test_submissions")
      .select("id, status")
      .eq("test_id", testId)
      .eq("student_id", studentId)
      .maybeSingle(),
  ]);
  const { data: answers } = submission
    ? await supabase
        .from("test_answers")
        .select("question_id, selected_option, answer_text, answer_number")
        .eq("submission_id", submission.id)
    : { data: [] };
  return {
    ...(test as Pick<StudentTest, "id" | "title" | "subject" | "instructions">),
    questions: ((questions ?? []) as QuestionRow[]).map(toQuestion),
    submissionId: (submission?.id as string | undefined) ?? null,
    submitted: submission?.status === "submitted",
    answers: Object.fromEntries(
      ((answers ?? []) as AnswerRow[]).map((row) => [row.question_id, toAnswer(row)])
    ),
  };
}
