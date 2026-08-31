import { cookies } from "next/headers";
import {
  STUDENT_MEDIA_BUCKET,
  type StudentMediaKind,
  type StudentMediaMimeType,
} from "@/lib/media/constants";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type ParentMediaItem = {
  id: string;
  kind: StudentMediaKind;
  mimeType: StudentMediaMimeType;
  caption: string;
  sharedAt: string;
  progressCommandId: string | null;
  url: string | null;
};

/**
 * The regular Supabase client performs the guardian RLS check first. Only
 * those authorized rows are then passed to the service client for a short
 * private viewing link; no permanent Storage URL is exposed to the parent.
 */
export async function listParentMedia(studentId: string): Promise<ParentMediaItem[]> {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("student_media")
    .select("id, kind, mime_type, caption, shared_at, storage_path, progress_command_id")
    .eq("student_id", studentId)
    .eq("status", "shared")
    .order("shared_at", { ascending: false })
    .limit(60);
  if (error) return [];

  const admin = createAdminClient();
  return Promise.all(
    (data ?? [])
      .filter((row) => row.shared_at)
      .map(async (row) => {
        const item = row as {
          id: string;
          kind: StudentMediaKind;
          mime_type: StudentMediaMimeType;
          caption: string;
          shared_at: string;
          storage_path: string;
          progress_command_id: string | null;
        };
        const { data: signed } = await admin.storage
          .from(STUDENT_MEDIA_BUCKET)
          .createSignedUrl(item.storage_path, 60 * 60);
        return {
          id: item.id,
          kind: item.kind,
          mimeType: item.mime_type,
          caption: item.caption,
          sharedAt: item.shared_at,
          progressCommandId: item.progress_command_id,
          url: signed?.signedUrl ?? null,
        };
      })
  );
}
