import { requireUser, type AuthedUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";

type MediaStudent = { id: string; school_id: string };

type MediaAccess = {
  user: AuthedUser;
  student: MediaStudent;
};

/**
 * Media uploads bypass ordinary table RLS so that we can issue a one-use
 * Storage upload token. Keep the more specific staff/classroom check here,
 * rather than relying on a broad school-wide student read policy.
 */
export async function requireStudentMediaAccess(
  studentId: string
): Promise<{ ok: true; access: MediaAccess } | { ok: false; response: Response }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("id, school_id")
    .eq("id", studentId)
    .is("archived_at", null)
    .maybeSingle<MediaStudent>();
  if (!student) {
    return {
      ok: false,
      response: Response.json({ error: "Child not found" }, { status: 404 }),
    };
  }
  if (student.school_id !== auth.user.schoolId) {
    return {
      ok: false,
      response: Response.json({ error: "Child is not in your school" }, { status: 403 }),
    };
  }
  if (auth.user.role === "admin") return { ok: true, access: { user: auth.user, student } };

  const { data: assignments } = await admin
    .from("classroom_teacher_assignments")
    .select("classroom_id")
    .eq("teacher_user_id", auth.user.userId)
    .is("end_date", null);
  const classroomIds = (assignments ?? []).map((row) => row.classroom_id as string);
  if (classroomIds.length === 0) {
    return {
      ok: false,
      response: Response.json({ error: "No active classroom assignment" }, { status: 403 }),
    };
  }

  const { data: enrollment } = await admin
    .from("student_classroom_enrollments")
    .select("id")
    .eq("student_id", studentId)
    .in("classroom_id", classroomIds)
    .is("end_date", null)
    .maybeSingle();
  if (!enrollment) {
    return {
      ok: false,
      response: Response.json(
        { error: "You are not assigned to this child's classroom" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, access: { user: auth.user, student } };
}
