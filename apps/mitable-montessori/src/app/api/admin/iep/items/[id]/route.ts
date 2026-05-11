import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/api/admin-auth";

const UpdateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  position: z.number().int().min(0).optional(),
  domainId: z.string().uuid().optional(),
});

async function loadOwnedItem(id: string, schoolId: string) {
  const supabase = createAdminClient();
  const { data: item } = await supabase
    .from("iep_items")
    .select("id, domain_id, student_id")
    .eq("id", id)
    .maybeSingle();
  if (!item) return { ok: false as const, status: 404 as const };
  const { data: student } = await supabase
    .from("students")
    .select("school_id")
    .eq("id", item.student_id as string)
    .maybeSingle();
  if (!student || (student.school_id as string) !== schoolId) {
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

  const owned = await loadOwnedItem(id, auth.user.schoolId);
  if (!owned.ok) return NextResponse.json({ error: "Not found" }, { status: owned.status });

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name.trim();
  if (parsed.data.position !== undefined) update.position = parsed.data.position;
  if (parsed.data.domainId !== undefined) update.domain_id = parsed.data.domainId;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await owned.supabase.from("iep_items").update(update).eq("id", id);
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

  const owned = await loadOwnedItem(id, auth.user.schoolId);
  if (!owned.ok) return NextResponse.json({ error: "Not found" }, { status: owned.status });

  const { error } = await owned.supabase
    .from("iep_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to archive item", details: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
