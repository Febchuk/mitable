import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { toAdminTemplateDto } from "@/lib/report-templates/admin-dto";
import { rowsToDb, TemplateSectionsSchema } from "@/lib/report-templates/sections";

const REPORTING_PERIOD_ENUM = z
  .enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "end_of_term"])
  .nullable()
  .optional();

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).nullable().optional(),
  kind: z.enum(["Daily", "Major", "Incident"]),
  templateSections: TemplateSectionsSchema,
  writingStyle: z.string().max(8000).optional().default(""),
  iconTone: z.enum(["clay", "butter", "blue", "sage"]).default("clay"),
  reportingPeriod: REPORTING_PERIOD_ENUM,
  contextModeDefault: z.enum(["history", "input_only"]).optional().default("history"),
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("report_templates")
    .select(
      "id, name, description, kind, sections, section_guidance, section_meta, writing_style, logo_url, icon_tone, is_active, reporting_period, context_mode_default, created_at, updated_at"
    )
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    templates: (data ?? []).map((row) => toAdminTemplateDto(row as Record<string, unknown>)),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;
  const { sections, section_guidance, section_meta } = rowsToDb(input.templateSections);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("report_templates")
    .insert({
      school_id: auth.user.schoolId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      sections,
      section_guidance,
      section_meta,
      writing_style: input.writingStyle ?? "",
      icon_tone: input.iconTone,
      reporting_period: input.reportingPeriod ?? null,
      context_mode_default: input.contextModeDefault ?? "history",
      created_by_user_id: auth.user.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to create template", details: error?.message },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "report_template.create",
    target_table: "report_templates",
    target_id: data.id as string,
    metadata: { name: input.name, kind: input.kind },
  });

  return NextResponse.json({ id: data.id });
}
