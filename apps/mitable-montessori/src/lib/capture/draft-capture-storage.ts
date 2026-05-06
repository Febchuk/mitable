/**
 * Browser-only stash for voice/note capture between "create report" and the
 * draft API call (Option A — not persisted in the database).
 */

import type { TokenMapEntry } from "@/lib/schemas/report";
import { TokenMapEntrySchema } from "@/lib/schemas/report";

export const REPORT_DRAFT_CAPTURE_PREFIX = "mitable:report-draft-capture:";

export function draftCaptureStorageKey(reportId: string): string {
  return `${REPORT_DRAFT_CAPTURE_PREFIX}${reportId}`;
}

export type StoredDraftCapture = {
  transcripts: string[];
  notes: string[];
  /** Roster tokens for every name fuzzy-matched in capture (multi-student transcripts). */
  tokenMap: TokenMapEntry[];
};

export function writeStoredDraftCapture(reportId: string, data: StoredDraftCapture): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(draftCaptureStorageKey(reportId), JSON.stringify(data));
  } catch {
    // Quota or private mode — draft will fall back to DB-only context.
  }
}

export function readStoredDraftCapture(reportId: string): StoredDraftCapture | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(draftCaptureStorageKey(reportId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const transcripts = Array.isArray(o.transcripts)
      ? o.transcripts.filter((t): t is string => typeof t === "string" && t.length > 0)
      : [];
    const notes = Array.isArray(o.notes)
      ? o.notes.filter((t): t is string => typeof t === "string" && t.length > 0)
      : [];
    const tokenMap: TokenMapEntry[] = [];
    if (Array.isArray(o.tokenMap)) {
      for (const item of o.tokenMap) {
        const p = TokenMapEntrySchema.safeParse(item);
        if (p.success) tokenMap.push(p.data);
      }
    }
    return { transcripts, notes, tokenMap };
  } catch {
    return null;
  }
}

export function clearStoredDraftCapture(reportId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(draftCaptureStorageKey(reportId));
  } catch {
    /* ignore */
  }
}
