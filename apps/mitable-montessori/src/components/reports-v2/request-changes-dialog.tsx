"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

/**
 * Small modal for the Request-changes action. The /api/v1/reports/changes
 * endpoint requires a notes string (1–2000 chars). We collect it here, the
 * caller POSTs.
 *
 * Reuses the drawer/sheet visual language for consistency. Not a right-side
 * drawer though — this is a centered confirm modal.
 */
export function RequestChangesDialog({
  open,
  reportTitle,
  childName,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  reportTitle: string;
  childName: string;
  onCancel: () => void;
  /** Returns a promise so the dialog can show a spinner + leave its busy
   *  state up to the parent. */
  onSubmit: (notes: string) => Promise<void> | void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNotes("");
      setBusy(false);
    }
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

  const canSubmit = notes.trim().length >= 3 && !busy;

  return (
    <>
      <div className={styles.sheetScrim} onClick={busy ? undefined : onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label="Request changes"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(520px, calc(100vw - 32px))",
          background: "var(--color-surface)",
          borderRadius: 16,
          border: "1px solid var(--color-border)",
          boxShadow: "0 24px 60px -28px rgba(43, 38, 34, 0.30)",
          zIndex: 90,
          animation: "fadeIn 180ms ease both",
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
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Request changes</h3>
            <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-ink-muted)" }}>
              {reportTitle} · {childName}
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
        <div style={{ padding: "16px 22px 20px" }}>
          <label className={styles.fieldLabel}>What needs to change? · sent to the author</label>
          <textarea
            className={styles.note}
            placeholder="e.g. Could you add a quote from the lesson? The connection-to-plane paragraph feels short."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            autoFocus
            disabled={busy}
            style={{ minHeight: 120 }}
          />
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--color-ink-muted)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>The report goes back to the author as a draft.</span>
            <span>{notes.length} / 2000</span>
          </div>
        </div>
        <div
          style={{
            padding: "12px 22px 18px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
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
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.5 }}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(notes.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : "Send back with notes"}
          </button>
        </div>
      </div>
    </>
  );
}
