"use client";

import * as React from "react";
import { STATUS_LABEL, type ProgressMark } from "@/components/montessori/data";
import { Avatar } from "@/components/montessori/primitives";
import type { ClassroomProgressStudent } from "@/lib/queries/classroom-progress";
import styles from "./progress.module.css";

const STATUSES: ProgressMark[] = ["m", "p", "i", "-"];

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

const TONES = ["clay", "sage", "butter", "blue", "terracotta"] as const;
function toneFor(id: string): (typeof TONES)[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

type CellModeProps = {
  /** Cell-selection mode: IPM swatches + note, applied to every selected cell. */
  mode: "cells";
  count: number;
  draftStatus: ProgressMark | null;
  draftNote: string;
  onDraftStatus: (s: ProgressMark) => void;
  onDraftNote: (s: string) => void;
  onApply: () => void;
  onCancel: () => void;
};

type CommentModeProps = {
  /** Free-form comment mode: pick a child, write a note. No IPM, no cells. */
  mode: "comment";
  students: ClassroomProgressStudent[];
  commentChildId: string | null;
  onCommentChild: (id: string) => void;
  commentText: string;
  onCommentText: (s: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

type BulkBarProps = CellModeProps | CommentModeProps;

export function BulkBar(props: BulkBarProps) {
  if (props.mode === "comment") return <CommentBar {...props} />;
  return <CellBar {...props} />;
}

function CellBar({
  count,
  draftStatus,
  draftNote,
  onDraftStatus,
  onDraftNote,
  onApply,
  onCancel,
}: CellModeProps) {
  if (count === 0) return null;
  return (
    <div className={styles.bulkBar} role="dialog" aria-label="Bulk apply progress">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            paddingRight: 12,
            borderRight: "1px solid rgba(255,251,243,0.16)",
          }}
        >
          {count}
          <span style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.7, marginLeft: 4 }}>
            cell{count === 1 ? "" : "s"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flex: 1 }}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.statusBtn} tap`}
              data-state={s}
              data-active={draftStatus === s ? "true" : "false"}
              onClick={() => onDraftStatus(s)}
            >
              <span className={styles.swatch} />
              {s === "-" ? "Clear" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <button type="button" className={`${styles.ghostBtn} tap`} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.primaryLight} tap`}
            onClick={onApply}
            disabled={!draftStatus}
          >
            Apply to {count}
          </button>
        </div>
      </div>
      <div>
        <textarea
          placeholder="Add a note — applies to every selected cell…"
          value={draftNote}
          onChange={(e) => onDraftNote(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );
}

function CommentBar({
  students,
  commentChildId,
  onCommentChild,
  commentText,
  onCommentText,
  onSubmit,
  onCancel,
}: CommentModeProps) {
  const selectedChild = students.find((s) => s.id === commentChildId) ?? null;
  const selectedName = selectedChild
    ? (selectedChild.preferredName ?? selectedChild.fullName.split(" ")[0])
    : "this child";
  const canSubmit = Boolean(commentChildId) && commentText.trim().length > 0;
  return (
    <div className={styles.bulkBar} role="dialog" aria-label="New comment">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            paddingRight: 12,
            borderRight: "1px solid rgba(255,251,243,0.16)",
          }}
        >
          New comment
        </div>
        <div
          className={styles.scrollQuiet}
          style={{
            display: "flex",
            gap: 6,
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {students.map((s) => {
            const active = s.id === commentChildId;
            const display = s.preferredName ?? s.fullName.split(" ")[0];
            return (
              <button
                key={s.id}
                type="button"
                className="tap"
                onClick={() => onCommentChild(s.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  padding: "4px 10px 4px 4px",
                  borderRadius: 999,
                  background: active ? "var(--color-surface)" : "rgba(255,251,243,0.10)",
                  color: active ? "var(--color-ink)" : "rgba(255,251,243,0.92)",
                  border: active
                    ? "1px solid var(--color-surface)"
                    : "1px solid rgba(255,251,243,0.14)",
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Avatar initials={initialsFor(s.fullName)} tone={toneFor(s.id)} size={20} />
                {display}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <button type="button" className={`${styles.ghostBtn} tap`} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.primaryLight} tap`}
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            Save
          </button>
        </div>
      </div>
      <div>
        <textarea
          placeholder={`Write a comment about ${selectedName}…`}
          value={commentText}
          onChange={(e) => onCommentText(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );
}
