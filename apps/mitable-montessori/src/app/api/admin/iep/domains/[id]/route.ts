import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  position: z.number().int().min(0).optional(),
});

async function loadOwnedDomain(id: string, schoolId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("iep_domains")
    .select("id, school_id")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data.school_id as string) !== schoolId) {
    return { ok: false as const, status: 404 as const };
  }
  return { ok: true as const, supabase };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const owned = await loadOwnedDomain(id, auth.user.schoolId);
  if (!owned.ok) return NextResponse.json({ error: "Not found" }, { status: owned.status });

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name.trim();
  if (parsed.data.position !== undefined) update.position = parsed.data.position;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await owned.supabase.from("iep_domains").update(update).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to update", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const owned = await loadOwnedDomain(id, auth.user.schoolId);
  if (!owned.ok) return NextResponse.json({ error: "Not found" }, { status: owned.status });

  // Soft-delete: comments + states under this domain's items keep referencing
  // their items (which we also archive via the items table archived_at).
  const now = new Date().toISOString();
  const { error: dErr } = await owned.supabase
    .from("iep_domains")
    .update({ archived_at: now })
    .eq("id", id);
  if (dErr) {
    return NextResponse.json(
      { error: "Failed to archive domain", details: dErr.message },
      { status: 500 }
    );
  }
  await owned.supabase.from("iep_items").update({ archived_at: now }).eq("domain_id", id);
  return NextResponse.json({ ok: true });
}
