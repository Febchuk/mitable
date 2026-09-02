import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEndOfTermPeriod } from "@/lib/queries/school-terms";

/**
 * @deprecated Hardcoded fallback only — prefer `resolveEndOfTermPeriod` from DB.
 * Academic term boundaries (Sep / Jan / Apr) when no school terms exist yet.
 */
export function currentTermStartDate(asOf: Date = new Date()): string {
  const year = asOf.getFullYear();
  const month = asOf.getMonth();
  let start: Date;
  if (month >= 8) start = new Date(year, 8, 1);
  else if (month >= 3) start = new Date(year, 3, 1);
  else start = new Date(year, 0, 1);
  return start.toISOString().slice(0, 10);
}

/** End-of-term lookback: school terms from DB, or calendar fallback. */
export async function endOfTermPeriodBounds(
  supabase: SupabaseClient,
  schoolId: string,
  asOf: Date = new Date()
): Promise<{
  periodStart: string;
  periodEnd: string;
  termName: string | null;
  termId: string | null;
}> {
  const periodEnd = asOf.toISOString().slice(0, 10);
  const resolved = await resolveEndOfTermPeriod(supabase, schoolId, asOf);
  if (resolved) {
    return {
      periodStart: resolved.periodStart,
      periodEnd: resolved.periodEnd,
      termName: resolved.termName,
      termId: resolved.termId,
    };
  }
  return {
    periodStart: currentTermStartDate(asOf),
    periodEnd,
    termName: null,
    termId: null,
  };
}
