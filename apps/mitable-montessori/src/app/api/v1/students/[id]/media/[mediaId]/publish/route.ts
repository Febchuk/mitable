import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { requireStudentMediaAccess } from "@/lib/media/access";
import { STUDENT_MEDIA_BUCKET } from "@/lib/media/constants";
import { createAdminClient } from "@/utils/supabase/admin";

const Body = z.object({ caption: z.string().trim().max(600).default("") });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  const { id: studentId, mediaId } = await params;
  const access = await requireStudentMediaAccess(studentId);
  if (!access.ok) return access.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid caption" }, { status: 400 });

  const admin = createAdminClient();
  const { data: media } = await admin
    .from("student_media")
    .select("id, school_id, student_id, storage_path, kind, byte_size, status")
    .eq("id", mediaId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!media || media.school_id !== access.access.student.school_id) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  if (media.status !== "uploading") {
    return NextResponse.json({ error: "This media has already been handled" }, { status: 409 });
  }

  const pathParts = media.storage_path.split("/");
  const fileName = pathParts.pop();
  const { data: files, error: filesError } = await admin.storage
    .from(STUDENT_MEDIA_BUCKET)
    .list(pathParts.join("/"), { limit: 1, search: fileName });
  if (filesError || !files?.some((file) => file.name === fileName)) {
    return NextResponse.json({ error: "The camera upload has not finished yet" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("student_media")
    .update({ caption: parsed.data.caption, status: "shared", shared_at: now })
    .eq("id", mediaId);
  if (updateError)
    return NextResponse.json({ error: "Couldn't share this media" }, { status: 500 });

  await auditLog({
    actor_id: access.access.user.userId,
    actor_role: access.access.user.role,
    action: "student_media.shared",
    target_table: "student_media",
    target_id: mediaId,
    metadata: { student_id: studentId, kind: media.kind, byte_size: media.byte_size },
  });

  return NextResponse.json({ ok: true, sharedAt: now });
}
