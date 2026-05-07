"use client";

import * as React from "react";
import { STATUS_LABEL, type ProgressMark } from "@/components/montessori/data";
import { Avatar } from "@/components/montessori/primitives";
import type { ProgressByTopic } from "@/components/montessori/store";
import type {
  ClassroomProgressStudent,
  ClassroomProgressSubtopic,
} from "@/lib/queries/classroom-progress";
import styles from "./progress.module.css";

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

const TONES = ["clay", "sage", "butter", "blue", "terracotta"] as const;
function toneFor(id: string): (typeof TONES)[number] {
  // Stable hash of student id → palette slot. Keeps the matrix avatar palette
  // consistent across renders without persisting a tone column on students.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export type SelectionApi = {
  isSelected: (studentId: string, subtopicId: string) => boolean;
  toggle: (studentId: string, subtopicId: string) => void;
  selectRow: (subtopicId: string) => void;
  selectColumn: (studentId: string, subtopicIds: string[]) => void;
};

const InfoIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 11 V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="7.6" r="1.1" fill="currentColor" />
  </svg>
);

type ProgressMatrixProps = {
  topicId: string;
  subtopics: ClassroomProgressSubtopic[];
  students: ClassroomProgressStudent[];
  progressByTopic: ProgressByTopic;
  sel: SelectionApi;
  mobile?: boolean;
  onInfoOpen?: (subtopicId: string, anchorRect: DOMRect) => void;
  openInfoId?: string | null;
};

export function ProgressMatrix({
  topicId,
  subtopics,
  students,
  progressByTopic,
  sel,
  mobile = false,
  onInfoOpen,
  openInfoId,
}: ProgressMatrixProps) {
  const progress = progressByTopic[topicId] ?? {};
  const subtopicIds = React.useMemo(() => subtopics.map((st) => st.id), [subtopics]);

  // Airy density only — spacious, touch-friendly cells. Mobile keeps the same
  // size but tightens the label column so long subtopic names ellipsize.
  const colSize = 44;
  const rowH = colSize;
  const labelColW = mobile ? 116 : 178;
  const headerH = mobile ? 108 : 110;
  const labelFontSize = mobile ? 12 : 13.5;

  const draggingRef = React.useRef(false);

  const handlePointerDown = (studentId: string, subtopicId: string) => {
    draggingRef.current = true;
    sel.toggle(studentId, subtopicId);
  };
  const handlePointerEnter = (studentId: string, subtopicId: string) => {
    if (!draggingRef.current) return;
    if (!sel.isSelected(studentId, subtopicId)) sel.toggle(studentId, subtopicId);
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
            gridTemplateColumns: `${labelColW}px repeat(${students.length}, ${colSize}px)`,
            gridTemplateRows: `${headerH}px repeat(${subtopics.length}, ${rowH}px)`,
            width: "fit-content",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {/* corner cell */}
          <div className={styles.cornerCell} style={{ height: headerH }} />

          {/* column headers (children) */}
          {students.map((s) => {
            const isHotCol = subtopicIds.every((sid) => sel.isSelected(s.id, sid));
            const display = s.preferredName ?? s.fullName.split(" ")[0];
            return (
              <button
                key={s.id}
                type="button"
                className={`tap ${styles.colHeader}`}
                data-armed={isHotCol ? "true" : "false"}
                onClick={() => sel.selectColumn(s.id, subtopicIds)}
                aria-label={`Select all subtopics for ${s.fullName}`}
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
                  {display}
                </span>
                <Avatar initials={initialsFor(s.fullName)} tone={toneFor(s.id)} size={22} />
              </button>
            );
          })}

          {/* rows */}
          {subtopics.map((sub, idx) => {
            const isHotRow = students.every((s) => sel.isSelected(s.id, sub.id));
            const isInfoOpen = openInfoId === sub.id;
            return (
              <React.Fragment key={sub.id}>
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
                      sel.selectRow(sub.id);
                    }}
                    aria-label={`Select all children for ${sub.name}`}
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
                    {sub.name}
                  </button>
                  <button
                    type="button"
                    className="tap"
                    data-info-btn="true"
                    aria-label={`About ${sub.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!onInfoOpen) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      onInfoOpen(sub.id, rect);
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
                {students.map((s, ci) => {
                  const k = `${s.id}:${sub.id}`;
                  const state: ProgressMark = progress[s.id]?.[sub.id] ?? "-";
                  const isSel = sel.isSelected(s.id, sub.id);
                  // Edge = this cell is selected AND the neighbor in that
                  // direction is NOT selected (or the matrix edge). Edge sides
                  // paint 2px; non-edge sides paint 1px so two adjacent selected
                  // cells share a 2px line instead of doubling to 4px.
                  const left = ci > 0 ? students[ci - 1] : null;
                  const right = ci < students.length - 1 ? students[ci + 1] : null;
                  const aboveSubId = idx > 0 ? subtopics[idx - 1].id : null;
                  const belowSubId = idx < subtopics.length - 1 ? subtopics[idx + 1].id : null;
                  const edgeT = isSel && (aboveSubId === null || !sel.isSelected(s.id, aboveSubId));
                  const edgeB = isSel && (belowSubId === null || !sel.isSelected(s.id, belowSubId));
                  const edgeL = isSel && (left === null || !sel.isSelected(left.id, sub.id));
                  const edgeR = isSel && (right === null || !sel.isSelected(right.id, sub.id));
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
                      onPointerDown={() => handlePointerDown(s.id, sub.id)}
                      onPointerEnter={() => handlePointerEnter(s.id, sub.id)}
                      aria-label={`${s.fullName} — ${sub.name}: ${STATUS_LABEL[state]}`}
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
