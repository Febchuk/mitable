"use client";

import * as React from "react";
import { ChevronDown, Users, X } from "lucide-react";
import { cardStyle } from "@/components/montessori/page-header";
export const PRESENT_PRESETS = ["Tardy", "Early pickup"] as const;
export const ABSENT_PRESETS = ["Sick", "Vacation"] as const;

export type BulkAttendanceParams = {
  status: "present" | "absent";
  comment: string | null;
};

export type BulkScope = "all" | "unmarked";

function presetsFor(status: "present" | "absent"): readonly string[] {
  return status === "present" ? PRESENT_PRESETS : ABSENT_PRESETS;
}

type BulkAttendancePanelProps = {
  open: boolean;
  totalStudents: number;
  unmarkedCount: number;
  applying: boolean;
  onClose: () => void;
  onApply: (params: BulkAttendanceParams, scope: BulkScope) => void;
};

export function BulkAttendanceToolbar({
  totalStudents,
  unmarkedCount,
  applying,
  bulkOpen,
  onToggleBulk,
  onAllPresent,
}: {
  totalStudents: number;
  unmarkedCount: number;
  applying: boolean;
  bulkOpen: boolean;
  onToggleBulk: () => void;
  onAllPresent: () => void;
}) {
  if (totalStudents === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: bulkOpen ? 12 : 16,
        alignItems: "center",
      }}
    >
      <button
        type="button"
        className="tap"
        disabled={applying}
        onClick={onAllPresent}
        style={{
          padding: "9px 16px",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          border: "1px solid transparent",
          background: "var(--color-sage-soft)",
          color: "var(--color-sage-deep)",
          cursor: applying ? "wait" : "pointer",
          opacity: applying ? 0.7 : 1,
        }}
      >
        All present
      </button>
      <button
        type="button"
        className="tap"
        disabled={applying}
        onClick={onToggleBulk}
        aria-expanded={bulkOpen}
        style={{
          padding: "9px 16px",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          border: "1px solid var(--color-border)",
          background: bulkOpen ? "var(--color-canvas)" : "var(--color-surface)",
          color: "var(--color-ink)",
          cursor: applying ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          opacity: applying ? 0.7 : 1,
        }}
      >
        <Users size={15} strokeWidth={1.75} aria-hidden />
        Mark everyone…
      </button>
      {unmarkedCount > 0 && unmarkedCount < totalStudents && (
        <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {unmarkedCount} not marked yet
        </span>
      )}
    </div>
  );
}

