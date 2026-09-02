import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireTeacherForClassroom } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { isElementaryClassroomCode } from "@/lib/app/active-classroom";
import { auditLog } from "@/lib/audit/log";

const UpsertGradeSchema = z.object({
  id: z.string().uuid().optional(),
  classroomId: z.string().uuid(),
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  subject: z.string().trim().min(1).max(120),
  assessmentName: z.string().trim().min(1).max(160),
  percentage: z.number().min(0).max(100),
  gradeLabel: z.string().trim().min(1).max(80),
  comments: z.string().trim().max(4000).nullable().optional(),
});

async function validateScope(args: {
  schoolId: string;
  classroomId: string;
  studentId: string;
  termId: string;
}): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!(await requireTeacherForClassroom(args.classroomId))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Classroom access denied" }, { status: 403 }),
    };
  }
  const admin = createAdminClient();
  const [classroomResp, enrollmentResp, termResp] = await Promise.all([
    admin.from("classrooms").select("code, school_id").eq("id", args.classroomId).maybeSingle(),
    admin
      .from("student_classroom_enrollments")
      .select("id")
      .eq("classroom_id", args.classroomId)
      .eq("student_id", args.studentId)
      .is("end_date", null)
      .maybeSingle(),
    admin
      .from("school_terms")
      .select("id")
      .eq("id", args.termId)
      .eq("school_id", args.schoolId)
      .maybeSingle(),
  ]);
  const classroom = classroomResp.data;
  if (
    !classroom ||
    classroom.school_id !== args.schoolId ||
    !isElementaryClassroomCode(classroom.code as string | null)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Grades are only available for elementary classrooms" },
        { status: 403 }
      ),
    };
  }
  if (!enrollmentResp.data) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Student is not enrolled in this classroom" },
        { status: 400 }
      ),
    };
  }
  if (!termResp.data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "School term not found" }, { status: 400 }),
    };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "teacher")
    return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const parsed = UpsertGradeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the grade fields", details: parsed.error.flatten() },
      { status: 400 }
    );
  const input = parsed.data;
  const scope = await validateScope({
    schoolId: auth.user.schoolId,
    classroomId: input.classroomId,
    studentId: input.studentId,
    termId: input.termId,
  });
  if (!scope.ok) return scope.response;

  const admin = createAdminClient();
  const values = {
    school_id: auth.user.schoolId,
    classroom_id: input.classroomId,
    student_id: input.studentId,
    term_id: input.termId,
    subject: input.subject,
    assessment_name: input.assessmentName,
    percentage: input.percentage,
    grade_label: input.gradeLabel,
    comments: input.comments || null,
    recorded_by_user_id: auth.user.userId,
  };
  const mutation = input.id
    ? admin
        .from("elementary_exam_grades")
        .update(values)
        .eq("id", input.id)
        .eq("school_id", auth.user.schoolId)
    : admin
        .from("elementary_exam_grades")
        .upsert(values, { onConflict: "term_id,student_id,subject,assessment_name" });
  const { data, error } = await mutation
    .select(
      "id, classroom_id, student_id, term_id, subject, assessment_name, percentage, grade_label, comments, updated_at"
    )
    .single();
  if (error || !data)
    return NextResponse.json(
      { error: "Could not save the grade", details: error?.message },
      { status: 500 }
    );
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "elementary_grade.upsert",
    target_table: "elementary_exam_grades",
    target_id: data.id as string,
    metadata: { classroom_id: input.classroomId, term_id: input.termId },
  });
  return NextResponse.json({
    grade: {
      id: data.id,
      classroomId: data.classroom_id,
      studentId: data.student_id,
      termId: data.term_id,
      subject: data.subject,
      assessmentName: data.assessment_name,
      percentage: Number(data.percentage),
      gradeLabel: data.grade_label,
      comments: data.comments,
      updatedAt: data.updated_at,
    },
  });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "teacher")
    return NextResponse.json({ error: "Teacher access required" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: "Invalid grade" }, { status: 400 });
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("elementary_exam_grades")
    .select("id, classroom_id, student_id, term_id, school_id")
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Grade not found" }, { status: 404 });
  const scope = await validateScope({
    schoolId: auth.user.schoolId,
    classroomId: row.classroom_id as string,
    studentId: row.student_id as string,
    termId: row.term_id as string,
  });
  if (!scope.ok) return scope.response;
  const { error } = await admin
    .from("elementary_exam_grades")
    .delete()
    .eq("id", id)
    .eq("school_id", auth.user.schoolId);
  if (error) return NextResponse.json({ error: "Could not delete the grade" }, { status: 500 });
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "elementary_grade.delete",
    target_table: "elementary_exam_grades",
    target_id: id,
  });
  return NextResponse.json({ ok: true });
}
