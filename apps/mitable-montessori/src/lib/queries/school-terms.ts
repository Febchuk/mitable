import type { SupabaseClient } from "@supabase/supabase-js";

export type SchoolTerm = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  sortOrder: number;
};

export type SchoolTermPeriod = {
  termId: string;
  termName: string;
  periodStart: string;
  periodEnd: string;
};

function rowToTerm(row: Record<string, unknown>): SchoolTerm {
  return {
    id: row.id as string,
    name: row.name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

export async function listSchoolTerms(
  supabase: SupabaseClient,
  schoolId: string
): Promise<SchoolTerm[]> {
  const { data, error } = await supabase
    .from("school_terms")
    .select("id, name, start_date, end_date, sort_order")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToTerm(r as Record<string, unknown>));
}

/**
 * Resolve the reporting window for an end-of-term report.
 * Prefers the term that contains `asOf`; otherwise the most recent term that
 * has already started. Returns null when the school has no terms configured.
 */
export async function resolveEndOfTermPeriod(
  supabase: SupabaseClient,
  schoolId: string,
  asOf: Date = new Date()
): Promise<SchoolTermPeriod | null> {
  const day = asOf.toISOString().slice(0, 10);

  const { data: active } = await supabase
    .from("school_terms")
    .select("id, name, start_date, end_date")
    .eq("school_id", schoolId)
    .lte("start_date", day)
    .gte("end_date", day)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active) {
    const end = day < (active.end_date as string) ? day : (active.end_date as string);
    return {
      termId: active.id as string,
      termName: active.name as string,
      periodStart: active.start_date as string,
      periodEnd: end,
    };
  }

  const { data: latest } = await supabase
    .from("school_terms")
    .select("id, name, start_date, end_date")
    .eq("school_id", schoolId)
    .lte("start_date", day)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return null;

  const end = day < (latest.end_date as string) ? day : (latest.end_date as string);
  return {
    termId: latest.id as string,
    termName: latest.name as string,
    periodStart: latest.start_date as string,
    periodEnd: end,
  };
}
