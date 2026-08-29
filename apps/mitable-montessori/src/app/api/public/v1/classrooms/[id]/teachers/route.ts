import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import {
  findClassroomInSchool,
  findTeacherInSchool,
  inaccessibleResource,
} from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const AssignSchema = z.object({
  teacherId: z.string().uuid(),
  role: z.enum(["lead", "support", "assistant"]).default("support"),
  startDate: DateString.optional(),
});
const UnassignSchema = z.object({ assignmentId: z.string().uuid(), endDate: DateString });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const { data: classroom } = await findClassroomInSchool(id, auth.key.schoolId);
  if (!classroom) return inaccessibleResource("Classroom");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("classroom_teacher_assignments")
    .select(
      "id, teacher_user_id, classroom_id, classroom_role, start_date, end_date, users!inner(id, first_name, last_name, email, school_id)"
    )
    .eq("classroom_id", id)
    .eq("users.school_id", auth.key.schoolId)
    .is("end_date", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const { id: classroomId } = await context.params;
  const parsed = AssignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  const [classroomResult, teacherResult] = await Promise.all([
    findClassroomInSchool(classroomId, auth.key.schoolId),
    findTeacherInSchool(parsed.data.teacherId, auth.key.schoolId),
  ]);
  if (!classroomResult.data) return inaccessibleResource("Classroom");
  if (!teacherResult.data) return inaccessibleResource("Teacher");
  const admin = createAdminClient();
  if (parsed.data.role === "lead")
    await admin
      .from("classroom_teacher_assignments")
      .update({ classroom_role: "support" })
      .eq("classroom_id", classroomId)
      .eq("classroom_role", "lead")
      .is("end_date", null);
  const { data, error } = await admin
    .from("classroom_teacher_assignments")
    .insert({
      teacher_user_id: parsed.data.teacherId,
      classroom_id: classroomId,
      classroom_role: parsed.data.role,
      start_date: parsed.data.startDate ?? new Date().toISOString().slice(0, 10),
    })
    .select("id, teacher_user_id, classroom_id, classroom_role, start_date, end_date")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.teacher.assigned",
    target_table: "classroom_teacher_assignments",
    target_id: data.id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ assignment: data }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const { id: classroomId } = await context.params;
  const parsed = UnassignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  const { data: classroom } = await findClassroomInSchool(classroomId, auth.key.schoolId);
  if (!classroom) return inaccessibleResource("Classroom");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("classroom_teacher_assignments")
    .update({ end_date: parsed.data.endDate })
    .eq("id", parsed.data.assignmentId)
    .eq("classroom_id", classroomId)
    .is("end_date", null)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Assignment");
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.teacher.unassigned",
    target_table: "classroom_teacher_assignments",
    target_id: parsed.data.assignmentId,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ ok: true });
}
