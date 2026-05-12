"use client";

import { useEffect, useState } from "react";
import { fetchEligibleGuardians, type Guardian } from "@/lib/reports-v2/api";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

/**
 * Two-step send flow: pick guardians → write optional cover note → confirm.
 * The /api/v1/reports/send endpoint requires explicit guardianRefs[] and
 * accepts an optional messageBody. We mirror the legacy
 * SendToParentsDialog UX from report-detail/index.tsx but reuse v2 styling.
 */
export function SendToParentsDialog({
  open,
  reportId,
  studentId,
  reportTitle,
  childName,
  onCancel,
  onSent,
}: {
  open: boolean;
  reportId: string;
  studentId: string;
  reportTitle: string;
  childName: string;
  onCancel: () => void;
  onSent: (count: number) => Promise<void> | void;
}) {
  const [step, setStep] = useState<"recipients" | "message">("recipients");
  const [guardians, setGuardians] = useState<Guardian[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [messageBody, setMessageBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load guardians on open. Pre-select all that have an email so the common
  // case is one-click confirm.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep("recipients");
    setMessageBody("");
    setError(null);
    setGuardians(null);
    setSelected(new Set());
    (async () => {
      try {
        const rows = await fetchEligibleGuardians(studentId);
        if (cancelled) return;
        setGuardians(rows);
        setSelected(new Set(rows.filter((g) => g.email).map((g) => g.guardianId)));
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setGuardians([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const eligible = (guardians ?? []).filter((g) => g.email);
  const canContinue = selected.size > 0 && !busy;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { sendReport } = await import("@/lib/reports-v2/api");
      const { recipientCount } = await sendReport({
        reportId,
        guardianRefs: [...selected],
        messageBody: messageBody.trim() || undefined,
      });
      await onSent(recipientCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.sheetScrim} onClick={busy ? undefined : onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label="Send to parents"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 32px))",
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
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Send to parents</h3>
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

        <div style={{ padding: "16px 22px", flex: 1, overflow: "auto" }}>
          {step === "recipients" && (
            <>
              <label className={styles.fieldLabel}>Who should receive this report?</label>
              {guardians === null && !error && (
                <p
                  style={{
                    padding: "20px 0",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--color-ink-muted)",
                  }}
                >
                  Loading guardians…
                </p>
              )}
              {error && (
                <p
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "var(--color-terracotta-soft)",
                    color: "var(--color-terracotta-deep)",
                    fontSize: 13,
                  }}
                >
                  {error}
                </p>
              )}
              {guardians && guardians.length === 0 && !error && (
                <p
                  style={{
                    padding: "20px 0",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--color-ink-muted)",
                  }}
                >
                  No guardians on file. Add one in the student&apos;s profile first.
                </p>
              )}
              {eligible.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {eligible.map((g) => {
                    const isSelected = selected.has(g.guardianId);
                    return (
                      <button
                        key={g.guardianId}
                        type="button"
                        className={`${styles.reviewerCard} ${isSelected ? styles.reviewerCardSelected : ""}`}
                        onClick={() => {
                          setSelected((s) => {
                            const next = new Set(s);
                            if (next.has(g.guardianId)) next.delete(g.guardianId);
                            else next.add(g.guardianId);
                            return next;
                          });
                        }}
                      >
                        <div className={`${styles.av} ${styles.avSm} ${styles.avBlue}`}>
                          {g.name
                            .split(/\s+/)
                            .map((p) => p[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div className={styles.info}>
                          <span className={styles.nm}>{g.name}</span>
                          <span className={styles.role}>
                            {g.email}
                            {g.relationship ? ` · ${g.relationship}` : ""}
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
              {guardians && guardians.length > eligible.length && (
                <p style={{ marginTop: 10, fontSize: 11.5, color: "var(--color-ink-muted)" }}>
                  {guardians.length - eligible.length} guardian
                  {guardians.length - eligible.length === 1 ? "" : "s"} hidden — no email on file.
                </p>
              )}
            </>
          )}

          {step === "message" && (
            <>
              <label className={styles.fieldLabel}>Cover message · optional</label>
              <textarea
                className={styles.note}
                placeholder={`A short note to the guardians — appears above the report in the email.\n\ne.g. Today's report focuses on her work in the Sensorial area. Let me know if you have questions!`}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                maxLength={2000}
                autoFocus
                disabled={busy}
                style={{ minHeight: 140 }}
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
                <span>
                  Sending to {selected.size} guardian{selected.size === 1 ? "" : "s"}.
                </span>
                <span>{messageBody.length} / 2000</span>
              </div>
              {error && (
                <p
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
                </p>
              )}
            </>
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
          {step === "recipients" ? (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={!canContinue}
                style={{ opacity: canContinue ? 1 : 0.5 }}
                onClick={() => setStep("message")}
              >
                Continue → {selected.size} recipient{selected.size === 1 ? "" : "s"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setStep("recipients")}
                disabled={busy}
              >
                ← Back
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={busy}
                style={{ opacity: busy ? 0.6 : 1 }}
                onClick={send}
              >
                <Icon.Send size={13} />
                {busy ? "Sending…" : `Send to ${selected.size}`}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
