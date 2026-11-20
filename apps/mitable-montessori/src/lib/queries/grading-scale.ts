import type { SupabaseClient } from "@supabase/supabase-js";
import { GradingScaleSchema, type GradingScale } from "@/lib/grades/grading-scale";

export async function getSchoolGradingScale(
  db: SupabaseClient,
  schoolId: string
): Promise<GradingScale | null> {
  const { data, error } = await db
    .from("elementary_grading_scales")
    .select("a_min, b_min, c_min")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return GradingScaleSchema.parse({
    aMin: Number(data.a_min),
    bMin: Number(data.b_min),
    cMin: Number(data.c_min),
  });
}
