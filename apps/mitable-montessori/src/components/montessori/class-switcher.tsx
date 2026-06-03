"use client";

import * as React from "react";
import { useMontessori } from "./store";

/**
 * Horizontal class-switcher pills, shared by pages that follow the selected
 * classroom (Curriculum, Attendance, …). Reads the class list + current
 * selection straight from the store, so switching here keeps every page in
 * sync. Renders nothing when the teacher has only one class to show.
 */
export function ClassSwitcher({ style }: { style?: React.CSSProperties }) {
  const { classrooms, selectedClassroomId, selectClassroom, classroomBusy } = useMontessori();
  if (classrooms.length <= 1) return null;

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    background: active ? "var(--color-ink)" : "var(--color-surface)",
    color: active ? "var(--color-surface)" : "var(--color-ink-secondary)",
    border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-border)",
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        opacity: classroomBusy ? 0.5 : 1,
        pointerEvents: classroomBusy ? "none" : "auto",
        ...style,
      }}
    >
      {classrooms.map((c) => (
        <button
          key={c.id}
          type="button"
          className="tap"
          onClick={() => void selectClassroom(c.id)}
          style={chip(selectedClassroomId === c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
