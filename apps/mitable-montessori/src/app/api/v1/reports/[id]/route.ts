import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { getReport } from "@/lib/queries/reports";
import { UpdateReportRequestSchema } from "@/lib/schemas/report";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const report = await getReport(id);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ report });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = UpdateReportRequestSchema.safeParse(body);
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

  // RLS already constrains writes; this select also confirms the report exists
  // and the caller can see it (returns 404 either way).
  const { data: existing } = await supabase
    .from("reports")
    .select("id, status, created_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.body !== undefined) update.body = parsed.data.body;
  if (parsed.data.sections !== undefined) update.sections = parsed.data.sections;

  const { error } = await supabase.from("reports").update(update).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Failed to update report", details: error.message },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.update",
    target_table: "reports",
    target_id: id,
    metadata: {
      fields: Object.keys(parsed.data),
    },
  });

  return NextResponse.json({ ok: true });
}
