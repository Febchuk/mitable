"use client";

import * as React from "react";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  type ProgressMark,
  type Topic,
} from "@/components/montessori/data";
import { HandDivider } from "@/components/montessori/primitives";
import styles from "./progress.module.css";

const STATUSES: ProgressMark[] = ["m", "p", "i", "-"];

type BulkSheetProps = {
  topic: Topic;
  count: number;
  draftStatus: ProgressMark | null;
  draftNote: string;
  onDraftStatus: (s: ProgressMark) => void;
  onDraftNote: (s: string) => void;
  onApply: () => void;
  onClose: () => void;
};

export function BulkSheet({
  topic,
  count,
  draftStatus,
  draftNote,
  onDraftStatus,
  onDraftNote,
  onApply,
  onClose,
}: BulkSheetProps) {
  return (
    <>
      <div className={styles.sheetBackdrop} onClick={onClose} />
      <div className={styles.bottomSheet} role="dialog" aria-label="Bulk apply progress">
        <div className={styles.sheetGrip} />
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
            style={{
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
            }}
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
      </div>
    </>
  );
}
