"use client";

import * as React from "react";
import type { AttendanceSendResult } from "@/lib/attendance/parent-notifications";

type Preview = {
  confirmation: string;
  present: number;
  absent: number;
  unmarked: number;
  withoutEmail: number;
  emails: number;
};
const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

export function AttendanceSendPanel({
  date,
  classroomIds,
  markedCount,
  disabled,
  onBusyChange,
}: {
  date: string;
  classroomIds: string[];
  markedCount: number;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AttendanceSendResult | null>(null);

  React.useEffect(() => {
    if (disabled && preview && !busy) {
      setPreview(null);
      onBusyChange(false);
      setError(
        "Attendance is saving or has unsaved changes. Review it again once the register is saved."
      );
    }
  }, [disabled, preview, busy, onBusyChange]);

  async function request(confirmation?: string) {
    const response = await fetch("/api/v1/attendance/send", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, classroomIds, ...(confirmation ? { confirmation } : {}) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not send attendance. Please try again.");
    return body;
  }
  async function review() {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await request());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load attendance.");
      onBusyChange(false);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!preview || busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await request(preview.confirmation));
      setPreview(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not confirm sending. Review attendance and retry; accepted updates will not be sent twice."
      );
      setPreview(null);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <section
      aria-label="Send attendance to parents"
      style={{
        marginTop: 20,
        padding: 18,
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        background: "var(--color-surface)",
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-ink-secondary)" }}>
        Marks save automatically. Review and confirm when you are ready to notify parents.
      </p>
      {!preview && (
        <button
          type="button"
          style={{
            ...buttonStyle,
            background: "var(--color-ink)",
            color: "var(--color-surface)",
            opacity: disabled || busy || !markedCount ? 0.5 : 1,
          }}
          disabled={disabled || busy || !markedCount}
          onClick={() => void review()}
        >
          {busy ? "Preparing…" : "Confirm and send to parents"}
        </button>
      )}
      {preview && (
        <div aria-label="Review attendance updates">
          <p style={{ fontWeight: 600 }}>Review saved attendance for {date}</p>
          <p>
            {preview.present} present · {preview.absent} absent · {preview.unmarked} unmarked
          </p>
          <p>
            {preview.emails} parent email update{preview.emails === 1 ? "" : "s"}. Unmarked children
            will not be included.
          </p>
          {preview.withoutEmail > 0 && (
            <p role="status">
              {preview.withoutEmail} marked child{preview.withoutEmail === 1 ? " has" : "ren have"}{" "}
              no linked parent email enabled for reports. Ask an administrator to update their
              parent details.
            </p>
          )}
          <p style={{ fontSize: 12 }}>
            Previously accepted updates will be skipped. Changed attendance can be sent as an
            update.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={{
                ...buttonStyle,
                background: "var(--color-ink)",
                color: "var(--color-surface)",
              }}
              disabled={disabled || busy || !preview.emails}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send attendance updates"}
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={busy}
              onClick={() => {
                setPreview(null);
                onBusyChange(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--color-terracotta-deep)" }}>
          {error}
        </p>
      )}
      {result && (
        <div role="status">
          <p>
            {result.sent} email update{result.sent === 1 ? "" : "s"} accepted for delivery.{" "}
            {result.alreadySent} already sent.
          </p>
          {result.failed > 0 && (
            <p>{result.failed} failed. Review and send again to retry only the unsent updates.</p>
          )}
          {result.pending > 0 && (
            <p>
              {result.pending} still awaiting confirmation. Wait a few minutes, then review and send
              again; accepted updates will be skipped.
            </p>
          )}
          {result.needsReview > 0 && (
            <p>
              {result.needsReview} older attempt{result.needsReview === 1 ? " needs" : "s need"} an
              administrator to check delivery history before sending again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
