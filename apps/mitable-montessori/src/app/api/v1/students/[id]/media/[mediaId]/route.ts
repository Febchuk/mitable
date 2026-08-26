import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit/log";
import { requireStudentMediaAccess } from "@/lib/media/access";
import { STUDENT_MEDIA_BUCKET } from "@/lib/media/constants";
import { createAdminClient } from "@/utils/supabase/admin";

/** Retracts a shared item and removes its private object from school storage. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  const { id: studentId, mediaId } = await params;
  const access = await requireStudentMediaAccess(studentId);
  if (!access.ok) return access.response;

  const admin = createAdminClient();
  const { data: media } = await admin
    .from("student_media")
    .select("id, school_id, student_id, storage_path, kind, byte_size, status")
    .eq("id", mediaId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!media || media.school_id !== access.access.student.school_id || media.status === "deleted") {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const { error: removeError } = await admin.storage
    .from(STUDENT_MEDIA_BUCKET)
    .remove([media.storage_path]);
  if (removeError)
    return NextResponse.json({ error: "Couldn't remove the stored media" }, { status: 500 });

  const deletedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("student_media")
    .update({ status: "deleted", deleted_at: deletedAt })
    .eq("id", mediaId);
  if (updateError)
    return NextResponse.json({ error: "Couldn't finish removing this media" }, { status: 500 });

  await auditLog({
    actor_id: access.access.user.userId,
    actor_role: access.access.user.role,
    action: "student_media.deleted",
    target_table: "student_media",
    target_id: mediaId,
    metadata: { student_id: studentId, kind: media.kind, byte_size: media.byte_size },
  });

  return NextResponse.json({ ok: true });
}
