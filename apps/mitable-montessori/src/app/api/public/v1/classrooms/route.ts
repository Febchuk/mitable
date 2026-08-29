import { NextResponse } from "next/server";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";

const ClassroomSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(20).nullable().optional(),
  curriculumId: z.string().uuid().nullable().optional(),
  programTypes: z
    .array(z.enum(["montessori", "iep", "speech"]))
    .min(1)
    .max(3)
    .optional(),
});

/** Lists active classrooms belonging to the API key's school. */
export async function GET(request: Request) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("classrooms")
    .select("id, name, code, curriculum_id, created_at, updated_at")
    .eq("school_id", auth.key.schoolId)
    .eq("status", "active")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ classrooms: data ?? [] });
}

/** Creates an active classroom in the key's school. */
export async function POST(request: Request) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const parsed = ClassroomSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const admin = createAdminClient();
  const { data: classroom, error } = await admin
    .from("classrooms")
    .insert({
      school_id: auth.key.schoolId,
      name: input.name,
      code: input.code ?? null,
      curriculum_id: input.curriculumId ?? null,
      program_types: input.programTypes ?? ["montessori"],
      status: "active",
    })
    .select("id, name, code, curriculum_id, program_types, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.classroom.created",
    target_table: "classrooms",
    target_id: classroom.id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ classroom }, { status: 201 });
}