export function BulkAttendancePanel({
  open,
  totalStudents,
  unmarkedCount,
  applying,
  onClose,
  onApply,
}: BulkAttendancePanelProps) {
  const [status, setStatus] = React.useState<"present" | "absent">("present");
  const [comment, setComment] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<BulkScope>("all");
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [customNote, setCustomNote] = React.useState(false);
  const noteRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStatus("present");
    setComment(null);
    setScope(unmarkedCount > 0 ? "unmarked" : "all");
    setNoteOpen(false);
    setCustomNote(false);
  }, [open, unmarkedCount]);

  React.useEffect(() => {
    setComment((c) => {
      if (!c) return c;
      const presets = presetsFor(status);
      if (presets.includes(c)) return c;
      const other = status === "present" ? ABSENT_PRESETS : PRESENT_PRESETS;
      if ((other as readonly string[]).includes(c)) return null;
      return c;
    });
  }, [status]);

  React.useEffect(() => {
    if (!noteOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!noteRef.current) return;
      if (e.target instanceof Node && noteRef.current.contains(e.target)) return;
      setNoteOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [noteOpen]);

  if (!open) return null;

  const presets = presetsFor(status);
  const targetCount = scope === "unmarked" ? unmarkedCount : totalStudents;
  const canApply = targetCount > 0 && !applying;

  const apply = () => {
    if (!canApply) return;
    onApply(
      {
        status,
        comment: comment?.trim() || null,
      },
      scope
    );
  };

  return (
    <div
      role="region"
      aria-label="Bulk attendance"
      style={{
        ...cardStyle,
        overflow: "visible",
        marginBottom: 16,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
            Bulk mark
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "var(--color-ink-secondary)",
              lineHeight: 1.45,
            }}
          >
            Same status and note for every child you choose below.
          </p>
        </div>
        <button
          type="button"
          className="tap"
          aria-label="Close bulk mark"
          onClick={onClose}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-ink-secondary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span className="label-cap" style={{ color: "var(--color-ink-muted)", marginRight: 4 }}>
          Status
        </span>
        <BulkStatusChip
          label="Present"
          active={status === "present"}
          activeBg="var(--color-sage-soft)"
          activeFg="var(--color-sage-deep)"
          onClick={() => setStatus("present")}
        />
        <BulkStatusChip
          label="Absent"
          active={status === "absent"}
          activeBg="var(--color-clay-soft)"
          activeFg="var(--color-terracotta-deep)"
          onClick={() => setStatus("absent")}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
        }}
      >
        <div
          ref={noteRef}
          style={{ position: "relative", flex: "1 1 200px", minWidth: 0, overflow: "visible" }}
        >
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
            Note <span style={{ fontWeight: 400, opacity: 0.8 }}>(optional)</span>
          </div>
          {customNote ? (
            <input
              type="text"
              value={comment ?? ""}
              placeholder="Type a note…"
              onChange={(e) => setComment(e.target.value || null)}
              style={fieldInputStyle}
            />
          ) : (
            <button
              type="button"
              className="tap"
              onClick={() => setNoteOpen((v) => !v)}
              style={{
                ...fieldInputStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                color: comment ? "var(--color-ink)" : "var(--color-ink-muted)",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {comment ?? "No note"}
              </span>
              <ChevronDown size={14} strokeWidth={1.75} style={{ flexShrink: 0, marginLeft: 8 }} />
            </button>
          )}
          {noteOpen && !customNote && (
            <NoteMenu
              presets={presets}
              value={comment}
              onPick={(p) => {
                setComment(p);
                setCustomNote(false);
                setNoteOpen(false);
              }}
              onCustom={() => {
                setCustomNote(true);
                setComment(null);
                setNoteOpen(false);
              }}
              onClear={() => {
                setComment(null);
                setCustomNote(false);
                setNoteOpen(false);
              }}
            />
          )}
        </div>
      </div>

      <fieldset
        style={{
          margin: 0,
          padding: 0,
          border: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <legend className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
          Apply to
        </legend>
        <ScopeOption
          name="bulk-scope"
          checked={scope === "all"}
          onChange={() => setScope("all")}
          label={`All ${totalStudents} ${totalStudents === 1 ? "child" : "children"}`}
          hint="Replaces any marks already on this day"
        />
        <ScopeOption
          name="bulk-scope"
          checked={scope === "unmarked"}
          onChange={() => setScope("unmarked")}
          disabled={unmarkedCount === 0}
          label={`Only unmarked (${unmarkedCount})`}
          hint={
            unmarkedCount === 0 ? "Everyone already has a mark" : "Leaves existing marks unchanged"
          }
        />
      </fieldset>

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", paddingTop: 4 }}
      >
        <button
          type="button"
          className="tap"
          disabled={!canApply}
          onClick={apply}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            background: canApply ? "var(--color-ink)" : "var(--color-border)",
            color: canApply ? "var(--color-surface)" : "var(--color-ink-muted)",
            cursor: canApply ? "pointer" : "not-allowed",
          }}
        >
          {applying
            ? "Applying…"
            : `Apply to ${targetCount} ${targetCount === 1 ? "child" : "children"}`}
        </button>
        <button
          type="button"
          className="tap"
          onClick={onClose}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--color-border)",
            background: "transparent",
            color: "var(--color-ink-secondary)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-canvas)",
  fontSize: 13,
};

function BulkStatusChip({
  label,
  active,
  activeBg,
  activeFg,
  onClick,
}: {
  label: string;
  active: boolean;
  activeBg: string;
  activeFg: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap"
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        fontSize: 12.5,
        fontWeight: 600,
        border: active ? "1px solid transparent" : "1px solid var(--color-border)",
        background: active ? activeBg : "transparent",
        color: active ? activeFg : "var(--color-ink-secondary)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ScopeOption({
  name,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ marginTop: 3, accentColor: "var(--color-ink)" }}
      />
      <span>
        <span
          style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}
        >
          {label}
        </span>
        <span
          style={{ display: "block", fontSize: 12, color: "var(--color-ink-muted)", marginTop: 2 }}
        >
          {hint}
        </span>
      </span>
    </label>
  );
}

function NoteMenu({
  presets,
  value,
  onPick,
  onCustom,
  onClear,
}: {
  presets: readonly string[];
  value: string | null;
  onPick: (p: string) => void;
  onCustom: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: 4,
        boxShadow: "0 12px 24px rgba(42,39,35,0.12), 0 4px 8px rgba(42,39,35,0.06)",
      }}
    >
      <MenuRow label="No note" active={!value} onClick={onClear} />
      {presets.map((p) => (
        <MenuRow key={p} label={p} active={value === p} onClick={() => onPick(p)} />
      ))}
      <MenuRow label="Custom note…" active={false} onClick={onCustom} />
    </div>
  );
}

function MenuRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: 6,
        background: active ? "var(--color-canvas)" : "transparent",
        color: "var(--color-ink)",
        fontSize: 13,
        border: 0,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
