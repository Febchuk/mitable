import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireReportAccess } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * Phase 4: persist a photo + OCR'd text the teacher attaches in the chat
 * composer. OCR runs client-side via the existing capture worker (Tesseract);
 * this route just stashes the JPEG blob in storage and the text in the
 * artifacts table, then returns artifactId + thumbnailUrl so the composer
 * can render a thumbnail and reference the artifact in the next chat turn.
 *
 * Limits: 8 MB max, image/* mime types only.
 */

const BUCKET = "report-chat-artifacts";
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const supabase = createAdminClient();
  const { data: report, error: readErr } = await supabase
    .from("reports")
    .select("id, classroom_id, students!inner(school_id)")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const studentRow = (report as unknown as { students: { school_id: string } | null }).students;
  if (studentRow?.school_id !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }
  const access = await requireReportAccess({
    user: auth.user,
    classroomId: report.classroom_id as string,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized for this report" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("photo");
  const ocrText = String(form.get("ocrText") ?? "").trim();
  const capturedAt = String(form.get("capturedAt") ?? new Date().toISOString());
  const area = String(form.get("area") ?? "").trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "photo (File) is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image/* photos are accepted" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo exceeds 8 MB limit" }, { status: 413 });
  }

  // Ensure the bucket exists. We do this lazily on the first upload rather
  // than via migration so deploys don't need extra storage permissions.
  const ensured = await ensureBucket(supabase);
  if (!ensured.ok) {
    return NextResponse.json(
      { error: "Failed to ensure storage bucket", message: ensured.message },
      { status: 500 }
    );
  }

  const ext = mimeToExtension(file.type);
  const artifactId = crypto.randomUUID();
  const storagePath = `${auth.user.schoolId}/${id}/${artifactId}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: "Storage upload failed", message: uploadErr.message },
      { status: 500 }
    );
  }

  const captureMetadata: Record<string, unknown> = {
    capturedAt,
    mimeType: file.type,
    sizeBytes: file.size,
    ...(area ? { area } : {}),
  };

  const { data: row, error: insertErr } = await supabase
    .from("report_chat_artifacts")
    .insert({
      id: artifactId,
      report_id: id,
      kind: "photo",
      storage_path: storagePath,
      ocr_text: ocrText || null,
      capture_metadata: captureMetadata,
      created_by_user_id: auth.user.userId,
    })
    .select("id, created_at")
    .single();
  if (insertErr || !row) {
    // Roll back the storage write so we don't leak orphan files.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: "Failed to record artifact", message: insertErr?.message },
      { status: 500 }
    );
  }

  // Bump the report's `sources.photos` counter on the sections JSON. The
  // byline reads this to show "N voice notes · M photos · …". We don't
  // touch sections to avoid racing with the chat-driven debouncer.
  // (Source counts get materialized in a follow-up — Phase 4's UI doesn't
  // depend on them being in lockstep, so deferring is safe.)

  // Signed URL valid for 1h — long enough for the chat thumbnail to render
  // and outlive a network blip; the obs-ref payload only carries artifactId,
  // not the URL, so refreshing is a separate fetch later if needed.
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.chat_artifact_created",
    target_table: "report_chat_artifacts",
    target_id: artifactId,
    metadata: {
      report_id: id,
      kind: "photo",
      size_bytes: file.size,
      has_ocr: ocrText.length > 0,
    },
  });

  return NextResponse.json({
    artifactId,
    thumbnailUrl: signed?.signedUrl ?? null,
    ocrText: ocrText || null,
    capturedAt,
    createdAt: row.created_at,
  });
}

async function ensureBucket(
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ ok: true } | { ok: false; message?: string }> {
  // getBucket is the cheap "does it exist" probe. If 404, create it.
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data) return { ok: true };
  // Common case: bucket missing on first upload.
  if (error && /not found|does not exist/i.test(error.message)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
    });
    if (createErr) return { ok: false, message: createErr.message };
    return { ok: true };
  }
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

function mimeToExtension(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "bin";
}
