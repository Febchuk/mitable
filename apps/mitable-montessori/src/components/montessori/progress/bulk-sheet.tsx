"use client";

import * as React from "react";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  type ProgressMark,
  type Topic,
} from "@/components/montessori/data";
import { Avatar, HandDivider } from "@/components/montessori/primitives";
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
  mode: "cells";
  topic: Topic;
  count: number;
  draftStatus: ProgressMark | null;
  draftNote: string;
  onDraftStatus: (s: ProgressMark) => void;
  onDraftNote: (s: string) => void;
  onApply: () => void;
  onClose: () => void;
};

type CommentModeProps = {
  mode: "comment";
  students: ClassroomProgressStudent[];
  commentChildId: string | null;
  onCommentChild: (id: string) => void;
  commentText: string;
  onCommentText: (s: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

type BulkSheetProps = CellModeProps | CommentModeProps;

const noteTextareaStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-canvas)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: "10px 12px",
  fontFamily: "var(--font-display)",
  fontSize: 19,
  color: "var(--color-ink)",
  minHeight: 56,
  resize: "none",
  lineHeight: 1.25,
};

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      className="tap"
      onClick={onClose}
      style={{
        background: "var(--color-muted)",
        border: "1px solid var(--color-border)",
        color: "var(--color-ink-secondary)",
        padding: "8px 12px",
        borderRadius: 10,
        fontSize: 12.5,
        fontWeight: 500,
      }}
    >
      Close
    </button>
  );
}

export function BulkSheet(props: BulkSheetProps) {
  const onClose = props.onClose;
  return (
    <>
      <div className={styles.sheetBackdrop} onClick={onClose} />
      <div className={styles.bottomSheet} role="dialog" aria-label="Progress action">
        <div className={styles.sheetGrip} />
        {props.mode === "comment" ? <CommentSheet {...props} /> : <CellSheet {...props} />}
      </div>
    </>
  );
}

function CellSheet({
  topic,
  count,
  draftStatus,
  draftNote,
  onDraftStatus,
  onDraftNote,
  onApply,
  onClose,
}: CellModeProps) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
            Bulk update · {topic}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            {count} cell{count === 1 ? "" : "s"}
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <HandDivider />
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {STATUSES.map((s) => {
          const active = draftStatus === s;
          return (
            <button
              key={s}
              type="button"
              className="tap"
              onClick={() => onDraftStatus(s)}
              style={{
                flex: "1 1 calc(50% - 4px)",
                minWidth: 130,
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${active ? "var(--color-ink)" : "var(--color-border)"}`,
                background: active ? "var(--color-ink)" : "var(--color-surface)",
                color: active ? "var(--color-surface)" : "var(--color-ink-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 4,
                  display: "inline-block",
                  background: s === "-" ? "transparent" : STATUS_COLOR[s],
                  border: s === "-" ? "1px dashed currentColor" : "1px solid transparent",
                }}
              />
              {s === "-" ? "Clear" : STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
          Note (optional)
        </div>
        <textarea
          placeholder="First independent attempt…"
          value={draftNote}
          onChange={(e) => onDraftNote(e.target.value)}
          style={noteTextareaStyle}
        />
      </div>
      <button
        type="button"
        className="tap"
        onClick={onApply}
        disabled={!draftStatus}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--color-ink)",
          background: draftStatus ? "var(--color-ink)" : "var(--color-muted)",
          color: draftStatus ? "var(--color-surface)" : "var(--color-ink-muted)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Apply to {count} cell{count === 1 ? "" : "s"}
      </button>
    </>
  );
}

function CommentSheet({
  students,
  commentChildId,
  onCommentChild,
  commentText,
  onCommentText,
  onSubmit,
  onClose,
}: CommentModeProps) {
  const canSubmit = Boolean(commentChildId) && commentText.trim().length > 0;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
            New comment
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
            About a child
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <HandDivider />
      <div className="label-cap" style={{ color: "var(--color-ink-muted)", margin: "14px 0 6px" }}>
        Child
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                padding: "5px 12px 5px 5px",
                borderRadius: 999,
                border: `1px solid ${active ? "var(--color-ink)" : "var(--color-border)"}`,
                background: active ? "var(--color-ink)" : "var(--color-surface)",
                color: active ? "var(--color-surface)" : "var(--color-ink-secondary)",
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: "inherit",
              }}
            >
              <Avatar initials={initialsFor(s.fullName)} tone={toneFor(s.id)} size={20} />
              {display}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
          Comment
        </div>
        <textarea
          placeholder="Settled in quickly this morning…"
          value={commentText}
          onChange={(e) => onCommentText(e.target.value)}
          style={noteTextareaStyle}
        />
      </div>
      <button
        type="button"
        className="tap"
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--color-ink)",
          background: canSubmit ? "var(--color-ink)" : "var(--color-muted)",
          color: canSubmit ? "var(--color-surface)" : "var(--color-ink-muted)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Save comment
      </button>
    </>
  );
}
