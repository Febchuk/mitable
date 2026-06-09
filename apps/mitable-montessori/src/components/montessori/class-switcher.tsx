"use client";

import * as React from "react";
import { useMontessori } from "./store";

/**
 * Horizontal class-switcher pills, shared by pages that follow the selected
 * classroom (Curriculum, Attendance, …). Reads the class list + current
 * selection straight from the store, so switching here keeps every page in
 * sync. Renders nothing when the teacher has only one class to show.
 */
export function ClassSwitcher({
  style,
  afterSelect,
  selectedId,
  includeAllOption = false,
  allOptionId = "__all__",
  allOptionLabel = "All classes",
}: {
  style?: React.CSSProperties;
  /** Runs after the store selection updates — e.g. to reload a server page. */
  afterSelect?: (id: string) => void;
  /** When set, drives which pill is highlighted (e.g. attendance URL param). */
  selectedId?: string | null;
  /** Adds a combined-roster option; does not change the global class selection. */
  includeAllOption?: boolean;
  allOptionId?: string;
  allOptionLabel?: string;
}) {
  const { classrooms, selectedClassroomId, selectClassroom, classroomBusy } = useMontessori();
  if (classrooms.length <= 1 && !includeAllOption) return null;

  const activeId = selectedId ?? selectedClassroomId;

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
      {includeAllOption && classrooms.length > 1 && (
        <button
          key={allOptionId}
          type="button"
          className="tap"
          onClick={() => afterSelect?.(allOptionId)}
          style={chip(activeId === allOptionId)}
        >
          {allOptionLabel}
        </button>
      )}
      {classrooms.map((c) => (
        <button
          key={c.id}
          type="button"
          className="tap"
          onClick={() => {
            void selectClassroom(c.id);
            afterSelect?.(c.id);
          }}
          style={chip(activeId === c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
