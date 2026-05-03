"use client";

import * as React from "react";
import { STATUS_LABEL, type ProgressMark } from "@/components/montessori/data";
import styles from "./progress.module.css";

const STATUSES: ProgressMark[] = ["m", "p", "i", "-"];

type BulkBarProps = {
  count: number;
  draftStatus: ProgressMark | null;
  draftNote: string;
  onDraftStatus: (s: ProgressMark) => void;
  onDraftNote: (s: string) => void;
  onApply: () => void;
  onCancel: () => void;
};

export function BulkBar({
  count,
  draftStatus,
  draftNote,
  onDraftStatus,
  onDraftNote,
  onApply,
  onCancel,
}: BulkBarProps) {
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
