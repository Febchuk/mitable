"use client";

import * as React from "react";
import { SUBTOPIC_INFO } from "@/components/montessori/data";
import styles from "./progress.module.css";

type SubtopicPopoverProps = {
  subtopic: string;
  anchorRect: DOMRect;
  onClose: () => void;
};

export function SubtopicPopover({ subtopic, anchorRect, onClose }: SubtopicPopoverProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const desc = SUBTOPIC_INFO[subtopic] || "Description coming soon for this subtopic.";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Defer outside-click listener so the click that opened the popover doesn't close it.
    const t = window.setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  // Position below the anchor; clamp to viewport with an 8px margin.
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 220);
  const width = 300;
  const left = Math.max(8, Math.min(anchorRect.left - 8, window.innerWidth - width - 8));

  return (
    <div
      ref={ref}
      className={styles.fadeIn}
      role="tooltip"
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 80,
        width,
        maxWidth: "calc(100vw - 16px)",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: "0 18px 40px rgba(42,39,35,0.16), 0 6px 14px rgba(42,39,35,0.08)",
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          About this subtopic
        </div>
        <button
          type="button"
          className="tap"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--color-ink-muted)",
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--color-ink)",
          marginBottom: 4,
        }}
      >
        {subtopic}
      </div>
      <div style={{ color: "var(--color-ink-secondary)" }}>{desc}</div>
    </div>
  );
}
