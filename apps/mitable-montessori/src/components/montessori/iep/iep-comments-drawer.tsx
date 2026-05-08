"use client";

import * as React from "react";
import { Filter, Trash2, X } from "lucide-react";
import { type IepGoal, type IepStateByStudent } from "./data";
import styles from "./iep.module.css";

export type IepCommentsDrawerProps = {
  studentId: string;
  studentName: string;
  goalsById: Map<string, IepGoal>;
  iepState: IepStateByStudent;
  /** When set, only show comments for this goal. */
  selectedGoalId: string | null;
  /** Called when the user clears the selected-goal filter. */
  onClearFilter: () => void;
  onRemoveComment: (args: { goalId: string; commentId: string }) => void;
};

type FlatComment = {
  goalId: string;
  goalName: string;
  commentId: string;
  text: string;
  createdAt: string;
  author?: string;
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.round(diffDay / 7)}w ago`;
  return `${Math.round(diffDay / 30)}mo ago`;
}

export function IepCommentsDrawer({
  studentId,
  studentName,
  goalsById,
  iepState,
  selectedGoalId,
  onClearFilter,
  onRemoveComment,
}: IepCommentsDrawerProps) {
  const flat = React.useMemo<FlatComment[]>(() => {
    const studentRow = iepState[studentId] ?? {};
    const out: FlatComment[] = [];
    for (const [goalId, item] of Object.entries(studentRow)) {
      if (selectedGoalId && goalId !== selectedGoalId) continue;
      const goalName = goalsById.get(goalId)?.name ?? "Goal";
      for (const c of item.comments) {
        out.push({
          goalId,
          goalName,
          commentId: c.id,
          text: c.text,
          createdAt: c.createdAt,
          author: c.author,
        });
      }
    }
    // Newest first across all goals.
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }, [iepState, studentId, selectedGoalId, goalsById]);

  const filtered = selectedGoalId !== null;
  const filterGoalName = filtered ? (goalsById.get(selectedGoalId)?.name ?? "Selected item") : null;
  const firstName = studentName.split(" ")[0];

  return (
    <div className={styles.drawerRoot}>
      <div className={styles.drawerHeader}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          {filtered ? "Item comments" : "Recent comments"}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
          {flat.length} {flat.length === 1 ? "note" : "notes"} · {firstName}
        </div>
      </div>

      {filtered && (
        <button
          type="button"
          className={`${styles.drawerFilterChip} tap`}
          onClick={onClearFilter}
          aria-label="Show all comments"
        >
          <Filter size={11} strokeWidth={1.6} />
          <span
            style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            Filtered to: <strong>{filterGoalName}</strong>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            Show all
            <X size={11} strokeWidth={1.6} />
          </span>
        </button>
      )}

      {flat.length === 0 ? (
        <div className={styles.drawerEmpty}>
          {filtered
            ? "No comments yet on this item — open the bar below to add one."
            : "No comments yet for this student. Tap an item to add the first one."}
        </div>
      ) : (
        <div>
          {flat.map((c) => (
            <div key={c.commentId} className={styles.drawerCommentRow}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <div className={styles.drawerCommentGoal} title={c.goalName}>
                  {c.goalName}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--color-ink-muted)" }}>
                  · {formatRelative(c.createdAt)}
                </div>
                <button
                  type="button"
                  className="tap"
                  onClick={() => onRemoveComment({ goalId: c.goalId, commentId: c.commentId })}
                  aria-label="Delete comment"
                  style={{
                    marginLeft: "auto",
                    background: "transparent",
                    border: 0,
                    color: "var(--color-ink-muted)",
                    cursor: "pointer",
                    padding: 2,
                    display: "inline-flex",
                  }}
                >
                  <Trash2 size={12} strokeWidth={1.6} />
                </button>
              </div>
              <div
                className="font-display"
                style={{ fontSize: 16, lineHeight: 1.3, color: "var(--color-ink)" }}
              >
                &ldquo;{c.text}&rdquo;
              </div>
              {c.author && (
                <div style={{ fontSize: 10.5, color: "var(--color-ink-muted)", marginTop: 4 }}>
                  — {c.author}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
