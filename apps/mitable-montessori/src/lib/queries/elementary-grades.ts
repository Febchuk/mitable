import { createAdminClient } from "@/utils/supabase/admin";
import {
  getCurrentUserContext,
  isElementaryClassroomCode,
  listTeacherClassroomsForCurrentUser,
} from "@/lib/app/active-classroom";
import { listSchoolTerms, type SchoolTerm } from "@/lib/queries/school-terms";

export type ElementaryGradeStudent = {
  id: string;
  classroomId: string;
  name: string;
};

export type ElementaryExamGrade = {
  id: string;
  classroomId: string;
  studentId: string;
  termId: string;
  subject: string;
  assessmentName: string;
  percentage: number;
  gradeLabel: string;
  comments: string | null;
  updatedAt: string;
};

export type ElementaryGradesPageData = {
  classrooms: Array<{ id: string; name: string }>;
  terms: SchoolTerm[];
  students: ElementaryGradeStudent[];
  grades: ElementaryExamGrade[];
};

export async function getElementaryGradesPageData(): Promise<ElementaryGradesPageData | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx || ctx.role !== "teacher") return null;

  const classrooms = (await listTeacherClassroomsForCurrentUser()).filter((classroom) =>
    isElementaryClassroomCode(classroom.code)
  );
  if (classrooms.length === 0) return null;

  const admin = createAdminClient();
  const classroomIds = classrooms.map((classroom) => classroom.id);
  const [terms, enrollmentResp, gradesResp] = await Promise.all([
    listSchoolTerms(admin, ctx.schoolId),
    admin
      .from("student_classroom_enrollments")
      .select("classroom_id, students!inner(id, first_name, last_name, preferred_name, school_id)")
      .in("classroom_id", classroomIds)
      .is("end_date", null)
      .eq("students.school_id", ctx.schoolId),
    admin
      .from("elementary_exam_grades")
      .select(
        "id, classroom_id, student_id, term_id, subject, assessment_name, percentage, grade_label, comments, updated_at"
      )
      .eq("school_id", ctx.schoolId)
      .in("classroom_id", classroomIds)
      .order("subject"),
  ]);

  if (enrollmentResp.error) throw new Error(enrollmentResp.error.message);
  if (gradesResp.error) throw new Error(gradesResp.error.message);

  const students = (enrollmentResp.data ?? []).flatMap((raw) => {
    const row = raw as unknown as {
      classroom_id: string;
      students:
        | {
            id: string;
            first_name: string | null;
            last_name: string | null;
            preferred_name: string | null;
          }
        | Array<{
            id: string;
            first_name: string | null;
            last_name: string | null;
            preferred_name: string | null;
          }>;
    };
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    if (!student) return [];
    const first = student.preferred_name || student.first_name || "Student";
    return [
      {
        id: student.id,
        classroomId: row.classroom_id,
        name: `${first} ${student.last_name ?? ""}`.trim(),
      },
    ];
  });

  return {
    classrooms: classrooms.map(({ id, name }) => ({ id, name })),
    terms,
    students: students.sort((a, b) => a.name.localeCompare(b.name)),
    grades: (gradesResp.data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: row.id as string,
        classroomId: row.classroom_id as string,
        studentId: row.student_id as string,
        termId: row.term_id as string,
        subject: row.subject as string,
        assessmentName: row.assessment_name as string,
        percentage: Number(row.percentage),
        gradeLabel: row.grade_label as string,
        comments: (row.comments as string | null) ?? null,
        updatedAt: row.updated_at as string,
      };
    }),
  };
}

export async function listStudentExamGradesForTerm(args: {
  schoolId: string;
  classroomId: string;
  studentId: string;
  termId: string;
}): Promise<ElementaryExamGrade[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("elementary_exam_grades")
    .select(
      "id, classroom_id, student_id, term_id, subject, assessment_name, percentage, grade_label, comments, updated_at"
    )
    .eq("school_id", args.schoolId)
    .eq("classroom_id", args.classroomId)
    .eq("student_id", args.studentId)
    .eq("term_id", args.termId)
    .order("subject")
    .order("assessment_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: row.id as string,
      classroomId: row.classroom_id as string,
      studentId: row.student_id as string,
      termId: row.term_id as string,
      subject: row.subject as string,
      assessmentName: row.assessment_name as string,
      percentage: Number(row.percentage),
      gradeLabel: row.grade_label as string,
      comments: (row.comments as string | null) ?? null,
      updatedAt: row.updated_at as string,
    };
  });
}
