import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import { createClient } from "@/utils/supabase/server";

const StudentCommentSchema = z.object({
  studentId: z.string().uuid(),
  comment: z.string().trim().min(1).max(500),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = StudentCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) {
    return NextResponse.json({ error: "No active classroom" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // The child must be actively enrolled in the caller's classroom. RLS on the
  // projection would reject it anyway, but a clean 403 avoids a stray command.
  const { data: enrollment } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id")
    .eq("classroom_id", classroom.id)
    .eq("student_id", parsed.data.studentId)
    .is("end_date", null)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: "Student is not in the active classroom" }, { status: 403 });
  }

  // Command-sourced, same as progress: the apply_command_projection() trigger
  // writes the student_comments row (see 0041_student_comments.sql).
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("commands")
    .insert({
      client_id: `comment-${auth.user.userId}-${Date.now()}`,
      school_id: auth.user.schoolId,
      user_id: auth.user.userId,
      classroom_id: classroom.id,
      source: "text" as const,
      raw_transcript: null,
      command_type: "comment" as const,
      payload: {
        student_id: parsed.data.studentId,
        comment: parsed.data.comment,
      },
      created_at: now,
      approved_at: now,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "student_comment_created",
    target_table: "student_comments",
    metadata: {
      classroom_id: classroom.id,
      student_id: parsed.data.studentId,
    },
  });

  return NextResponse.json({ ok: true, commandId: data?.id ?? null });
}
