import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { inaccessibleResource } from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const IdSchema = z.string().uuid();
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const UpdateReportSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(20_000).nullable().optional(),
    reportDate: DateString.optional(),
    periodStart: DateString.nullable().optional(),
    periodEnd: DateString.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

async function idFromContext(context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  return IdSchema.safeParse(id).success ? id : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const id = await idFromContext(context);
  if (!id) return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, period_start, period_end, report_date, status, title, body, created_at, updated_at, students!inner(school_id)"
    )
    .eq("id", id)
    .eq("students.school_id", auth.key.schoolId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Report");
  const report = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "students"));
  return NextResponse.json({ report });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const id = await idFromContext(context);
  if (!id) return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
  const parsed = UpdateReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const update = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.reportDate !== undefined ? { report_date: input.reportDate } : {}),
    ...(input.periodStart !== undefined ? { period_start: input.periodStart } : {}),
    ...(input.periodEnd !== undefined ? { period_end: input.periodEnd } : {}),
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reports")
    .update(update)
    .eq("id", id)
    .eq("status", "draft")
    .in("student_id", await schoolStudentIds(auth.key.schoolId))
    .select(
      "id, student_id, classroom_id, report_type, period_start, period_end, report_date, status, title, body, created_at, updated_at"
    )
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Report");
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.report.updated",
    target_table: "reports",
    target_id: id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ report: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const id = await idFromContext(context);
  if (!id) return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reports")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .in("student_id", await schoolStudentIds(auth.key.schoolId))
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Report");
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.report.deleted",
    target_table: "reports",
    target_id: id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ ok: true });
}

async function schoolStudentIds(schoolId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("students").select("id").eq("school_id", schoolId);
  return (data ?? []).map((student) => student.id as string);
}
