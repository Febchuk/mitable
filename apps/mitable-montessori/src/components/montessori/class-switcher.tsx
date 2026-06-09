"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { useMontessori } from "./store";

/**
 * Class picker for pages that follow the selected classroom (Attendance, Curriculum, …).
 * Chips = legacy horizontal pills; dropdown = compact select (default All).
 */
export function ClassSwitcher({
  style,
  afterSelect,
  selectedId,
  includeAllOption = false,
  allOptionId = "__all__",
  allOptionLabel = "All classes",
  variant = "chips",
  label = "Classroom",
}: {
  style?: React.CSSProperties;
  /** Runs after the store selection updates — e.g. to reload a server page. */
  afterSelect?: (id: string) => void;
  /** When set, drives which option is selected (e.g. attendance URL param). */
  selectedId?: string | null;
  /** Adds a combined-roster option; does not change the global class selection. */
  includeAllOption?: boolean;
  allOptionId?: string;
  allOptionLabel?: string;
  variant?: "chips" | "dropdown";
  label?: string;
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

  const onPick = (id: string) => {
    if (id !== allOptionId) void selectClassroom(id);
    afterSelect?.(id);
  };

  if (variant === "dropdown") {
    return (
      <label
        style={{
          display: "block",
          maxWidth: 280,
          opacity: classroomBusy ? 0.5 : 1,
          pointerEvents: classroomBusy ? "none" : "auto",
          ...style,
        }}
      >
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ position: "relative" }}>
          <select
            value={activeId ?? allOptionId}
            onChange={(e) => onPick(e.target.value)}
            aria-label={label}
            style={{
              width: "100%",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
              fontSize: 14,
              fontWeight: 500,
              padding: "10px 36px 10px 12px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-ink)",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {includeAllOption && classrooms.length > 1 ? (
              <option value={allOptionId}>{allOptionLabel}</option>
            ) : null}
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={15}
            strokeWidth={1.6}
            aria-hidden
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--color-ink-muted)",
            }}
          />
        </div>
      </label>
    );
  }

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
          onClick={() => onPick(allOptionId)}
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
          onClick={() => onPick(c.id)}
          style={chip(activeId === c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
