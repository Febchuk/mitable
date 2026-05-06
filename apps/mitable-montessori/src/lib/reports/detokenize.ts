import type { ReportReferenceSet } from "@/lib/reports/data-adapter";

/**
 * Replaces tokens in `text` with the human-readable display strings from the
 * reference set. Used only on the client for review UX — the persisted body
 * keeps tokens so we can re-render against an updated reference set later
 * (e.g. if a student is renamed).
 */
export function detokenizeReportText(text: string, refs: ReportReferenceSet): string {
  let out = text;
  for (const r of refs.refs) {
    if (!r.display) continue;
    const re = new RegExp(escapeRegex(r.token), "g");
    out = out.replace(re, r.display);
  }
  return out;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
