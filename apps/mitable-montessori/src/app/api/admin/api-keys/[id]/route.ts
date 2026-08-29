import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/admin-auth";
import { auditLog } from "@/lib/audit/log";
import { adminExternalApiEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/utils/supabase/admin";

const IdSchema = z.string().uuid();

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!adminExternalApiEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const id = (await context.params).id;
  if (!IdSchema.safeParse(id).success)
    return NextResponse.json({ error: "Invalid key id" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "API key not found or already revoked" }, { status: 404 });

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "external_api_key.revoked",
    target_table: "external_api_keys",
    target_id: id,
  });
  return NextResponse.json({ ok: true });
}
