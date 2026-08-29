import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { inaccessibleResource } from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const IdSchema = z.string().uuid();
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const UpdateStudentSchema = z
  .object({
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    preferredName: z.string().trim().min(1).max(120).nullable().optional(),
    birthDate: DateString.nullable().optional(),
    nicknames: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    notes: z.string().max(5000).nullable().optional(),
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
  if (!id) return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("students")
    .select(
      "id, first_name, last_name, preferred_name, birth_date, nicknames, notes, created_at, updated_at, student_classroom_enrollments(classroom_id, start_date, end_date, is_primary)"
    )
    .eq("id", id)
    .eq("school_id", auth.key.schoolId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Student");
  return NextResponse.json({ student: data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const id = await idFromContext(context);
  if (!id) return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  const parsed = UpdateStudentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const update = {
    ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
    ...(input.lastName !== undefined ? { last_name: input.lastName } : {}),
    ...(input.preferredName !== undefined ? { preferred_name: input.preferredName } : {}),
    ...(input.birthDate !== undefined ? { birth_date: input.birthDate } : {}),
    ...(input.nicknames !== undefined ? { nicknames: input.nicknames } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("students")
    .update(update)
    .eq("id", id)
    .eq("school_id", auth.key.schoolId)
    .is("archived_at", null)
    .select(
      "id, first_name, last_name, preferred_name, birth_date, nicknames, notes, created_at, updated_at"
    )
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Student");
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.student.updated",
    target_table: "students",
    target_id: id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ student: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const id = await idFromContext(context);
  if (!id) return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("students")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("school_id", auth.key.schoolId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Student");
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.student.archived",
    target_table: "students",
    target_id: id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ ok: true });
}
