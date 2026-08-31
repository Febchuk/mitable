import { NextResponse } from "next/server";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

/** Lists active teacher profiles and their current classroom assignments. */
export async function GET(request: Request) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { data: teachers, error } = await admin
    .from("users")
    .select("id, first_name, last_name, email, phone, status")
    .eq("school_id", auth.key.schoolId)
    .eq("role", "teacher")
    .eq("status", "active")
    .order("last_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const teacherIds = (teachers ?? []).map((teacher) => teacher.id);
  const { data: assignments, error: assignmentError } = teacherIds.length
    ? await admin
        .from("classroom_teacher_assignments")
        .select(
          "id, teacher_user_id, classroom_id, classroom_role, start_date, classrooms!inner(id, name, school_id)"
        )
        .in("teacher_user_id", teacherIds)
        .is("end_date", null)
        .eq("classrooms.school_id", auth.key.schoolId)
    : { data: [], error: null };
  if (assignmentError)
    return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  const byTeacher = new Map<string, unknown[]>();
  for (const assignment of assignments ?? []) {
    const list = byTeacher.get(assignment.teacher_user_id) ?? [];
    list.push(assignment);
    byTeacher.set(assignment.teacher_user_id, list);
  }
  return NextResponse.json({
    teachers: (teachers ?? []).map((teacher) => ({
      ...teacher,
      assignments: byTeacher.get(teacher.id) ?? [],
    })),
  });
}
