import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { toAdminTemplateDto } from "@/lib/report-templates/admin-dto";
import { rowsToDb, TemplateSectionsSchema } from "@/lib/report-templates/sections";

const LOGO_BUCKET = "report-template-logos";

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/${LOGO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

async function removeLogoObjectIfAny(
  supabase: ReturnType<typeof createAdminClient>,
  url: string | null
) {
  if (!url) return;
  const path = storagePathFromPublicUrl(url);
  if (!path) return;
  await supabase.storage.from(LOGO_BUCKET).remove([path]);
}

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(400).nullable().optional(),
  kind: z.enum(["Daily", "Major", "Incident"]).optional(),
  templateSections: TemplateSectionsSchema.optional(),
  writingStyle: z.string().max(8000).optional(),
  iconTone: z.enum(["clay", "butter", "blue", "sage"]).optional(),
  isActive: z.boolean().optional(),
  reportingPeriod: z
    .enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "end_of_term"])
    .nullable()
    .optional(),
  contextModeDefault: z.enum(["history", "input_only"]).optional(),
  /** Set `true` to remove the logo file and clear `logo_url`. */
  clearLogo: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("report_templates")
    .select(
      "id, name, description, kind, sections, section_guidance, section_meta, writing_style, logo_url, icon_tone, is_active, reporting_period, context_mode_default, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ template: toAdminTemplateDto(data as Record<string, unknown>) });
}

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
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("report_templates")
    .select("id, school_id, logo_url")
    .eq("id", id)
    .maybeSingle();
  if (!existing || (existing.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.kind !== undefined) update.kind = parsed.data.kind;
  if (parsed.data.templateSections !== undefined) {
    const db = rowsToDb(parsed.data.templateSections);
    update.sections = db.sections;
    update.section_guidance = db.section_guidance;
    update.section_meta = db.section_meta;
  }
  if (parsed.data.writingStyle !== undefined) update.writing_style = parsed.data.writingStyle;
  if (parsed.data.iconTone !== undefined) update.icon_tone = parsed.data.iconTone;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;
  if (parsed.data.reportingPeriod !== undefined)
    update.reporting_period = parsed.data.reportingPeriod;
  if (parsed.data.contextModeDefault !== undefined)
    update.context_mode_default = parsed.data.contextModeDefault;

  if (parsed.data.clearLogo) {
    await removeLogoObjectIfAny(admin, (existing.logo_url as string | null) ?? null);
    update.logo_url = null;
  }

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

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("report_templates")
    .select("school_id, logo_url")
    .eq("id", id)
    .maybeSingle();
  if (!existing || (existing.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await removeLogoObjectIfAny(admin, (existing.logo_url as string | null) ?? null);

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
