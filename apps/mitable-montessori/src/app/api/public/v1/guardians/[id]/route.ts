import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { findGuardianInSchool, inaccessibleResource } from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const PatchSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    preferredContactMethod: z.enum(["email", "phone", "either"]).optional(),
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
    .from("guardians")
    .select(
      "id, first_name, last_name, email, phone, preferred_contact_method, auth_user_id, onboarding_completed_at, created_at, updated_at"
    )
    .eq("id", id)
    .eq("school_id", auth.key.schoolId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return inaccessibleResource("Guardian");
  const { auth_user_id, ...guardian } = data;
  return NextResponse.json({ guardian: { ...guardian, accountActive: Boolean(auth_user_id) } });
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
  const { data: existing } = await findGuardianInSchool(id, auth.key.schoolId);
  if (!existing) return inaccessibleResource("Guardian");
  const input = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("guardians")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      preferred_contact_method: input.preferredContactMethod,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("school_id", auth.key.schoolId)
    .select(
      "id, first_name, last_name, email, phone, preferred_contact_method, created_at, updated_at"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.guardian.updated",
    target_table: "guardians",
    target_id: id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ guardian: data });
}
