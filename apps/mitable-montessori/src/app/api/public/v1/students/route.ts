import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { findClassroomInSchool, inaccessibleResource } from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CreateStudentSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  preferredName: z.string().trim().min(1).max(120).nullable().optional(),
  birthDate: DateString.nullable().optional(),
  nicknames: z.array(z.string().trim().min(1).max(120)).max(20).optional().default([]),
  notes: z.string().max(5000).nullable().optional(),
  classroomId: z.string().uuid().nullable().optional(),
  enrollmentStartDate: DateString.optional(),
});

export async function GET(request: Request) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const classroomId = new URL(request.url).searchParams.get("classroomId");
  if (classroomId && !z.string().uuid().safeParse(classroomId).success) {
    return NextResponse.json({ error: "Invalid classroomId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const select = classroomId
    ? "id, first_name, last_name, preferred_name, birth_date, nicknames, notes, created_at, updated_at, student_classroom_enrollments!inner(classroom_id, start_date, end_date, is_primary)"
    : "id, first_name, last_name, preferred_name, birth_date, nicknames, notes, created_at, updated_at, student_classroom_enrollments(classroom_id, start_date, end_date, is_primary)";
  let query = admin
    .from("students")
    .select(select)
    .eq("school_id", auth.key.schoolId)
    .is("archived_at", null)
    .order("last_name")
    .order("first_name");
  if (classroomId) query = query.eq("student_classroom_enrollments.classroom_id", classroomId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ students: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const parsed = CreateStudentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  if (input.classroomId) {
    const { data: classroom } = await findClassroomInSchool(input.classroomId, auth.key.schoolId);
    if (!classroom) return inaccessibleResource("Classroom");
  }

  const admin = createAdminClient();
  const { data: student, error } = await admin
    .from("students")
    .insert({
      school_id: auth.key.schoolId,
      first_name: input.firstName,
      last_name: input.lastName,
      preferred_name: input.preferredName ?? null,
      birth_date: input.birthDate ?? null,
      nicknames: input.nicknames,
      notes: input.notes ?? null,
    })
    .select(
      "id, first_name, last_name, preferred_name, birth_date, nicknames, notes, created_at, updated_at"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (input.classroomId) {
    const { error: enrollmentError } = await admin.from("student_classroom_enrollments").insert({
      student_id: student.id,
      classroom_id: input.classroomId,
      start_date: input.enrollmentStartDate ?? new Date().toISOString().slice(0, 10),
      is_primary: true,
    });
    if (enrollmentError) {
      await admin.from("students").delete().eq("id", student.id);
      return NextResponse.json({ error: enrollmentError.message }, { status: 500 });
    }
  }

  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.student.created",
    target_table: "students",
    target_id: student.id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ student }, { status: 201 });
}
