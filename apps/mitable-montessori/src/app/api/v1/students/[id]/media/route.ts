import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { requireStudentMediaAccess } from "@/lib/media/access";
import {
  isAllowedMediaMimeType,
  maxMediaBytes,
  mediaExtension,
  STUDENT_MEDIA_BUCKET,
  STUDENT_MEDIA_MIME_TYPES,
  type StudentMediaKind,
  type StudentMediaMimeType,
} from "@/lib/media/constants";
import { createAdminClient } from "@/utils/supabase/admin";

const StartUploadBody = z.object({
  kind: z.enum(["photo", "video"]),
  mimeType: z.enum(STUDENT_MEDIA_MIME_TYPES),
  byteSize: z.number().int().positive(),
});

type MediaRow = {
  id: string;
  kind: StudentMediaKind;
  mime_type: StudentMediaMimeType;
  byte_size: number;
  caption: string;
  status: "uploading" | "shared" | "deleted";
  shared_at: string | null;
  created_at: string;
  storage_path: string;
  users:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
};

/** Starts a one-use private Storage upload for a live camera capture. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await params;
  const access = await requireStudentMediaAccess(studentId);
  if (!access.ok) return access.response;

  const parsed = StartUploadBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid media upload" }, { status: 400 });
  const input = parsed.data;
  if (!isAllowedMediaMimeType(input.kind, input.mimeType)) {
    return NextResponse.json(
      { error: "That file type does not match the requested capture" },
      { status: 400 }
    );
  }
  if (input.byteSize > maxMediaBytes(input.kind)) {
    const limit = input.kind === "photo" ? "12 MB" : "100 MB";
    return NextResponse.json(
      { error: `${input.kind === "photo" ? "Photo" : "Video"} exceeds the ${limit} limit` },
      { status: 413 }
    );
  }

  const admin = createAdminClient();
  const mediaId = crypto.randomUUID();
  const storagePath = `${access.access.student.school_id}/${studentId}/${mediaId}.${mediaExtension(input.mimeType)}`;
  const { error: insertError } = await admin.from("student_media").insert({
    id: mediaId,
    school_id: access.access.student.school_id,
    student_id: studentId,
    uploaded_by_user_id: access.access.user.userId,
    kind: input.kind,
    mime_type: input.mimeType,
    byte_size: input.byteSize,
    storage_path: storagePath,
  });
  if (insertError) {
    return NextResponse.json({ error: "Couldn't prepare the media upload" }, { status: 500 });
  }

  const { data: signedUpload, error: signedUploadError } = await admin.storage
    .from(STUDENT_MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signedUploadError || !signedUpload) {
    await admin.from("student_media").delete().eq("id", mediaId);
    return NextResponse.json({ error: "Couldn't prepare private storage" }, { status: 500 });
  }

  await auditLog({
    actor_id: access.access.user.userId,
    actor_role: access.access.user.role,
    action: "student_media.upload_started",
    target_table: "student_media",
    target_id: mediaId,
    metadata: {
      student_id: studentId,
      kind: input.kind,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
    },
  });

  return NextResponse.json({
    mediaId,
    path: storagePath,
    token: signedUpload.token,
  });
}

/** Returns the teacher/admin library for one child with short-lived viewing links. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await params;
  const access = await requireStudentMediaAccess(studentId);
  if (!access.ok) return access.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_media")
    .select(
      "id, kind, mime_type, byte_size, caption, status, shared_at, created_at, storage_path, users:uploaded_by_user_id(first_name, last_name)"
    )
    .eq("student_id", studentId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Couldn't load media" }, { status: 500 });

  const items = await Promise.all(
    ((data ?? []) as MediaRow[]).map(async (item) => {
      const { data: signed } = await admin.storage
        .from(STUDENT_MEDIA_BUCKET)
        .createSignedUrl(item.storage_path, 60 * 60);
      const user = Array.isArray(item.users) ? item.users[0] : item.users;
      const uploadedBy = user
        ? [user.first_name, user.last_name].filter(Boolean).join(" ") || null
        : null;
      return {
        id: item.id,
        kind: item.kind,
        mimeType: item.mime_type,
        byteSize: item.byte_size,
        caption: item.caption,
        status: item.status,
        sharedAt: item.shared_at,
        createdAt: item.created_at,
        uploadedBy,
        url: signed?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ items });
}
