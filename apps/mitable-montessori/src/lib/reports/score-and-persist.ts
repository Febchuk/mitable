/**
 * Score-and-persist helper. Wraps `scoreReport` with the DB write so call
 * sites (POST /submit, PATCH /:id) don't repeat the boilerplate.
 *
 * Errors are logged and re-thrown — the caller decides whether to surface
 * a 500 (synchronous /submit path) or swallow it (fire-and-forget autosave).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreReport, type ScorerInput, type ScorerResult } from "./scorer";

type ReportSectionDB = { heading: string; paragraphs: Array<{ html: string }> } | null;

export async function scoreAndPersistReport(args: {
  supabase: SupabaseClient;
  reportId: string;
}): Promise<ScorerResult | null> {
  const { supabase, reportId } = args;

  const { data: row, error: loadErr } = await supabase
    .from("reports")
    .select("id, report_type, title, body, sections")
    .eq("id", reportId)
    .maybeSingle();
  if (loadErr) {
    console.error("scoreAndPersistReport: load failed", loadErr);
    throw loadErr;
  }
  if (!row) {
    throw new Error(`Report ${reportId} not found for scoring`);
  }

  const typed = row as {
    id: string;
    report_type: "daily" | "major" | "incident";
    title: string | null;
    body: string | null;
    sections: ReportSectionDB[] | null;
  };

  const input: ScorerInput = {
    reportType: typed.report_type,
    title: typed.title,
    sections:
      Array.isArray(typed.sections) && typed.sections.length > 0
        ? (typed.sections as Array<{ heading: string; paragraphs: Array<{ html: string }> }>)
        : null,
    body: typed.body,
  };

  const result = await scoreReport(input);

  const { error: writeErr } = await supabase
    .from("reports")
    .update({
      ai_score: result.score,
      ai_flags: result.flags,
      ai_reasoning: result.reasoning,
      ai_scored_at: new Date().toISOString(),
    })
    .eq("id", reportId);
  if (writeErr) {
    console.error("scoreAndPersistReport: write failed", writeErr);
    throw writeErr;
  }

  return result;
}
