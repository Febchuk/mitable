"use client";

import * as React from "react";
import {
  CHILDREN,
  STATUS_LABEL,
  SUBTOPICS_BY_TOPIC,
  type ProgressMark,
  type Topic,
} from "@/components/montessori/data";
import { Avatar } from "@/components/montessori/primitives";
import styles from "./progress.module.css";

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

export type SelectionApi = {
  isSelected: (cid: string, idx: number) => boolean;
  toggle: (cid: string, idx: number) => void;
  selectRow: (idx: number) => void;
  selectColumn: (cid: string, subs: string[]) => void;
};

const InfoIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 11 V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="7.6" r="1.1" fill="currentColor" />
  </svg>
);

type ProgressMatrixProps = {
  topic: Topic;
  progressByTopic: Record<Topic, Record<string, ProgressMark[]>>;
  sel: SelectionApi;
  presentOnly?: boolean;
  mobile?: boolean;
  onInfoOpen?: (idx: number, anchorRect: DOMRect) => void;
  openInfoIdx?: number | null;
};

export function ProgressMatrix({
  topic,
  progressByTopic,
  sel,
  presentOnly = true,
  mobile = false,
  onInfoOpen,
  openInfoIdx,
}: ProgressMatrixProps) {
  const presentChildren = React.useMemo(
    () => (presentOnly ? CHILDREN.filter((c) => c.present) : CHILDREN),
    [presentOnly]
  );
  const subs = SUBTOPICS_BY_TOPIC[topic];
  const progress = progressByTopic[topic] || {};

  // Airy density only — spacious, touch-friendly cells. Mobile keeps the same
  // size but tightens the label column so long subtopic names ellipsize.
  const colSize = 44;
  const rowH = colSize;
  const labelColW = mobile ? 116 : 178;
  const headerH = mobile ? 108 : 110;
  const labelFontSize = mobile ? 12 : 13.5;

  const draggingRef = React.useRef(false);

  const handlePointerDown = (cid: string, idx: number) => {
    draggingRef.current = true;
    sel.toggle(cid, idx);
  };
  const handlePointerEnter = (cid: string, idx: number) => {
    if (!draggingRef.current) return;
    if (!sel.isSelected(cid, idx)) sel.toggle(cid, idx);
  };

  React.useEffect(() => {
    const up = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  return (
    <div
      data-matrix-root
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
      }}
    >
      <div className={styles.sheetShell}>
        <div
          className={`${styles.scrollQuiet} ${styles.sheetGrid}`}
          style={{
            display: "grid",
            gridTemplateColumns: `${labelColW}px repeat(${presentChildren.length}, ${colSize}px)`,
            gridTemplateRows: `${headerH}px repeat(${subs.length}, ${rowH}px)`,
            width: "fit-content",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {/* corner cell */}
          <div className={styles.cornerCell} style={{ height: headerH }} />

          {/* column headers (children) */}
          {presentChildren.map((c) => {
            const isHotCol = subs.every((_, i) => sel.isSelected(c.id, i));
            return (
              <button
                key={c.id}
                type="button"
                className={`tap ${styles.colHeader}`}
                data-armed={isHotCol ? "true" : "false"}
                onClick={() => sel.selectColumn(c.id, subs)}
                aria-label={`Select all subtopics for ${c.name}`}
                style={{
                  height: headerH,
                  background: isHotCol ? "var(--color-muted)" : "var(--color-surface)",
                  color: isHotCol ? "var(--color-ink)" : "var(--color-ink-secondary)",
                }}
              >
                <span
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    fontSize: 11,
                    fontWeight: 500,
                    lineHeight: 1.1,
                    maxHeight: headerH - 32,
                    overflow: "hidden",
                  }}
                >
                  {c.name.split(" ")[0]}
                </span>
                <Avatar initials={initialsFor(c.name)} tone={c.tone} size={22} />
              </button>
            );
          })}

          {/* rows */}
          {subs.map((sub, idx) => {
            const isHotRow = presentChildren.every((c) => sel.isSelected(c.id, idx));
            const isInfoOpen = openInfoIdx === idx;
            return (
              <React.Fragment key={sub}>
                <div
                  className={styles.rowHeader}
                  data-armed={isHotRow ? "true" : "false"}
                  style={{ height: rowH }}
                >
                  <button
                    type="button"
                    className="tap"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-info-btn="true"]')) return;
                      sel.selectRow(idx);
                    }}
                    aria-label={`Select all children for ${sub}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "transparent",
                      border: 0,
                      textAlign: "right",
                      padding: 0,
                      fontFamily: "inherit",
                      fontSize: labelFontSize,
                      fontWeight: isHotRow ? 600 : 500,
                      color: isHotRow ? "var(--color-ink)" : "var(--color-ink-secondary)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      lineHeight: 1.2,
                    }}
                  >
                    {sub}
                  </button>
                  <button
                    type="button"
                    className="tap"
                    data-info-btn="true"
                    aria-label={`About ${sub}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!onInfoOpen) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      onInfoOpen(idx, rect);
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      minWidth: 18,
                      flexShrink: 0,
                      borderRadius: 999,
                      border: "1px solid var(--color-border)",
                      background: isInfoOpen ? "var(--color-ink)" : "var(--color-surface)",
                      color: isInfoOpen ? "var(--color-surface)" : "var(--color-ink-muted)",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <InfoIcon size={11} />
                  </button>
                </div>
                {presentChildren.map((c, ci) => {
                  const k = `${c.id}:${idx}`;
                  const state = (progress[c.id] || [])[idx] || "-";
                  const isSel = sel.isSelected(c.id, idx);
                  // Edge = this cell is selected AND the neighbor in that
                  // direction is NOT selected (or the matrix edge). Edge sides
                  // paint 2px; non-edge sides paint 1px so two adjacent selected
                  // cells share a 2px line instead of doubling to 4px.
                  const left = ci > 0 ? presentChildren[ci - 1] : null;
                  const right = ci < presentChildren.length - 1 ? presentChildren[ci + 1] : null;
                  const edgeT = isSel && (idx === 0 || !sel.isSelected(c.id, idx - 1));
                  const edgeB =
                    isSel && (idx === subs.length - 1 || !sel.isSelected(c.id, idx + 1));
                  const edgeL = isSel && (left === null || !sel.isSelected(left.id, idx));
                  const edgeR = isSel && (right === null || !sel.isSelected(right.id, idx));
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`${styles.cell} tap`}
                      data-state={state}
                      data-selected={isSel ? "true" : "false"}
                      data-edge-t={edgeT ? "true" : "false"}
                      data-edge-r={edgeR ? "true" : "false"}
                      data-edge-b={edgeB ? "true" : "false"}
                      data-edge-l={edgeL ? "true" : "false"}
                      onPointerDown={() => handlePointerDown(c.id, idx)}
                      onPointerEnter={() => handlePointerEnter(c.id, idx)}
                      aria-label={`${c.name} — ${sub}: ${STATUS_LABEL[state]}`}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
