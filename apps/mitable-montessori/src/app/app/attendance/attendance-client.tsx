"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { initialsFor } from "@/components/montessori/data";
import type { Tone } from "@/components/montessori/data";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar, ToastBus } from "@/components/montessori/primitives";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
import {
  type AttendanceDayData,
  type AttendanceDayStudent,
  type AttendanceDayStatus,
  addDays,
  localDateString,
} from "@/lib/queries/attendance-day-model";
import {
  BulkAttendancePanel,
  BulkAttendanceToolbar,
  type BulkAttendanceParams,
  type BulkScope,
} from "./bulk-attendance-panel";
import styles from "./attendance.module.css";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatDateParts(
  date: string,
  locale: string
): { weekday: string; primary: string; year: string | null } {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) {
    return { weekday: "", primary: date, year: null };
  }
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const currentYear = new Date().getFullYear();
  return {
    weekday: dt.toLocaleDateString(locale, { weekday: "long", timeZone: "UTC" }),
    primary: dt.toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }),
    year: y !== currentYear ? String(y) : null,
  };
}

function firstName(fullName: string, preferred: string | null): string {
  if (preferred && preferred.trim().length > 0) return preferred;
  return fullName.split(" ")[0] ?? fullName;
}

type RowState = {
  status: AttendanceDayStatus;
  comment: string | null;
  saving: boolean;
};

const PRESENT_PRESETS = ["Tardy", "Early pickup"] as const;
const ABSENT_PRESETS = ["Sick", "Vacation"] as const;

function presetsFor(status: AttendanceDayStatus): readonly string[] | null {
  if (status === "present") return PRESENT_PRESETS;
  if (status === "absent") return ABSENT_PRESETS;
  return null;
}

