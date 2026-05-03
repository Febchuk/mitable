"use client";

import * as React from "react";
import styles from "./progress.module.css";

type SelectionCapsuleProps = {
  count: number;
  onClear: () => void;
  onApply: () => void;
};

export function SelectionCapsule({ count, onClear, onApply }: SelectionCapsuleProps) {
  if (count === 0) return null;
  return (
    <div className={styles.selectionCapsule} role="status">
      <button
        type="button"
        className="tap"
        onClick={onClear}
        aria-label="Clear selection"
        style={{
          background: "transparent",
          border: 0,
          color: "rgba(255,251,243,0.8)",
          fontSize: 11,
          padding: "0 4px",
          cursor: "pointer",
        }}
      >
        ✕
      </button>
      <span>
        <strong style={{ color: "var(--color-surface)" }}>{count}</strong> cell
        {count === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        className="tap"
        onClick={onApply}
        style={{
          background: "var(--color-surface)",
          color: "var(--color-ink)",
          border: 0,
          padding: "6px 11px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Apply
      </button>
    </div>
  );
}
