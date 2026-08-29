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
const CreateReportSchema = z.object({
  studentId: z.string().uuid(),
  classroomId: z.string().uuid(),
  type: z.enum(["daily", "major"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).nullable().optional(),
  reportDate: DateString.optional(),
  periodStart: DateString.nullable().optional(),
  periodEnd: DateString.nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const studentId = new URL(request.url).searchParams.get("studentId");
  if (studentId && !z.string().uuid().safeParse(studentId).success) {
    return NextResponse.json({ error: "Invalid studentId" }, { status: 400 });
  }
  if (studentId) {
    const { data: student } = await findStudentInSchool(studentId, auth.key.schoolId);
    if (!student) return inaccessibleResource("Student");
  }
  const admin = createAdminClient();
  let query = admin
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, period_start, period_end, report_date, status, title, created_at, updated_at, students!inner(school_id)"
    )
    .eq("students.school_id", auth.key.schoolId)
    .order("created_at", { ascending: false });
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const reports = (data ?? []).map(({ students: _student, ...report }) => report);
  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const parsed = CreateReportSchema.safeParse(await request.json().catch(() => null));
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
    .from("reports")
    .insert({
      student_id: input.studentId,
      classroom_id: input.classroomId,
      report_type: input.type,
      title: input.title,
      body: input.body ?? null,
      report_date: input.reportDate ?? new Date().toISOString().slice(0, 10),
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      status: "draft",
    })
    .select(
      "id, student_id, classroom_id, report_type, period_start, period_end, report_date, status, title, body, created_at, updated_at"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.report.created",
    target_table: "reports",
    target_id: data.id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ report: data }, { status: 201 });
}
