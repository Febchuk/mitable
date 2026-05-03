import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(400).nullable().optional(),
  kind: z.enum(["Daily", "Major", "Incident"]).optional(),
  sections: z.array(z.string().min(1).max(80)).min(1).max(20).optional(),
  iconTone: z.enum(["clay", "butter", "blue", "sage"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.kind !== undefined) update.kind = parsed.data.kind;
  if (parsed.data.sections !== undefined) update.sections = parsed.data.sections;
  if (parsed.data.iconTone !== undefined) update.icon_tone = parsed.data.iconTone;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;

  const { error } = await supabase.from("report_templates").update(update).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to update template", details: error.message },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "report_template.update",
    target_table: "report_templates",
    target_id: id,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from("report_templates").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to delete template", details: error.message },
      { status: 500 }
    );
  }
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "report_template.delete",
    target_table: "report_templates",
    target_id: id,
  });
  return NextResponse.json({ ok: true });
}
