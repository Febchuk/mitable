import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).nullable().optional(),
  kind: z.enum(["Daily", "Major", "Incident"]),
  sections: z.array(z.string().min(1).max(80)).min(1).max(20),
  iconTone: z.enum(["clay", "butter", "blue", "sage"]).default("clay"),
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
    .select("id, name, description, kind, sections, icon_tone, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ templates: data });
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

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("report_templates")
    .insert({
      school_id: auth.user.schoolId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      sections: input.sections,
      icon_tone: input.iconTone,
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
