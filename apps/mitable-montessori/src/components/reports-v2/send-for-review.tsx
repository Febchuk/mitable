"use client";

import { useEffect, useState } from "react";
import type { MockReport } from "./mock-data";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

type Reviewer = {
  initials: string;
  name: string;
  role: string;
  tone: "clay" | "sage" | "butter" | "blue";
};

/**
 * NOTE: Phase 3 wires the `Send for review` button to POST /api/v1/reports/submit.
 * The reviewer multi-select is a UI affordance — the existing `submit` endpoint
 * has no concept of named reviewers (it just transitions status). Phase 3.5
 * adds the `report_reviewers` table and persists this selection. Until then,
 * the picker captures intent but doesn't write per-reviewer rows.
 */
const AVAILABLE_REVIEWERS: Reviewer[] = [
  { initials: "MW", name: "Mei Wong", role: "Lead · Bluebell room", tone: "sage" },
  { initials: "DR", name: "Diego Ruiz", role: "Assistant · Bluebell", tone: "clay" },
  { initials: "JT", name: "Jamie Tao", role: "Lead · Robin room", tone: "butter" },
  { initials: "RS", name: "Rita Singh", role: "Floater", tone: "blue" },
];

const TONE_CLASS: Record<Reviewer["tone"], string> = {
  clay: styles.avClay,
  sage: styles.avSage,
  butter: styles.avButter,
  blue: styles.avBlue,
};

function scoreClass(score: number) {
  if (score >= 85) return styles.scoreGreen;
  if (score >= 60) return styles.scoreAmber;
  return styles.scoreRed;
}

/** Shared form body for both web drawer + mobile sheet. */
function SendForReviewForm({
  report,
  selected,
  onToggle,
  note,
  onNoteChange,
  error,
  busy,
}: {
  report: MockReport;
  selected: Set<string>;
  onToggle: (initials: string) => void;
  note: string;
  onNoteChange: (next: string) => void;
  error: string | null;
  busy: boolean;
}) {
  return (
    <>
      <div className={styles.aiCallout}>
        <div className={styles.aiRow}>
          <span className={`${styles.score} ${scoreClass(report.aiScore)}`}>
            <span className={styles.scoreBubble}>{report.aiScore}</span>
            {report.aiScore >= 85
              ? "Reviewers likely to fast-approve"
              : "Reviewers will want a closer look"}
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--color-ink-secondary)",
            lineHeight: 1.5,
          }}
        >
          Above 85 = high-confidence. Most green-scored reports are approved without re-reading.
        </div>
      </div>

      <div>
        <label className={styles.fieldLabel}>Assign reviewers · pick 1–3</label>
        <div className={styles.reviewerGrid}>
          {AVAILABLE_REVIEWERS.map((r) => (
            <button
              key={r.initials}
              type="button"
              className={`${styles.reviewerCard} ${
                selected.has(r.initials) ? styles.reviewerCardSelected : ""
              }`}
              onClick={() => onToggle(r.initials)}
              disabled={busy}
            >
              <div className={`${styles.av} ${styles.avSm} ${TONE_CLASS[r.tone]}`}>
                {r.initials}
              </div>
              <div className={styles.info}>
                <span className={styles.nm}>{r.name}</span>
                <span className={styles.role}>{r.role}</span>
              </div>
              <div className={styles.reviewerCheck}>
                <Icon.Check size={11} />
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 9, fontSize: 11.5, color: "var(--color-ink-muted)" }}>
          Parallel review — any of them can tick first. Reviewer-specific notifications come in
          Phase 3.5.
        </div>
      </div>

      <div>
        <label className={styles.fieldLabel}>Note for reviewers · optional</label>
        <textarea
          className={styles.note}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={busy}
          maxLength={2000}
          placeholder="Anything reviewers should know? — e.g. 'Self-correction moment, wanted a second pair of eyes.'"
        />
      </div>

      {error && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--color-terracotta-soft)",
            color: "var(--color-terracotta-deep)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

/** Web right-side drawer. Positioned inside the reading pane (absolute). */
export function SendForReviewDrawer({
  report,
  onClose,
  onSubmit,
}: {
  report: MockReport;
  onClose: () => void;
  /** Async submit. Drawer closes on success; caller toasts. */
  onSubmit: (args: { reviewerInitials: string[]; note: string }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["MW", "DR"]));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ reviewerInitials: [...selected], note: note.trim() });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.drawerScrim} onClick={busy ? undefined : onClose} aria-hidden />
      <aside className={styles.drawer} aria-label="Send for review">
        <div className={styles.drawerHead}>
          <div>
            <h3>Send for review</h3>
            <div className={styles.sub}>
              {report.title} · {report.childName}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "6px 8px", borderRadius: 8 }}
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <Icon.Close size={14} />
          </button>
        </div>
        <div className={styles.drawerBody}>
          <SendForReviewForm
            report={report}
            selected={selected}
            onToggle={(initials) =>
              setSelected((s) => {
                const next = new Set(s);
                if (next.has(initials)) next.delete(initials);
                else next.add(initials);
                return next;
              })
            }
            note={note}
            onNoteChange={setNote}
            error={error}
            busy={busy}
          />
        </div>
        <div className={styles.drawerFoot}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onClose}
            disabled={busy}
          >
            Save draft
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy || selected.size === 0}
            style={{ opacity: busy || selected.size === 0 ? 0.6 : 1 }}
            onClick={submit}
          >
            <Icon.Send size={13} />
            {busy ? "Sending…" : `Send to ${selected.size}`}
          </button>
        </div>
      </aside>
    </>
  );
}

/** Mobile bottom sheet (70vh). Fixed to viewport. */
export function SendForReviewMobileSheet({
  report,
  onClose,
  onSubmit,
}: {
  report: MockReport;
  onClose: () => void;
  onSubmit: (args: { reviewerInitials: string[]; note: string }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["MW", "DR"]));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ reviewerInitials: [...selected], note: note.trim() });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.sheetScrim} onClick={busy ? undefined : onClose} aria-hidden />
      <div className={styles.sheet} role="dialog" aria-label="Send for review">
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHead}>
          <div>
            <h3>Send for review</h3>
            <div className={styles.sub}>
              {report.title} · {report.childName}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "6px 8px", borderRadius: 8 }}
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <Icon.Close size={14} />
          </button>
        </div>
        <div className={styles.sheetBody}>
          <SendForReviewForm
            report={report}
            selected={selected}
            onToggle={(initials) =>
              setSelected((s) => {
                const next = new Set(s);
                if (next.has(initials)) next.delete(initials);
                else next.add(initials);
                return next;
              })
            }
            note={note}
            onNoteChange={setNote}
            error={error}
            busy={busy}
          />
        </div>
        <div className={styles.sheetFoot}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onClose}
            disabled={busy}
          >
            Save draft
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy || selected.size === 0}
            style={{ opacity: busy || selected.size === 0 ? 0.6 : 1 }}
            onClick={submit}
          >
            <Icon.Send size={13} />
            {busy ? "Sending…" : `Send to ${selected.size}`}
          </button>
        </div>
      </div>
    </>
  );
}