function isPreset(status: AttendanceDayStatus, comment: string | null): boolean {
  if (!comment) return false;
  const presets = presetsFor(status);
  return presets ? presets.includes(comment) : false;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

type RowPayload = Omit<RowState, "saving">;

const SYNC_BATCH_SIZE = 50;

function buildAttendanceCommand(
  classroomId: string,
  studentId: string,
  date: string,
  row: RowPayload
) {
  const trimmedComment = row.comment?.trim() || undefined;
  const nowIso = new Date().toISOString();
  return {
    client_id: newClientId(),
    classroom_id: classroomId,
    source: "text" as const,
    raw_transcript: null,
    command_type: "attendance" as const,
    payload: {
      student_id: studentId,
      status: row.status,
      date,
      ...(trimmedComment ? { comment: trimmedComment } : {}),
    },
    created_at: nowIso,
    approved_at: nowIso,
  };
}

export default function AttendanceClient({ data }: { data: AttendanceDayData }) {
  // Remount the inner panel on date change so per-row local state always
  // mirrors the server-fetched data for the selected day.
  return <AttendanceDay key={data.date} data={data} />;
}

function AttendanceDay({ data }: { data: AttendanceDayData }) {
  const router = useRouter();
  const locale = useUiLocale();

  const initialRows = React.useMemo<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {};
    for (const s of data.students) {
      out[s.id] = {
        status: s.status,
        comment: s.comment,
        saving: false,
      };
    }
    return out;
  }, [data.students]);

  const [rows, setRows] = React.useState<Record<string, RowState>>(initialRows);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkApplying, setBulkApplying] = React.useState(false);
  const inflight = React.useRef(0);

  const unmarkedCount = React.useMemo(
    () => data.students.filter((s) => (rows[s.id] ?? initialRows[s.id])?.status === null).length,
    [data.students, rows, initialRows]
  );

  const overline = (data.classroomName?.toUpperCase() ?? "CLASSROOM") + " · ATTENDANCE REGISTER";
  const dateParts = formatDateParts(data.date, locale);

  const goDay = React.useCallback(
    (delta: number) => {
      const next = addDays(data.date, delta);
      router.push(`/app/attendance?date=${next}`);
    },
    [data.date, router]
  );

  const goToday = React.useCallback(() => {
    const today = localDateString();
    if (today !== data.date) router.push(`/app/attendance?date=${today}`);
  }, [data.date, router]);

  const isToday = data.date === localDateString();

  const saveRow = React.useCallback(
    async (studentId: string, next: Omit<RowState, "saving">) => {
      if (!data.classroomId) return;

      inflight.current += 1;
      setSaveStatus("saving");
      setRows((prev) => ({ ...prev, [studentId]: { ...next, saving: true } }));

      try {
        if (next.status === null) {
          const res = await fetch("/api/v1/attendance", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ student_id: studentId, date: data.date }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
          const res = await fetch("/api/v1/sync/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              commands: [buildAttendanceCommand(data.classroomId, studentId, data.date, next)],
            }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }

        setRows((prev) => ({ ...prev, [studentId]: { ...next, saving: false } }));
      } catch {
        setRows((prev) => ({ ...prev, [studentId]: { ...next, saving: false } }));
        ToastBus.push({
          message: "Couldn't save attendance. Check your connection and try again.",
        });
        setSaveStatus("error");
      } finally {
        inflight.current = Math.max(0, inflight.current - 1);
        if (inflight.current === 0) {
          setSaveStatus((s) => (s === "error" ? "error" : "saved"));
        }
      }
    },
    [data.classroomId, data.date]
  );

  const applyBulk = React.useCallback(
    async (params: BulkAttendanceParams, scope: BulkScope) => {
      if (!data.classroomId || bulkApplying) return;

      const payload: RowPayload = {
        status: params.status,
        comment: params.comment,
      };

      const targets = data.students.filter((s) => {
        if (scope === "all") return true;
        return (rows[s.id] ?? initialRows[s.id])?.status === null;
      });
      if (targets.length === 0) return;

      setBulkApplying(true);
      inflight.current += 1;
      setSaveStatus("saving");

      const ids = targets.map((s) => s.id);
      setRows((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          next[id] = { ...payload, saving: true };
        }
        return next;
      });

      try {
        const commands = ids.map((id) =>
          buildAttendanceCommand(data.classroomId!, id, data.date, payload)
        );
        for (let i = 0; i < commands.length; i += SYNC_BATCH_SIZE) {
          const chunk = commands.slice(i, i + SYNC_BATCH_SIZE);
          const res = await fetch("/api/v1/sync/commands", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ commands: chunk }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }

        setRows((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            next[id] = { ...payload, saving: false };
          }
          return next;
        });
        setBulkOpen(false);
        ToastBus.push({
          message: `Marked ${ids.length} ${ids.length === 1 ? "child" : "children"} ${params.status}.`,
        });
      } catch {
        setRows((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            const prior = initialRows[id] ?? prev[id];
            next[id] = { ...prior, saving: false };
          }
          return next;
        });
        ToastBus.push({
          message: "Couldn't apply bulk attendance. Check your connection and try again.",
        });
        setSaveStatus("error");
      } finally {
        setBulkApplying(false);
        inflight.current = Math.max(0, inflight.current - 1);
        if (inflight.current === 0) {
          setSaveStatus((s) => (s === "error" ? "error" : "saved"));
        }
      }
    },
    [bulkApplying, data.classroomId, data.date, data.students, initialRows, rows]
  );

  const markAllPresent = React.useCallback(() => {
    void applyBulk({ status: "present", comment: null }, "all");
  }, [applyBulk]);

  return (
    <div>
      <PageHeader
        overline={overline}
        title="Attendance"
        subtitle={
          data.students.length === 0
            ? "No children enrolled in this classroom yet."
            : `${data.students.length} ${data.students.length === 1 ? "child" : "children"} on the register.`
        }
      />

      <div style={{ padding: "16px 24px 80px" }}>
        <div className={styles.dateNavWrap}>
          <div className={styles.dateNav}>
            <DayArrow direction="prev" onClick={() => goDay(-1)} large />
            <div className={styles.dateNavCenter}>
              {dateParts.weekday && (
                <span className={`label-cap ${styles.dateNavWeekday}`}>{dateParts.weekday}</span>
              )}
              <span className={`font-display ${styles.dateNavPrimary}`}>
                {dateParts.primary}
                {dateParts.year ? `, ${dateParts.year}` : ""}
              </span>
            </div>
            <DayArrow direction="next" onClick={() => goDay(1)} large />
          </div>
          {!isToday && (
            <button
              type="button"
              onClick={goToday}
              className="tap label-cap"
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-ink-secondary)",
                cursor: "pointer",
                letterSpacing: "0.06em",
              }}
            >
              Today
            </button>
          )}
        </div>

        {data.students.length === 0 ? (
          <div
            style={{
              padding: 36,
              textAlign: "center",
              color: "var(--color-ink-muted)",
              fontSize: 14,
              ...cardStyle,
            }}
          >
            Nothing to record for this day.
          </div>
        ) : (
          <>
            <BulkAttendanceToolbar
              totalStudents={data.students.length}
              unmarkedCount={unmarkedCount}
              applying={bulkApplying}
              bulkOpen={bulkOpen}
              onToggleBulk={() => setBulkOpen((v) => !v)}
              onAllPresent={markAllPresent}
            />
            <BulkAttendancePanel
              open={bulkOpen}
              totalStudents={data.students.length}
              unmarkedCount={unmarkedCount}
              applying={bulkApplying}
              onClose={() => setBulkOpen(false)}
              onApply={(params, scope) => void applyBulk(params, scope)}
            />
            <div className={styles.registerGrid}>
              {data.students.map((student) => {
                const row = rows[student.id] ?? initialRows[student.id];
                return (
                  <StudentRow
                    key={student.id}
                    student={student}
                    row={row}
                    disabled={bulkApplying}
                    onChange={(next) => {
                      setRows((prev) => ({
                        ...prev,
                        [student.id]: { ...next, saving: row.saving },
                      }));
                    }}
                    onCommit={(next) => void saveRow(student.id, next)}
                  />
                );
              })}
            </div>
          </>
        )}

        <div
          style={{
            marginTop: 14,
            fontSize: 12,
            color: "var(--color-ink-muted)",
            textAlign: "left",
          }}
        >
          {saveStatus === "saving" && "Saving register…"}
          {saveStatus === "saved" && "Register saved"}
          {saveStatus === "idle" && "Register saved"}
          {saveStatus === "error" && (
            <span style={{ color: "var(--color-terracotta-deep)" }}>
              Some changes couldn&apos;t be saved.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DayArrow({
  direction,
  onClick,
  large,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  large?: boolean;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const size = large ? 40 : 34;
  const iconSize = large ? 20 : 16;
  return (
    <button
      type="button"
      aria-label={direction === "prev" ? "Previous day" : "Next day"}
      onClick={onClick}
      className="tap"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        color: "var(--color-ink-secondary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <Icon size={iconSize} strokeWidth={1.75} />
    </button>
  );
}

function StudentRow({
  student,
  row,
  disabled,
  onChange,
  onCommit,
}: {
  student: AttendanceDayStudent;
  row: RowState;
  disabled?: boolean;
  onChange: (next: Omit<RowState, "saving">) => void;
  onCommit: (next: Omit<RowState, "saving">) => void;
}) {
  const display = firstName(student.fullName, student.preferredName);
  const [commentMenuOpen, setCommentMenuOpen] = React.useState(false);

  // Clicking the currently-active button clears the mark (undo). Otherwise
  // sets the new status; we drop a comment that no longer makes sense
  // (e.g. "Tardy" while marking absent) but keep custom free-text edits.
  const setStatus = (next: AttendanceDayStatus) => {
    if (disabled) return;
    const target: AttendanceDayStatus = next === row.status ? null : next;

    let nextComment = row.comment;
    if (target === null) {
      nextComment = null;
    } else if (target !== row.status && isPreset(row.status, row.comment)) {
      nextComment = null;
    }

    const nextRow = {
      status: target,
      comment: nextComment,
    };
    onChange(nextRow);
    onCommit(nextRow);
  };

  return (
    <div
      className={`${styles.registerCell} ${commentMenuOpen ? styles.registerCellMenuOpen : ""}`}
      style={{
        ...cardStyle,
        overflow: "visible",
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <div className={styles.registerCellInner}>
        <div className={styles.registerHeader}>
          <Avatar initials={initialsFor(student.fullName)} tone={toneFor(student.id)} size={36} />
          <div className={styles.nameActions}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-ink)",
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {display}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <StatusButton
                label="Present"
                active={row.status === "present"}
                activeBg="var(--color-sage-soft)"
                activeFg="var(--color-sage-deep)"
                onClick={() => setStatus("present")}
              />
              <StatusButton
                label="Absent"
                active={row.status === "absent"}
                activeBg="var(--color-clay-soft)"
                activeFg="var(--color-terracotta-deep)"
                onClick={() => setStatus("absent")}
              />
            </div>
          </div>
        </div>

        <div className={styles.registerFields}>
          <CommentField
            status={row.status}
            value={row.comment}
            onMenuOpenChange={setCommentMenuOpen}
            onChange={(comment) => onChange({ ...row, comment })}
            onCommit={(comment) => onCommit({ ...row, comment })}
          />
        </div>
      </div>
    </div>
  );
}

function StatusButton({
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
      title={active ? `Click to undo (clear ${label.toLowerCase()})` : undefined}
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

const FIELD_HEIGHT = 32;

function CommentField({
  status,
  value,
  onMenuOpenChange,
  onChange,
  onCommit,
}: {
  status: AttendanceDayStatus;
  value: string | null;
  onMenuOpenChange?: (open: boolean) => void;
  onChange: (next: string | null) => void;
  onCommit: (next: string | null) => void;
}) {
  const presets = presetsFor(status);
  const enabled = presets !== null;

  const [open, setOpen] = React.useState(false);
  // Custom mode = the user picked "Custom comment", so the trigger is showing
  // an inline text input. Driven by the value: any non-preset value implies
  // custom mode. Reset whenever status flips so the field can't get stuck.
  const [customMode, setCustomMode] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    onMenuOpenChange?.(open);
  }, [open, onMenuOpenChange]);

  React.useEffect(() => {
    if (!enabled) {
      setCustomMode(false);
      setOpen(false);
      return;
    }
    if (!value) {
      setCustomMode(false);
    } else if (presets && presets.includes(value)) {
      setCustomMode(false);
    } else {
      setCustomMode(true);
    }
  }, [value, presets, enabled]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (anchorRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const placeholder = enabled ? "Add a note" : "Mark first to add a note";

  return (
    <div ref={anchorRef} className={styles.commentField}>
      {enabled && customMode ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "var(--color-canvas)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            paddingLeft: 10,
            paddingRight: 4,
            height: FIELD_HEIGHT,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={value ?? ""}
            placeholder="Type a note…"
            onChange={(e) => onChange(e.target.value || null)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              onCommit(v ? v : null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              background: "transparent",
              fontSize: 13,
              color: "var(--color-ink)",
              outline: "none",
              height: "100%",
            }}
          />
          <DropdownChevronButton ariaLabel="Change note type" onClick={() => setOpen((v) => !v)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!enabled) return;
            setOpen((v) => !v);
          }}
          className="tap"
          disabled={!enabled}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            background: "var(--color-canvas)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "0 10px",
            height: FIELD_HEIGHT,
            fontSize: 13,
            color: enabled
              ? value
                ? "var(--color-ink)"
                : "var(--color-ink-muted)"
              : "var(--color-ink-muted)",
            cursor: enabled ? "pointer" : "not-allowed",
            textAlign: "left",
            opacity: enabled ? 1 : 0.7,
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {value ?? placeholder}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            style={{ color: "var(--color-ink-muted)", flexShrink: 0, marginLeft: 8 }}
          />
        </button>
      )}

      {open && enabled && presets && (
        <CommentMenuPortal anchorRef={anchorRef} menuRef={menuRef}>
          {presets.map((p) => (
            <MenuItem
              key={p}
              label={p}
              active={value === p}
              onClick={() => {
                onChange(p);
                onCommit(p);
                setCustomMode(false);
                setOpen(false);
              }}
            />
          ))}
          <MenuItem
            label="Custom comment"
            active={customMode && !!value}
            onClick={() => {
              setCustomMode(true);
              if (value && presets.includes(value)) onChange(null);
              setOpen(false);
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
          />
        </CommentMenuPortal>
      )}
    </div>
  );
}

function CommentMenuPortal({
  anchorRef,
  menuRef,
  children,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [placement, setPlacement] = React.useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const updatePlacement = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuMaxH = 220;
    const gap = 6;
    const width = Math.max(rect.width, 200);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const placeAbove = spaceBelow < menuMaxH && rect.top > menuMaxH + gap;
    if (placeAbove) {
      setPlacement({
        left: rect.left,
        width,
        bottom: window.innerHeight - rect.top + gap,
      });
    } else {
      setPlacement({
        left: rect.left,
        width,
        top: rect.bottom + gap,
      });
    }
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [updatePlacement]);

  if (!placement || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={styles.commentMenu}
      style={{
        left: placement.left,
        width: placement.width,
        ...(placement.top != null ? { top: placement.top } : {}),
        ...(placement.bottom != null ? { bottom: placement.bottom } : {}),
      }}
    >
      {children}
    </div>,
    document.body
  );
}

function DropdownChevronButton({ ariaLabel, onClick }: { ariaLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseDown={(e) => e.preventDefault()} // don't steal focus from the input
      onClick={onClick}
      className="tap"
      style={{
        height: 24,
        width: 24,
        background: "transparent",
        border: 0,
        color: "var(--color-ink-muted)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
      }}
    >
      <ChevronDown size={14} strokeWidth={1.75} />
    </button>
  );
}

function MenuItem({
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
