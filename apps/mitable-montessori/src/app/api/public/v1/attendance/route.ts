import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import {
  findClassroomInSchool,
  findStudentInSchool,
  inaccessibleResource,
} from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const AttendanceSchema = z.object({
  studentId: z.string().uuid(),
  classroomId: z.string().uuid(),
  date: DateString,
  status: z.enum(["present", "absent"]),
  comment: z.string().max(2000).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const classroomId = url.searchParams.get("classroomId");
  if (date && !DateString.safeParse(date).success)
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (classroomId && !z.string().uuid().safeParse(classroomId).success) {
    return NextResponse.json({ error: "Invalid classroomId" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("attendance_records")
    .select(
      "id, student_id, classroom_id, attendance_date, status, comment, created_at, updated_at, students!inner(school_id)"
    )
    .eq("students.school_id", auth.key.schoolId)
    .order("attendance_date", { ascending: false });
  if (date) query = query.eq("attendance_date", date);
  if (classroomId) query = query.eq("classroom_id", classroomId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const attendance = (data ?? []).map(({ students: _student, ...record }) => record);
  return NextResponse.json({ attendance });
}

export async function POST(request: Request) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const parsed = AttendanceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const [{ data: student }, { data: classroom }] = await Promise.all([
    findStudentInSchool(input.studentId, auth.key.schoolId),
    findClassroomInSchool(input.classroomId, auth.key.schoolId),
  ]);
  if (!student) return inaccessibleResource("Student");
  if (!classroom) return inaccessibleResource("Classroom");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("attendance_records")
    .upsert(
      {
        student_id: input.studentId,
        classroom_id: input.classroomId,
        attendance_date: input.date,
        status: input.status,
        comment: input.comment ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,attendance_date" }
    )
    .select(
      "id, student_id, classroom_id, attendance_date, status, comment, created_at, updated_at"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.attendance.upserted",
    target_table: "attendance_records",
    target_id: data.id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ attendance: data });
}
