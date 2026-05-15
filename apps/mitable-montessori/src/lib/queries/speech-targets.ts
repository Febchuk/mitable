import type { SupabaseClient } from "@supabase/supabase-js";

/** Ordered active speech target labels for a student (admin or service client). */
export async function fetchSpeechTargetLabels(
  supabase: SupabaseClient,
  studentId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("speech_targets")
    .select("label")
    .eq("student_id", studentId)
    .is("archived_at", null)
    .order("position", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => String((r as { label: string }).label ?? "").trim()).filter(Boolean);
}
