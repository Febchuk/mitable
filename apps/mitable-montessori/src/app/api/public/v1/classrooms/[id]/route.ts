import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { findClassroomInSchool, inaccessibleResource } from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().max(20).nullable().optional(),
    curriculumId: z.string().uuid().nullable().optional(),
    programTypes: z
      .array(z.enum(["montessori", "iep", "speech"]))
      .min(1)
      .max(3)
      .optional(),
  })
  .refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    "Provide a field to update"
  );

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("classrooms")
    .select("id, name, code, curriculum_id, program_types, created_at, updated_at")
    .eq("id", id)
    .eq("school_id", auth.key.schoolId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Classroom");
  return NextResponse.json({ classroom: data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  const { data: existing } = await findClassroomInSchool(id, auth.key.schoolId);
  if (!existing) return inaccessibleResource("Classroom");
  const input = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("classrooms")
    .update({
      name: input.name,
      code: input.code,
      curriculum_id: input.curriculumId,
      program_types: input.programTypes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("school_id", auth.key.schoolId)
    .select("id, name, code, curriculum_id, program_types, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.classroom.updated",
    target_table: "classrooms",
    target_id: id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ classroom: data });
}
