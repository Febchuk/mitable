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

const TransferSchema = z.object({
  classroomId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Ends active enrollments and starts a new primary enrollment atomically. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const { id: studentId } = await context.params;
  const parsed = TransferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  const [studentResult, classroomResult] = await Promise.all([
    findStudentInSchool(studentId, auth.key.schoolId),
    findClassroomInSchool(parsed.data.classroomId, auth.key.schoolId),
  ]);
  if (!studentResult.data) return inaccessibleResource("Student");
  if (!classroomResult.data) return inaccessibleResource("Classroom");
  const admin = createAdminClient();
  const { data: enrollmentId, error } = await admin.rpc("transfer_student_classroom", {
    p_school_id: auth.key.schoolId,
    p_student_id: studentId,
    p_new_classroom_id: parsed.data.classroomId,
    p_start_date: parsed.data.startDate,
  });
  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes("not found") ? 404 : 409 }
    );
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.student.transferred",
    target_table: "student_classroom_enrollments",
    target_id: enrollmentId,
    metadata: { api_key_id: auth.key.id, student_id: studentId },
  });
  return NextResponse.json({ enrollmentId });
}
