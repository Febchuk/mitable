/**
 * Structured progress-grid rows for the built-in "From progress" report template.
 * Stored in the first paragraph's `html` as a prefixed JSON blob (same pattern
 * as checklist / single_select fields).
 */

import {
  REPORTABLE_PROGRESS_STATUSES,
  STATUS_LABEL,
  statusToMark,
  type ReportableProgressStatus,
} from "@/lib/progress/marking-schemas";

const V1_PREFIX = "__MITABLE_PROGRESS_TOPIC_V1__";
const V2_PREFIX = "__MITABLE_PROGRESS_TOPIC_V2__";
const V1_STATUSES = new Set<ReportableProgressStatus>(["introduced", "practicing", "mastered"]);
const V2_STATUSES = new Set<ReportableProgressStatus>(REPORTABLE_PROGRESS_STATUSES);

export type ProgressTopicRow = {
  subtopicId: string;
  name: string;
  status: ReportableProgressStatus;
  comment: string | null;
  /** Parent topic name — used for grouped display under a subject heading. */
  topicName?: string;
};

export function encodeProgressTopic(rows: ProgressTopicRow[]): string {
  return V2_PREFIX + JSON.stringify({ rows });
}

export function decodeProgressTopic(html: string): ProgressTopicRow[] | null {
  const trimmed = html.trim();
  const prefix = trimmed.startsWith(V2_PREFIX)
    ? V2_PREFIX
    : trimmed.startsWith(V1_PREFIX)
      ? V1_PREFIX
      : null;
  if (!prefix) return null;
  const allowedStatuses = prefix === V2_PREFIX ? V2_STATUSES : V1_STATUSES;
  try {
    const o = JSON.parse(trimmed.slice(prefix.length)) as { rows?: unknown };
    if (!Array.isArray(o.rows)) return null;
    const rows: ProgressTopicRow[] = [];
    for (const r of o.rows) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const status = row.status;
      if (typeof status !== "string" || !allowedStatuses.has(status as ReportableProgressStatus))
        continue;
      if (typeof row.subtopicId !== "string" || typeof row.name !== "string") continue;
      rows.push({
        subtopicId: row.subtopicId,
        name: row.name,
        status: status as ReportableProgressStatus,
        comment: typeof row.comment === "string" ? row.comment : null,
        topicName: typeof row.topicName === "string" ? row.topicName : undefined,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

export function isProgressTopicPayload(html: string): boolean {
  const trimmed = html.trim();
  return trimmed.startsWith(V1_PREFIX) || trimmed.startsWith(V2_PREFIX);
}

export function progressTopicToReadableText(html: string): string {
  const rows = decodeProgressTopic(html);
  if (!rows || rows.length === 0) {
    return "No materials were marked during this period.";
  }
  return rows
    .map((r) => {
      const label = STATUS_LABEL[statusToMark(r.status)];
      const note = r.comment?.trim() ? ` — ${r.comment.trim()}` : "";
      return `• ${r.name} (${label})${note}`;
    })
    .join("\n");
}
