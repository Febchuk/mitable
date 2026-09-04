import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherForClassroom, requireUser } from "@/lib/api/auth";
import { isElementaryClassroomCode } from "@/lib/app/active-classroom";
import { auditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/utils/supabase/admin";

const UpsertTermCommentSchema = z.object({
  classroomId: z.string().uuid(),
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  comment: z.string().trim().max(4000).nullable(),
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

  const parsed = UpsertTermCommentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the comment fields", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const scope = await validateScope({ ...input, schoolId: auth.user.schoolId });
  if (!scope.ok) return scope.response;

  const admin = createAdminClient();
  const comment = input.comment?.trim() || null;

  if (!comment) {
    const { error } = await admin
      .from("elementary_term_grade_comments")
      .delete()
      .eq("school_id", auth.user.schoolId)
      .eq("classroom_id", input.classroomId)
      .eq("student_id", input.studentId)
      .eq("term_id", input.termId);
    if (error) return NextResponse.json({ error: "Could not clear the comment" }, { status: 500 });
  } else {
    const { error } = await admin.from("elementary_term_grade_comments").upsert(
      {
        school_id: auth.user.schoolId,
        classroom_id: input.classroomId,
        student_id: input.studentId,
        term_id: input.termId,
        comment,
        recorded_by_user_id: auth.user.userId,
      },
      { onConflict: "term_id,classroom_id,student_id" }
    );
    if (error) return NextResponse.json({ error: "Could not save the comment" }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "elementary_grade_comment.upsert",
    target_table: "elementary_term_grade_comments",
    metadata: {
      classroom_id: input.classroomId,
      student_id: input.studentId,
      term_id: input.termId,
      cleared: !comment,
    },
  });
  return NextResponse.json({ comment });
}
