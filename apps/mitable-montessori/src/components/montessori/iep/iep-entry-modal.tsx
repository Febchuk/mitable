"use client";

import * as React from "react";
import { Trash2, X } from "lucide-react";
import {
  PERFORMANCE_BANDS,
  PERFORMANCE_BG,
  PERFORMANCE_FG,
  PERFORMANCE_LABEL,
  PROMPTING_CODES,
  PROMPTING_LABEL,
  formatIepCode,
  type IepEntry,
  type IepGoal,
  type PerformanceBand,
  type PromptingCode,
} from "./data";
import styles from "./iep.module.css";

const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type IepEntryModalProps = {
  open: boolean;
  studentName: string;
  goal: IepGoal;
  /** When set, we're editing this entry; otherwise creating new. */
  entry: IepEntry | null;
  onClose: () => void;
  onSave: (args: {
    entryId?: string;
    performanceBand: PerformanceBand;
    successCount: number;
    promptingCode: PromptingCode;
    note?: string;
  }) => void;
  onDelete?: (entryId: string) => void;
};

export function IepEntryModal({
  open,
  studentName,
  goal,
  entry,
  onClose,
  onSave,
  onDelete,
}: IepEntryModalProps) {
  const [band, setBand] = React.useState<PerformanceBand | null>(null);
  const [count, setCount] = React.useState<number | null>(null);
  const [prompt, setPrompt] = React.useState<PromptingCode | null>(null);
  const [note, setNote] = React.useState("");

  // Re-seed the draft each time the modal opens for a different entry/goal.
  React.useEffect(() => {
    if (!open) return;
    setBand(entry?.performanceBand ?? null);
    setCount(entry?.successCount ?? null);
    setPrompt(entry?.promptingCode ?? null);
    setNote(entry?.note ?? "");
  }, [open, entry]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSave = band !== null && count !== null && prompt !== null;
  const previewCode = canSave
    ? formatIepCode({
        performanceBand: band as PerformanceBand,
        successCount: count as number,
        promptingCode: prompt as PromptingCode,
      })
    : "—";
  const previewBg = band ? PERFORMANCE_BG[band] : "var(--color-muted)";
  const previewFg = band ? PERFORMANCE_FG[band] : "var(--color-ink-muted)";

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      entryId: entry?.id,
      performanceBand: band as PerformanceBand,
      successCount: count as number,
      promptingCode: prompt as PromptingCode,
      note: note.trim() || undefined,
    });
  };

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalCard} role="dialog" aria-label="Log IEP progress">
        <div className={styles.sheetGrip} />

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
              {studentName} · {goal.domain}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--color-ink)",
                letterSpacing: "-0.01em",
                lineHeight: 1.25,
              }}
            >
              {goal.name}
            </div>
          </div>
          <button
            type="button"
            className="tap"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-ink-secondary)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>

        {/* live code preview */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--color-canvas)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              minWidth: 64,
              height: 44,
              padding: "0 10px",
              borderRadius: 10,
              background: previewBg,
              color: previewFg,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "0.02em",
              display: "grid",
              placeItems: "center",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            {previewCode}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", lineHeight: 1.35 }}>
            <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>Cell code preview</span>
            <br />
            Performance · success out of 10 · prompting
          </div>
        </div>

        {/* Performance band */}
        <Section
          label="Performance"
          hint="I = Introduced · E = Emerging · P = Progressing · C = Consistent · S = Self-sufficient"
        >
          <div className={styles.chipRow}>
            {PERFORMANCE_BANDS.map((b) => (
              <button
                key={b}
                type="button"
                className={`${styles.chip} tap`}
                data-active={band === b ? "true" : "false"}
                onClick={() => setBand(b)}
                aria-label={`${b} — ${PERFORMANCE_LABEL[b]}`}
                title={PERFORMANCE_LABEL[b]}
              >
                <span className={styles.chipSwatch} style={{ background: PERFORMANCE_BG[b] }} />
                <span style={{ fontWeight: 700 }}>{b}</span>
                <span style={{ fontWeight: 500, opacity: 0.85 }}>{PERFORMANCE_LABEL[b]}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* Success count */}
        <Section label="Success count (0–10)">
          <div className={styles.countRow}>
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.countBtn} tap`}
                data-active={count === n ? "true" : "false"}
                onClick={() => setCount(n)}
                aria-label={`${n} of 10`}
              >
                {n}
              </button>
            ))}
          </div>
        </Section>

        {/* Prompting */}
        <Section
          label="Prompting"
          hint="N = None · G = Gestural · V = Verbal · H = Partial physical · F = Full physical"
        >
          <div className={styles.chipRow}>
            {PROMPTING_CODES.map((p) => (
              <button
                key={p}
                type="button"
                className={`${styles.chip} tap`}
                data-active={prompt === p ? "true" : "false"}
                onClick={() => setPrompt(p)}
                aria-label={`${p} — ${PROMPTING_LABEL[p]}`}
                title={PROMPTING_LABEL[p]}
              >
                <span style={{ fontWeight: 700 }}>{p}</span>
                <span style={{ fontWeight: 500, opacity: 0.85 }}>{PROMPTING_LABEL[p]}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* Note */}
        <Section label="Note (optional)">
          <textarea
            placeholder="What stood out today?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: "100%",
              background: "var(--color-canvas)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: "10px 12px",
              fontFamily: "var(--font-display)",
              fontSize: 17,
              color: "var(--color-ink)",
              minHeight: 56,
              resize: "vertical",
              lineHeight: 1.3,
            }}
          />
        </Section>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 18,
          }}
        >
          {entry && onDelete ? (
            <button
              type="button"
              className="tap"
              onClick={() => onDelete(entry.id)}
              style={{
                background: "transparent",
                border: "1px solid var(--color-border)",
                color: "var(--color-terracotta-deep)",
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Trash2 size={13} strokeWidth={1.6} />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="tap"
              onClick={onClose}
              style={{
                background: "var(--color-muted)",
                border: "1px solid var(--color-border)",
                color: "var(--color-ink-secondary)",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="tap"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                background: canSave ? "var(--color-ink)" : "var(--color-muted)",
                border: `1px solid ${canSave ? "var(--color-ink)" : "var(--color-border)"}`,
                color: canSave ? "var(--color-surface)" : "var(--color-ink-muted)",
                padding: "10px 16px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              {entry ? "Save changes" : "Save entry"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        className="label-cap"
        style={{ color: "var(--color-ink-muted)", marginBottom: 6, letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: "var(--color-ink-muted)", marginTop: 6 }}>{hint}</div>
      )}
    </div>
  );
}
