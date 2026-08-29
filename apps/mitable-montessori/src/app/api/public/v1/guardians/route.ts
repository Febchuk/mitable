import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const GuardianSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  preferredContactMethod: z.enum(["email", "phone", "either"]).optional(),
});

/** Lists guardian contact records. `email` is an exact, case-insensitive lookup. */
export async function GET(request: Request) {
  const auth = await requireExternalApiKey(request, "read");
  if (!auth.ok) return auth.response;
  const email = new URL(request.url).searchParams.get("email");
  const admin = createAdminClient();
  let query = admin
    .from("guardians")
    .select(
      "id, first_name, last_name, email, phone, preferred_contact_method, auth_user_id, onboarding_completed_at, created_at, updated_at"
    )
    .eq("school_id", auth.key.schoolId)
    .order("last_name");
  if (email) query = query.ilike("email", email);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    guardians: (data ?? []).map(({ auth_user_id, ...guardian }) => ({
      ...guardian,
      accountActive: Boolean(auth_user_id),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireExternalApiKey(request, "write");
  if (!auth.ok) return auth.response;
  const parsed = GuardianSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  const input = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("guardians")
    .insert({
      school_id: auth.key.schoolId,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      preferred_contact_method: input.preferredContactMethod ?? "either",
    })
    .select(
      "id, first_name, last_name, email, phone, preferred_contact_method, created_at, updated_at"
    )
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.guardian.created",
    target_table: "guardians",
    target_id: data.id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ guardian: data }, { status: 201 });
}
