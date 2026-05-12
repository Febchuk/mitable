"use client";

import { useEffect, useState } from "react";
import type { MockReport } from "./mock-data";
import {
  assignReviewers,
  fetchReviewerCandidates,
  type ReviewerCandidate,
} from "@/lib/reports-v2/api";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

const TONE_ROTATION = [styles.avSage, styles.avClay, styles.avButter, styles.avBlue] as const;

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

/**
 * Admin reassignment dialog. Pre-fills the picker with the report's current
 * reviewer set, lets the admin add/remove, then POSTs the new list.
 *
 * Differs from the author's send-for-review drawer:
 *   - opens after the report is already in_review (status doesn't change)
 *   - confirms intent ("Replace reviewer list?") because it wipes existing
 *     tick state
 */
export function ReassignReviewersDialog({
  open,
  report,
  onCancel,
  onSaved,
}: {
  open: boolean;
  report: MockReport;
  onCancel: () => void;
  onSaved: (count: number) => Promise<void> | void;
}) {
  const [candidates, setCandidates] = useState<ReviewerCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(report.reviewerRows?.map((r) => r.userId) ?? [])
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCandidates(true);
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
        if (!cancelled) setLoadingCandidates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  // Pre-existing reviewer rows that don't appear in `candidates` (e.g. the
  // reviewer was deactivated or the current user is one of them). Show them
  // as already-selected non-toggleable entries so the admin sees the whole
  // assignment list.
  const candidateIds = new Set(candidates.map((c) => c.userId));
  const orphanRows = (report.reviewerRows ?? []).filter((r) => !candidateIds.has(r.userId));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await assignReviewers(report.id, [...selected]);
      await onSaved(selected.size);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const currentCount = report.reviewerRows?.length ?? 0;
  const changed =
    selected.size !== currentCount ||
    [...selected].some((id) => !(report.reviewerRows ?? []).find((r) => r.userId === id));

  return (
    <>
      <div className={styles.sheetScrim} onClick={busy ? undefined : onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label="Reassign reviewers"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(540px, calc(100vw - 32px))",
          background: "var(--color-surface)",
          borderRadius: 16,
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 60px -28px rgba(43, 38, 34, 0.30)",
          zIndex: 90,
          animation: "fadeIn 180ms ease both",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 48px)",
        }}
      >
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Reassign reviewers</h3>
            <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-muted)" }}>
              {report.title} · {report.childName}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "6px 8px", borderRadius: 8 }}
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
          >
            <Icon.Close size={14} />
          </button>
        </div>

        <div style={{ padding: "16px 22px", flex: 1, overflow: "auto" }}>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              color: "var(--color-ink-secondary)",
              lineHeight: 1.5,
            }}
          >
            Replacing the reviewer list wipes existing ✓ ticks. Reviewers who already approved will
            need to do so again.
          </p>

          {orphanRows.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label className={styles.fieldLabel}>Currently assigned (not in school)</label>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--color-ink-muted)",
                  padding: "8px 10px",
                  background: "var(--color-muted)",
                  borderRadius: 8,
                }}
              >
                {orphanRows.length} reviewer{orphanRows.length === 1 ? "" : "s"} can&apos;t be shown
                — likely deactivated. Removing this assignment will clear them.
              </div>
            </div>
          )}

          <label className={styles.fieldLabel}>Assigned reviewers</label>
          {loadingCandidates ? (
            <div
              style={{
                padding: "12px 0",
                fontSize: 12.5,
                color: "var(--color-ink-muted)",
              }}
            >
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
          ) : (
            <div className={styles.reviewerGrid}>
              {candidates.map((c, i) => {
                const isSelected = selected.has(c.userId);
                return (
                  <button
                    key={c.userId}
                    type="button"
                    className={`${styles.reviewerCard} ${
                      isSelected ? styles.reviewerCardSelected : ""
                    }`}
                    onClick={() =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (next.has(c.userId)) next.delete(c.userId);
                        else next.add(c.userId);
                        return next;
                      })
                    }
                    disabled={busy}
                  >
                    <div
                      className={`${styles.av} ${styles.avSm} ${TONE_ROTATION[i % TONE_ROTATION.length]}`}
                    >
                      {initialsOf(c.name)}
                    </div>
                    <div className={styles.info}>
                      <span className={styles.nm}>{c.name}</span>
                      <span className={styles.role}>
                        {c.role === "admin" ? "Admin" : "Teacher"}
                      </span>
                    </div>
                    <div className={styles.reviewerCheck}>
                      <Icon.Check size={11} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 12,
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
        </div>

        <div
          style={{
            padding: "12px 22px 18px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            gap: 9,
          }}
        >
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy || !changed}
            style={{ opacity: busy || !changed ? 0.6 : 1 }}
            onClick={save}
          >
            {busy
              ? "Saving…"
              : selected.size === 0
                ? "Clear all reviewers"
                : `Save · ${selected.size} reviewer${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </>
  );
}
