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
  /** Toggle every present student across the given subtopics (a whole topic
   *  section). Used by the grouped/full-curriculum view's topic headers. */
  selectSubtopics: (subtopicIds: string[]) => void;
};

/** One topic's worth of rows. A single-topic drill-in passes one section with
 *  `showSectionHeaders=false`; the full-curriculum view passes many with
 *  headers on. */
export type MatrixSection = {
  topicId: string;
  topicName: string;
  subtopics: ClassroomProgressSubtopic[];
};

const InfoIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 11 V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="7.6" r="1.1" fill="currentColor" />
  </svg>
);

type ProgressMatrixProps = {
  sections: MatrixSection[];
  /** When true, render a clickable topic header row above each section's rows.
   *  Off for the single-topic view (the topic already shows in the page head). */
  showSectionHeaders: boolean;
  students: ClassroomProgressStudent[];
  progressByTopic: ProgressByTopic;
  sel: SelectionApi;
  mobile?: boolean;
  onInfoOpen?: (subtopicId: string, anchorRect: DOMRect) => void;
  openInfoId?: string | null;
};

/** Flattened render row: each subtopic plus the section bookkeeping the
 *  selection-edge painter needs (so a 2px outline never bleeds across a topic
 *  boundary, where a header row visually separates two selected runs). */
type FlatRow = {
  sub: ClassroomProgressSubtopic;
  topicId: string;
  /** Id of the same-column subtopic directly above within the same section. */
  aboveId: string | null;
  belowId: string | null;
};

export function ProgressMatrix({
  sections,
  showSectionHeaders,
  students,
  progressByTopic,
  sel,
  mobile = false,
  onInfoOpen,
  openInfoId,
}: ProgressMatrixProps) {
  // Flatten sections into render rows, recording in-section vertical neighbors.
  const flatRows = React.useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    for (const section of sections) {
      const subs = section.subtopics;
      subs.forEach((sub, i) => {
        out.push({
          sub,
          topicId: section.topicId,
          aboveId: i > 0 ? subs[i - 1].id : null,
          belowId: i < subs.length - 1 ? subs[i + 1].id : null,
        });
      });
    }
    return out;
  }, [sections]);

  // Every visible subtopic id, in render order — drives column selection and
  // the "is this whole column on?" header state across all topics on screen.
  const allSubtopicIds = React.useMemo(() => flatRows.map((r) => r.sub.id), [flatRows]);

  // Airy density only — spacious, touch-friendly cells. Mobile keeps the same
  // size but tightens the label column so long subtopic names ellipsize.
  const colSize = 44;
  const rowH = colSize;
  const labelColW = mobile ? 116 : 178;
  const headerH = mobile ? 108 : 110;
  const sectionH = mobile ? 32 : 36;
  const labelFontSize = mobile ? 12 : 13.5;

  // Build the explicit row track list so the spanning topic-header rows and the
  // per-subtopic rows always line up with the items emitted below.
  const gridTemplateRows = React.useMemo(() => {
    const tracks: string[] = [`${headerH}px`];
    for (const section of sections) {
      if (showSectionHeaders) tracks.push(`${sectionH}px`);
      for (let i = 0; i < section.subtopics.length; i++) tracks.push(`${rowH}px`);
    }
    return tracks.join(" ");
  }, [sections, showSectionHeaders, headerH, sectionH, rowH]);

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

  const renderSubtopicRow = (row: FlatRow) => {
    const { sub } = row;
    const topicProgress = progressByTopic[row.topicId] ?? {};
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
          const state: ProgressMark = topicProgress[s.id]?.[sub.id] ?? "-";
          const isSel = sel.isSelected(s.id, sub.id);
          // Edge = this cell is selected AND the neighbor in that direction is
          // NOT selected (or the matrix/section edge). Edge sides paint 2px;
          // non-edge sides paint 1px so two adjacent selected cells share a 2px
          // line instead of doubling to 4px. Vertical neighbors are clamped to
          // the same topic section so the outline never crosses a header row.
          const left = ci > 0 ? students[ci - 1] : null;
          const right = ci < students.length - 1 ? students[ci + 1] : null;
          const edgeT = isSel && (row.aboveId === null || !sel.isSelected(s.id, row.aboveId));
          const edgeB = isSel && (row.belowId === null || !sel.isSelected(s.id, row.belowId));
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
  };

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
            gridTemplateRows,
            width: "fit-content",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          {/* corner cell */}
          <div className={styles.cornerCell} style={{ height: headerH }} />

          {/* column headers (children) */}
          {students.map((s) => {
            const isHotCol = allSubtopicIds.every((sid) => sel.isSelected(s.id, sid));
            const display = s.preferredName ?? s.fullName.split(" ")[0];
            return (
              <button
                key={s.id}
                type="button"
                className={`tap ${styles.colHeader}`}
                data-armed={isHotCol ? "true" : "false"}
                onClick={() => sel.selectColumn(s.id, allSubtopicIds)}
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

          {/* section header + rows */}
          {sections.map((section) => {
            const sectionIds = section.subtopics.map((st) => st.id);
            const sectionHot =
              sectionIds.length > 0 &&
              sectionIds.every((sid) => students.every((s) => sel.isSelected(s.id, sid)));
            return (
              <React.Fragment key={section.topicId}>
                {showSectionHeaders && (
                  <button
                    type="button"
                    className={`tap ${styles.topicHeader}`}
                    data-armed={sectionHot ? "true" : "false"}
                    onClick={() => sel.selectSubtopics(sectionIds)}
                    aria-label={`Select all cells in ${section.topicName}`}
                    style={{ height: sectionH }}
                  >
                    <span className={styles.topicHeaderLabel}>
                      <span
                        style={{
                          fontSize: mobile ? 11 : 12,
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                          color: "var(--color-ink)",
                        }}
                      >
                        {section.topicName}
                      </span>
                    </span>
                  </button>
                )}
                {flatRows
                  .filter((r) => r.topicId === section.topicId)
                  .map((row) => renderSubtopicRow(row))}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
