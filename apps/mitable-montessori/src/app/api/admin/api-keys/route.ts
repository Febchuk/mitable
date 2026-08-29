import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/admin-auth";
import { auditLog } from "@/lib/audit/log";
import { createExternalApiKeyCredential, type ExternalApiScope } from "@/lib/api/external-api-key";
import { adminExternalApiEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/utils/supabase/admin";

const CreateKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z
    .array(z.enum(["read", "write"]))
    .min(1)
    .max(2)
    .optional()
    .default(["read", "write"]),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET() {
  if (!adminExternalApiEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_api_keys")
    .select("id, name, key_prefix, scopes, created_at, expires_at, revoked_at, last_used_at")
    .eq("school_id", auth.user.schoolId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ apiKeys: data ?? [] });
}

export async function POST(request: Request) {
  if (!adminExternalApiEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = CreateKeySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (parsed.data.expiresAt && new Date(parsed.data.expiresAt) <= new Date()) {
    return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
  }

  // The id must be known before the secret can be constructed. Generate a UUID
  // in application code, which matches the database's UUID primary-key type.
  const id = randomUUID();
  const credential = createExternalApiKeyCredential(id);
  const scopes = [...new Set(parsed.data.scopes)] as ExternalApiScope[];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_api_keys")
    .insert({
      id,
      school_id: auth.user.schoolId,
      name: parsed.data.name,
      key_hash: credential.keyHash,
      key_prefix: credential.keyPrefix,
      scopes,
      created_by_user_id: auth.user.userId,
      expires_at: parsed.data.expiresAt ?? null,
    })
    .select("id, name, key_prefix, scopes, created_at, expires_at, revoked_at, last_used_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "external_api_key.created",
    target_table: "external_api_keys",
    target_id: id,
    metadata: { scopes, key_name: parsed.data.name },
  });
  return NextResponse.json({ apiKey: data, secret: credential.credential }, { status: 201 });
}
