"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  PERFORMANCE_BG,
  PERFORMANCE_FG,
  PERFORMANCE_LABEL,
  PROMPTING_LABEL,
  formatIepCode,
  type IepEntry,
  type IepGoal,
} from "./data";
import styles from "./iep.module.css";

// Number of slots shown per goal row. Leftmost slot is "+ add new"; the
// rest hold the most recent N entries (newest first), padded with empty
// dashed slots when there's less history.
const SLOT_COUNT = 6;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffDays = Math.round((now - then) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w ago`;
  return `${Math.round(diffDays / 30)}mo ago`;
}

export type IepGoalRowProps = {
  goal: IepGoal;
  entries: IepEntry[];
  onAdd: (goal: IepGoal) => void;
  onEdit: (goal: IepGoal, entry: IepEntry) => void;
};

export function IepGoalRow({ goal, entries, onAdd, onEdit }: IepGoalRowProps) {
  // Most recent first; pad to SLOT_COUNT - 1 slots (the +1 is the add cell).
  const filled = entries.slice(0, SLOT_COUNT - 1);
  const padding = Math.max(0, SLOT_COUNT - 1 - filled.length);
  const latest = filled[0];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 16,
        padding: "10px 12px",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--color-ink)",
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={goal.name}
        >
          {goal.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-ink-muted)",
            marginTop: 2,
            display: "flex",
            gap: 6,
            alignItems: "baseline",
          }}
        >
          {latest ? (
            <>
              <span>
                Latest · {PERFORMANCE_LABEL[latest.performanceBand]} · {latest.successCount}/10 ·{" "}
                {PROMPTING_LABEL[latest.promptingCode]}
              </span>
              <span style={{ opacity: 0.7 }}>· {formatRelative(latest.recordedAt)}</span>
            </>
          ) : (
            <span style={{ opacity: 0.8 }}>No observations yet — tap to log first</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className={`${styles.codeCell} tap`}
          data-add="true"
          onClick={() => onAdd(goal)}
          aria-label={`Log new entry for ${goal.name}`}
          title="Log new entry"
        >
          <Plus size={16} strokeWidth={1.8} />
        </button>
        {filled.map((e) => {
          const code = formatIepCode(e);
          return (
            <button
              key={e.id}
              type="button"
              className={`${styles.codeCell} tap`}
              onClick={() => onEdit(goal, e)}
              aria-label={`${code} — ${PERFORMANCE_LABEL[e.performanceBand]}, ${e.successCount} of 10, prompting ${PROMPTING_LABEL[e.promptingCode]} · ${formatRelative(e.recordedAt)}`}
              title={`${PERFORMANCE_LABEL[e.performanceBand]} · ${e.successCount}/10 · ${PROMPTING_LABEL[e.promptingCode]}\n${formatRelative(e.recordedAt)}${e.note ? `\n"${e.note}"` : ""}`}
              style={{
                background: PERFORMANCE_BG[e.performanceBand],
                color: PERFORMANCE_FG[e.performanceBand],
                borderColor: "rgba(0,0,0,0.06)",
              }}
            >
              {code}
            </button>
          );
        })}
        {Array.from({ length: padding }).map((_, i) => (
          <div
            key={`pad-${i}`}
            className={styles.codeCell}
            data-empty="true"
            aria-hidden="true"
            style={{ cursor: "default" }}
          >
            —
          </div>
        ))}
      </div>
    </div>
  );
}
