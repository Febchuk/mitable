/**
 * Structured progress-grid rows for the built-in "From progress" report template.
 * Stored in the first paragraph's `html` as a prefixed JSON blob (same pattern
 * as checklist / single_select fields).
 */

import { STATUS_LABEL, type CurriculumStatusValue } from "@/components/montessori/data";

const PREFIX = "__MITABLE_PROGRESS_TOPIC_V1__";

export type ProgressTopicRow = {
  subtopicId: string;
  name: string;
  status: Exclude<CurriculumStatusValue, "na">;
  comment: string | null;
};

export function encodeProgressTopic(rows: ProgressTopicRow[]): string {
  return PREFIX + JSON.stringify({ rows });
}

export function decodeProgressTopic(html: string): ProgressTopicRow[] | null {
  const trimmed = html.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  try {
    const o = JSON.parse(trimmed.slice(PREFIX.length)) as { rows?: unknown };
    if (!Array.isArray(o.rows)) return null;
    const rows: ProgressTopicRow[] = [];
    for (const r of o.rows) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const status = row.status;
      if (status !== "introduced" && status !== "practicing" && status !== "mastered") continue;
      if (typeof row.subtopicId !== "string" || typeof row.name !== "string") continue;
      rows.push({
        subtopicId: row.subtopicId,
        name: row.name,
        status,
        comment: typeof row.comment === "string" ? row.comment : null,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

export function progressTopicToReadableText(html: string): string {
  const rows = decodeProgressTopic(html);
  if (!rows || rows.length === 0) {
    return "No materials were marked during this period.";
  }
  return rows
    .map((r) => {
      const label =
        STATUS_LABEL[r.status === "introduced" ? "i" : r.status === "practicing" ? "p" : "m"];
      const note = r.comment?.trim() ? ` — ${r.comment.trim()}` : "";
      return `• ${r.name} (${label})${note}`;
    })
    .join("\n");
}
