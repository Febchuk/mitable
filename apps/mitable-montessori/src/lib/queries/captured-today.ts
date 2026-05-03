import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";

export type CapturedTodayCounts = Record<string, { voice: number; photos: number }>;

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Today's voice/photo capture counts grouped by student id, scoped to the
 * caller's active classroom. Drives the "Captured today" group at the top
 * of the new-report child picker.
 */
export async function listCapturedTodayByChild(): Promise<CapturedTodayCounts> {
  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) return {};

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("commands")
    .select("payload, source")
    .eq("classroom_id", classroom.id)
    .gte("created_at", startOfTodayIso())
    .in("source", ["voice", "photo"]);

  if (error || !data) {
    if (error) console.error("listCapturedTodayByChild failed", error);
    return {};
  }

  const counts: CapturedTodayCounts = {};
  for (const row of data as Array<{ payload: { student_id?: string } | null; source: string }>) {
    const studentId = row.payload?.student_id;
    if (!studentId) continue;
    const slot = counts[studentId] ?? { voice: 0, photos: 0 };
    if (row.source === "voice") slot.voice += 1;
    else if (row.source === "photo") slot.photos += 1;
    counts[studentId] = slot;
  }
  return counts;
}
