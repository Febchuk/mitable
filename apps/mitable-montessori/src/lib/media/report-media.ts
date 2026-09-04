import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STUDENT_MEDIA_BUCKET,
  type StudentMediaKind,
  type StudentMediaMimeType,
} from "@/lib/media/constants";

export type ReportMediaItem = {
  id: string;
  kind: StudentMediaKind;
  mimeType: StudentMediaMimeType;
  caption: string;
  url: string | null;
};

type ReportMediaRow = {
  id: string;
  kind: StudentMediaKind;
  mime_type: StudentMediaMimeType;
  caption: string;
  storage_path: string;
};

/** Resolve the shared media attached to one saved toddler log. */
export async function listToddlerReportMedia(
  supabase: SupabaseClient,
  toddlerDailyLogId: string | null | undefined
): Promise<ReportMediaItem[]> {
  if (!toddlerDailyLogId) return [];
  const { data, error } = await supabase
    .from("student_media")
    .select("id, kind, mime_type, caption, storage_path")
    .eq("toddler_daily_log_id", toddlerDailyLogId)
    .eq("status", "shared")
    .order("created_at", { ascending: true });
  if (error) return [];

  return Promise.all(
    ((data ?? []) as ReportMediaRow[]).map(async (item) => {
      const { data: signed } = await supabase.storage
        .from(STUDENT_MEDIA_BUCKET)
        .createSignedUrl(item.storage_path, 60 * 60);
      return {
        id: item.id,
        kind: item.kind,
        mimeType: item.mime_type,
        caption: item.caption,
        url: signed?.signedUrl ?? null,
      };
    })
  );
}
