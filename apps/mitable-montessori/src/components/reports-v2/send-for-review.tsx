"use client";

import { useEffect, useState } from "react";
import type { MockReport } from "./mock-data";
import { fetchReviewerCandidates, type ReviewerCandidate } from "@/lib/reports-v2/api";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

const TONE_ROTATION = [styles.avSage, styles.avClay, styles.avButter, styles.avBlue] as const;

function scoreClass(score: number) {
  if (score >= 85) return styles.scoreGreen;
  if (score >= 60) return styles.scoreAmber;
  return styles.scoreRed;
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "??"
  );
}

/** Shared form body for both web drawer + mobile sheet. */
function SendForReviewForm({
  report,
  candidates,
  loadingCandidates,
  loadError,
  selected,
  onToggle,
  note,
  onNoteChange,
  error,
  busy,
}: {
  report: MockReport;
  candidates: ReviewerCandidate[];
  loadingCandidates: boolean;
  loadError: string | null;
  selected: Set<string>;
  onToggle: (userId: string) => void;
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
        <label className={styles.fieldLabel}>Assign reviewers · pick 1–10</label>
        {loadingCandidates ? (
          <div style={{ padding: "12px 0", fontSize: 12.5, color: "var(--color-ink-muted)" }}>
            Loading reviewers…
          </div>
        ) : loadError ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--color-terracotta-soft)",
              color: "var(--color-terracotta-deep)",
              fontSize: 12.5,
            }}
          >
            {loadError}
          </div>
        ) : candidates.length === 0 ? (
          <div style={{ padding: "10px 0", fontSize: 12.5, color: "var(--color-ink-muted)" }}>
            No other teachers or admins in this school yet. Submit without assignees — anyone with
            access can still approve.
          </div>
        ) : (
          <div className={styles.reviewerGrid}>
            {candidates.map((c, i) => (
              <button
                key={c.userId}
                type="button"
                className={`${styles.reviewerCard} ${
                  selected.has(c.userId) ? styles.reviewerCardSelected : ""
                }`}
                onClick={() => onToggle(c.userId)}
                disabled={busy}
              >
                <div
                  className={`${styles.av} ${styles.avSm} ${TONE_ROTATION[i % TONE_ROTATION.length]}`}
                >
                  {initialsOf(c.name)}
                </div>
                <div className={styles.info}>
                  <span className={styles.nm}>{c.name}</span>
                  <span className={styles.role}>{c.role === "admin" ? "Admin" : "Teacher"}</span>
                </div>
                <div className={styles.reviewerCheck}>
                  <Icon.Check size={11} />
                </div>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 9, fontSize: 11.5, color: "var(--color-ink-muted)" }}>
          Parallel review — any of them can tick first.
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

/** Hook: load reviewer candidates once when the drawer opens. */
function useReviewerCandidates() {
  const [candidates, setCandidates] = useState<ReviewerCandidate[]>([]);
  const [loadingCandidates, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchReviewerCandidates()
      .then((rows) => {
        if (cancelled) return;
        setCandidates(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { candidates, loadingCandidates, loadError };
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
  onSubmit: (args: { reviewerIds: string[]; note: string }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { candidates, loadingCandidates, loadError } = useReviewerCandidates();

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
      await onSubmit({ reviewerIds: [...selected], note: note.trim() });
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
            candidates={candidates}
            loadingCandidates={loadingCandidates}
            loadError={loadError}
            selected={selected}
            onToggle={(userId) =>
              setSelected((s) => {
                const next = new Set(s);
                if (next.has(userId)) next.delete(userId);
                else next.add(userId);
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
            disabled={busy}
            style={{ opacity: busy ? 0.6 : 1 }}
            onClick={submit}
          >
            <Icon.Send size={13} />
            {busy
              ? "Sending…"
              : selected.size === 0
                ? "Send without assignees"
                : `Send to ${selected.size}`}
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
  onSubmit: (args: { reviewerIds: string[]; note: string }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { candidates, loadingCandidates, loadError } = useReviewerCandidates();

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
      await onSubmit({ reviewerIds: [...selected], note: note.trim() });
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
            candidates={candidates}
            loadingCandidates={loadingCandidates}
            loadError={loadError}
            selected={selected}
            onToggle={(userId) =>
              setSelected((s) => {
                const next = new Set(s);
                if (next.has(userId)) next.delete(userId);
                else next.add(userId);
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
            disabled={busy}
            style={{ opacity: busy ? 0.6 : 1 }}
            onClick={submit}
          >
            <Icon.Send size={13} />
            {busy
              ? "Sending…"
              : selected.size === 0
                ? "Send without assignees"
                : `Send to ${selected.size}`}
          </button>
        </div>
      </div>
    </>
  );
}
