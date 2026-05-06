import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireTeacherForClassroom, requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

const DeleteRequestSchema = z.object({
  student_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Removes today's attendance mark for a student — used by the register UI
 * when a teacher clicks the active Present/Absent button to undo.
 *
 * RLS on `attendance_records` only exposes SELECT, so reading goes through
 * the user-scoped client (it also gates which rows the caller can see). The
 * actual DELETE uses the service-role client because there is no user-scoped
 * DELETE policy on the projection — projections are normally maintained by
 * the commands trigger. We compensate by checking the caller is an active
 * teacher for the row's classroom (or an admin) before deleting.
 */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = DeleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, classroom_id, students!inner(school_id)")
    .eq("student_id", parsed.data.student_id)
    .eq("attendance_date", parsed.data.date)
    .maybeSingle();

  if (!existing) {
    // Already gone (or never existed) — treat as a no-op success.
    return NextResponse.json({ ok: true });
  }
  const studentSchool = (existing as unknown as { students: { school_id: string } | null }).students
    ?.school_id;
  if (studentSchool !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }

  const classroomId = existing.classroom_id as string;
  const allowed = auth.user.role === "admin" || (await requireTeacherForClassroom(classroomId));
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("attendance_records").delete().eq("id", existing.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "attendance.unmark",
    target_table: "attendance_records",
    target_id: existing.id as string,
    metadata: {
      student_id: parsed.data.student_id,
      date: parsed.data.date,
    },
  });

  return NextResponse.json({ ok: true });
}
