"use client";

import * as React from "react";
import { Filter, Trash2, X } from "lucide-react";
import styles from "./iep.module.css";

export type DrawerComment = {
  itemId: string;
  itemName: string;
  commentId: string;
  body: string;
  createdAt: string;
  author?: string | null;
};

export type IepCommentsDrawerProps = {
  studentName: string;
  comments: DrawerComment[];
  selectedItemId: string | null;
  selectedItemName: string | null;
  onClearFilter: () => void;
  onRemoveComment: (commentId: string) => void;
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
  studentName,
  comments,
  selectedItemId,
  selectedItemName,
  onClearFilter,
  onRemoveComment,
}: IepCommentsDrawerProps) {
  const filtered = selectedItemId !== null;
  const visible = filtered ? comments.filter((c) => c.itemId === selectedItemId) : comments;
  const firstName = studentName.split(" ")[0];

  return (
    <div className={styles.drawerRoot}>
      <div className={styles.drawerHeader}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          {filtered ? "Item comments" : "Recent comments"}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
          {visible.length} {visible.length === 1 ? "note" : "notes"} · {firstName}
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
            Filtered to: <strong>{selectedItemName ?? "Selected item"}</strong>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            Show all
            <X size={11} strokeWidth={1.6} />
          </span>
        </button>
      )}

      {visible.length === 0 ? (
        <div className={styles.drawerEmpty}>
          {filtered
            ? "No comments yet on this item — open the bar below to add one."
            : "No comments yet for this student. Tap an item to add the first one."}
        </div>
      ) : (
        <div>
          {visible.map((c) => (
            <div key={c.commentId} className={styles.drawerCommentRow}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <div className={styles.drawerCommentGoal} title={c.itemName}>
                  {c.itemName}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--color-ink-muted)" }}>
                  · {formatRelative(c.createdAt)}
                </div>
                <button
                  type="button"
                  className="tap"
                  onClick={() => onRemoveComment(c.commentId)}
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
                &ldquo;{c.body}&rdquo;
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
