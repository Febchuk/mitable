import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";

const LOGO_BUCKET = "report-template-logos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg"]);

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/svg+xml") return "svg";
  return "bin";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id: templateId } = await ctx.params;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("report_templates")
    .select("school_id, logo_url")
    .eq("id", templateId)
    .maybeSingle();
  if (!existing || (existing.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected multipart field `file`" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or smaller" }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: "Use PNG or JPG" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `${auth.user.schoolId}/${templateId}/logo-${Date.now()}.${extForMime(mime)}`;
  const { error: upErr } = await admin.storage.from(LOGO_BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: "Upload failed", details: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const logoUrl = pub.publicUrl;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error: dbErr } = await supabase
    .from("report_templates")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (dbErr) {
    await admin.storage.from(LOGO_BUCKET).remove([path]);
    return NextResponse.json(
      { error: "Failed to save logo URL", details: dbErr.message },
      { status: 500 }
    );
  }

  // Keep previous logo objects: shared reports and copied templates can still
  // reference them. Replacing branding must not break an already-sent report.

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "report_template.logo_upload",
    target_table: "report_templates",
    target_id: templateId,
    metadata: {},
  });

  return NextResponse.json({ logoUrl });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id: templateId } = await ctx.params;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("report_templates")
    .select("school_id, logo_url")
    .eq("id", templateId)
    .maybeSingle();
  if (!existing || (existing.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error: clearError } = await supabase
    .from("report_templates")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (clearError) return NextResponse.json({ error: "Could not remove the logo" }, { status: 500 });
  // Clear the template's choice while preserving logos on published reports.

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "report_template.logo_remove",
    target_table: "report_templates",
    target_id: templateId,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
