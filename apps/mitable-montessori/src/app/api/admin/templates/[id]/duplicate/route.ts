import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";

const LOGO_BUCKET = "report-template-logos";

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/${LOGO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

function copyNameFromSource(name: string): string {
  const prefix = "Copy of ";
  const base = name.trim() || "Template";
  let next = `${prefix}${base}`;
  if (next.length > 120) next = next.slice(0, 120).trim();
  return next;
}

function extFromPath(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "png";
}

function contentTypeForExt(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Clone a school template into a new row (same sections, guidance, meta, style, etc.).
 * Optionally copies the logo object so the new template is independent in storage.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id: sourceId } = await ctx.params;

  const admin = createAdminClient();
  const { data: src, error: readErr } = await admin
    .from("report_templates")
    .select(
      "school_id, name, description, kind, sections, section_guidance, section_meta, writing_style, logo_url, icon_tone, is_active, reporting_period, context_mode_default"
    )
    .eq("id", sourceId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!src || (src.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const insertRow = {
    school_id: auth.user.schoolId,
    name: copyNameFromSource(src.name as string),
    description: (src.description as string | null) ?? null,
    kind: src.kind as string,
    sections: (src.sections as string[] | null) ?? [],
    section_guidance: (src.section_guidance as Record<string, string> | null) ?? {},
    section_meta: (src.section_meta as Record<string, unknown> | null) ?? {},
    writing_style: (src.writing_style as string | null) ?? "",
    logo_url: null as string | null,
    icon_tone: src.icon_tone as string,
    is_active: src.is_active as boolean,
    reporting_period: (src.reporting_period as string | null) ?? null,
    context_mode_default: ((src.context_mode_default as string | null) ?? "history") as string,
    created_by_user_id: auth.user.userId,
  };

  const { data: created, error: insErr } = await admin
    .from("report_templates")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr || !created) {
    return NextResponse.json(
      { error: "Failed to duplicate template", details: insErr?.message },
      { status: 500 }
    );
  }

  const newId = created.id as string;
  let logoCopied = false;
  const oldUrl = (src.logo_url as string | null) ?? null;
  if (oldUrl) {
    const oldPath = storagePathFromPublicUrl(oldUrl);
    if (oldPath) {
      const { data: blob, error: dlErr } = await admin.storage.from(LOGO_BUCKET).download(oldPath);
      if (!dlErr && blob) {
        const ext = extFromPath(oldPath);
        const newPath = `${auth.user.schoolId}/${newId}/logo-${Date.now()}.${ext}`;
        const buf = Buffer.from(await blob.arrayBuffer());
        const { error: upErr } = await admin.storage.from(LOGO_BUCKET).upload(newPath, buf, {
          contentType: contentTypeForExt(ext),
          upsert: false,
        });
        if (!upErr) {
          const { data: pub } = admin.storage.from(LOGO_BUCKET).getPublicUrl(newPath);
          const { error: upDbErr } = await admin
            .from("report_templates")
            .update({ logo_url: pub.publicUrl, updated_at: new Date().toISOString() })
            .eq("id", newId);
          if (!upDbErr) logoCopied = true;
        }
      }
    }
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "report_template.duplicate",
    target_table: "report_templates",
    target_id: newId,
    metadata: { source_id: sourceId, logo_copied: logoCopied },
  });

  return NextResponse.json({ id: newId });
}
