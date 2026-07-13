"use client";

import * as React from "react";
import { AlertTriangle, Check, RotateCcw, Send, Trash2, X } from "lucide-react";
import type { AiFlag, ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToastBus } from "@/components/montessori/primitives";
import { fetchReviewerCandidates, type ReviewerCandidate } from "@/lib/reports/api";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
import { reportAiScoringEnabled } from "@/lib/feature-flags";
import styles from "./reports-rail.module.css";
import { scoreToneBand, type ActionRailModal } from "./action-rail";

export type ReportModal = ActionRailModal | null;

/**
 * Mounts the action-rail modals (Score · History · Submit · Approve · Request
 * changes · Delete) and routes server actions through a single `onChanged`
 * callback so the rail view can revalidate. Preview PDF is NOT a modal —
 * the rail's preview toggle swaps the editor pane in-place. Pure controlled —
 * caller owns the open state.
 */
export function ReportModalsHost({
  open,
  onClose,
  report,
  isAdmin,
  onChanged,
  backToReportsHref,
}: {
  open: ReportModal;
  onClose: () => void;
  report: ReportDetailRow;
  isAdmin: boolean;
  /** Fires after Submit/Delete success so the parent can refresh the rail. */
  onChanged: () => void;
  /** Where to navigate after delete; defaults to /app/reports. */
  backToReportsHref?: string;
}) {
  return (
    <>
      <AiScoreDialog open={open === "score"} onClose={onClose} report={report} />
      <HistoryDialog open={open === "history"} onClose={onClose} report={report} />
      <SendToParentsDialog
        open={open === "send"}
        onOpenChange={(v) => !v && onClose()}
        reportId={report.id}
        studentId={report.studentId}
        studentName={report.studentName}
        onSent={() => {
          onChanged();
          onClose();
        }}
      />
      <ApproveDialog
        open={open === "approve"}
        onClose={onClose}
        report={report}
        onChanged={onChanged}
      />
      <RequestChangesDialog
        open={open === "request_changes"}
        onClose={onClose}
        report={report}
        onChanged={onChanged}
      />
      <DeleteDialog
        open={open === "delete"}
        onClose={onClose}
        report={report}
        isAdmin={isAdmin}
        onChanged={onChanged}
        backToReportsHref={backToReportsHref ?? "/app/reports"}
      />
    </>
  );
}

/* ───────────────────────── AI score ───────────────────────── */

const SCORE_LABEL: Record<"high" | "med" | "low", string> = {
  high: "Ready",
  med: "Review needed",
  low: "Needs work",
};

const FLAG_KIND_LABEL: Record<AiFlag["kind"], string> = {
  tone: "Tone",
  evidence: "Evidence",
  pii: "No PII",
  template: "Template",
};

function AiScoreDialog({
  open,
  onClose,
  report,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDetailRow;
}) {
  const score = report.aiScore;
  if (!reportAiScoringEnabled()) return null;
  const tone = scoreToneBand(score ?? 0);
  const flags: AiFlag[] = report.aiFlags ?? [];
  const reasoning: string[] = report.aiReasoning ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={styles.rrModalCard}>
        <DialogHeader>
          <DialogTitle>AI confidence</DialogTitle>
          <DialogDescription>How Mitable read this draft.</DialogDescription>
        </DialogHeader>

        {score == null ? (
          <div className={styles.rrFieldHint}>
            Mitable hasn&rsquo;t scored this report yet. The score appears after the draft is saved
            and analyzed.
          </div>
        ) : (
          <>
            <div className={styles.rrScoreHero} data-tone={tone}>
              <div className={styles.rrScoreHeroBubble}>{score}</div>
              <div className={styles.rrScoreHeroMeta}>
                <div className={styles.rrScoreHeroLabel}>{SCORE_LABEL[tone]}</div>
                <div className={styles.rrScoreHeroSub}>
                  {tone === "high"
                    ? "Reviewers usually approve scores 85+ without re-reading."
                    : tone === "med"
                      ? "Worth a closer look before sending to reviewers."
                      : "Tighten this draft before submitting."}
                </div>
              </div>
            </div>

            {flags.length > 0 && (
              <div className={styles.rrFieldGroup}>
                <label className={styles.rrFieldLabel}>Signals</label>
                <div className={styles.rrFlagRow}>
                  {flags.map((f, i) => (
                    <span
                      key={`${f.kind}-${i}`}
                      className={styles.rrFlagChip}
                      data-status={f.status}
                      title={f.note}
                    >
                      {f.status === "ok" ? (
                        <Check size={10} strokeWidth={3} />
                      ) : f.status === "warn" ? (
                        <AlertTriangle size={10} strokeWidth={2.4} />
                      ) : (
                        <X size={10} strokeWidth={3} />
                      )}
                      {FLAG_KIND_LABEL[f.kind]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {reasoning.length > 0 && (
              <div className={styles.rrFieldGroup}>
                <label className={styles.rrFieldLabel}>Why this score</label>
                <ul className={styles.rrReasoningList}>
                  {reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className={styles.rrModalFoot}>
          <button type="button" className="rd-btn rd-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Approve ───────────────────────── */

function ApproveDialog({
  open,
  onClose,
  report,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDetailRow;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/reports/approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't approve this report." });
        return;
      }
      ToastBus.push({ message: "Report approved." });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className={`${styles.rrModalCard} ${styles.rrModalCardSm}`}>
        <DialogHeader>
          <DialogTitle>Approve this report?</DialogTitle>
          <DialogDescription>
            {report.title || `${report.studentName} report`} · {report.studentName}
          </DialogDescription>
        </DialogHeader>
        <p className={styles.rrFieldHint}>
          Approving clears the report to be sent to parents. The teacher will see it in their
          approved queue.
        </p>
        <div className={styles.rrModalFoot}>
          <button
            type="button"
            className="rd-btn rd-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rd-btn rd-btn-primary"
            onClick={() => void submit()}
            disabled={busy}
            style={{
              background: "var(--color-sage-deep)",
              color: "#fff",
              border: "1px solid var(--color-sage-deep)",
            }}
          >
            <Check size={13} strokeWidth={2.4} />
            {busy ? "Approving…" : "Approve"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Request changes ───────────────────────── */

function RequestChangesDialog({
  open,
  onClose,
  report,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDetailRow;
  onChanged: () => void;
}) {
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) setNotes("");
  }, [open]);

  const submit = async () => {
    const trimmed = notes.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/reports/changes", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: report.id, notes: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't send back for changes." });
        return;
      }
      ToastBus.push({ message: "Sent back for changes." });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || notes.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className={styles.rrModalCard}>
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            Send {report.studentName}&rsquo;s report back to the teacher with a note explaining what
            to fix.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.rrFieldGroup}>
          <label className={styles.rrFieldLabel} htmlFor="rr-request-changes-notes">
            What needs to change?
          </label>
          <textarea
            id="rr-request-changes-notes"
            className={styles.rrTextarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            maxLength={2000}
            placeholder="e.g. Add a quote from outdoor play; tighten the math observation."
          />
          <span className={styles.rrFieldHint}>
            The teacher will see this in their drafts queue.
          </span>
        </div>
        <div className={styles.rrModalFoot}>
          <button
            type="button"
            className="rd-btn rd-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rd-btn rd-btn-primary"
            onClick={() => void submit()}
            disabled={disabled}
          >
            <RotateCcw size={13} strokeWidth={2.2} />
            {busy ? "Sending…" : "Send back for changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── History ───────────────────────── */

type HistoryEvent = {
  id: string;
  dot: "sage" | "butter" | "clay";
  head: string;
  body?: string;
  time: string;
};

function fmtTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildHistory(report: ReportDetailRow, locale: string): HistoryEvent[] {
  // Synthesized client-side from the report row. A dedicated audit-log
  // endpoint would replace this — for now we surface the key transitions
  // that are persisted on the report itself: created, scored, submitted
  // (we only know latest), approved, sent. Returned newest → oldest.
  const events: HistoryEvent[] = [];

  if (report.sentAt) {
    events.push({
      id: "sent",
      dot: "sage",
      head: "Sent to parents",
      body: "Delivered to guardians.",
      time: fmtTime(report.sentAt, locale),
    });
  }
  if (report.approvedAt) {
    events.push({
      id: "approved",
      dot: "sage",
      head: "Approved",
      body: report.approvedByUserId ? "Cleared to send to parents." : undefined,
      time: fmtTime(report.approvedAt, locale),
    });
  }
  if (report.hasBeenSubmitted) {
    events.push({
      id: "submitted",
      dot: "butter",
      head: "Submitted for review",
      time: fmtTime(report.updatedAt, locale),
    });
  }
  if (report.aiScoredAt && typeof report.aiScore === "number" && reportAiScoringEnabled()) {
    events.push({
      id: "scored",
      dot: "clay",
      head: `AI score ${report.aiScore}`,
      body: report.aiReasoning?.length ? report.aiReasoning.join(" · ").slice(0, 140) : undefined,
      time: fmtTime(report.aiScoredAt, locale),
    });
  }
  events.push({
    id: "created",
    dot: "clay",
    head: "Draft created",
    body: report.classroomName ? `In ${report.classroomName}.` : undefined,
    time: fmtTime(report.createdAt, locale),
  });

  return events;
}

function HistoryDialog({
  open,
  onClose,
  report,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDetailRow;
}) {
  const locale = useUiLocale();
  const events = React.useMemo(() => buildHistory(report, locale), [report, locale]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={styles.rrModalCard}>
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>Everything that happened to this report.</DialogDescription>
        </DialogHeader>
        <div className={styles.rrHistoryTrail}>
          {events.map((ev) => (
            <div key={ev.id} className={styles.rrHistoryEvent}>
              <div className={`${styles.rrHistoryDot} ${styles[`rrDot_${ev.dot}`]}`} aria-hidden />
              <div>
                <div className={styles.rrHistoryHead}>
                  <b>{ev.head}</b>
                  {ev.time && <span className={styles.rrHistoryTime}>{ev.time}</span>}
                </div>
                {ev.body && <div className={styles.rrHistoryBody}>{ev.body}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.rrModalFoot}>
          <button type="button" className="rd-btn rd-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Submit for review ───────────────────────── */

const TONES = ["sage", "clay", "butter", "blue"] as const;

function initials(name: string): string {
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

export function SubmitForReviewDialog({
  open,
  onClose,
  report,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDetailRow;
  onChanged: () => void;
}) {
  const [candidates, setCandidates] = React.useState<ReviewerCandidate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Lazy-load candidates the first time the dialog opens, then keep them
  // cached for re-opens during the same session.
  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    setLoadError(null);
    fetchReviewerCandidates()
      .then((rows) => setCandidates(rows))
      .catch((e: unknown) => setLoadError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open]);

  // Reset transient form state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setNote("");
    }
  }, [open]);

  const toggle = (userId: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/reports/submit", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          reviewerIds: [...selected],
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't submit for review." });
        return;
      }
      ToastBus.push({
        message:
          selected.size === 0
            ? "Submitted for review."
            : `Submitted for review — ${selected.size} reviewer${selected.size === 1 ? "" : "s"}.`,
      });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className={styles.rrModalCard}>
        <DialogHeader>
          <DialogTitle>
            {report.hasBeenSubmitted ? "Resubmit for review" : "Submit for review"}
          </DialogTitle>
          <DialogDescription>
            Pick reviewers (optional). Anyone with access can approve once submitted.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.rrFieldGroup}>
          <label className={styles.rrFieldLabel}>Reviewers</label>
          {loading ? (
            <div className={styles.rrFieldHint}>Loading reviewers…</div>
          ) : loadError ? (
            <div className={styles.rrFieldError}>{loadError}</div>
          ) : candidates.length === 0 ? (
            <div className={styles.rrFieldHint}>
              No other teachers or admins in this school yet — submit without assignees and anyone
              with access can approve.
            </div>
          ) : (
            <div className={styles.rrReviewerGrid}>
              {candidates.map((c, i) => {
                const isSelected = selected.has(c.userId);
                const tone = TONES[i % TONES.length];
                return (
                  <button
                    key={c.userId}
                    type="button"
                    onClick={() => toggle(c.userId)}
                    className={`${styles.rrReviewerCard} ${
                      isSelected ? styles.rrReviewerCardSelected : ""
                    } tap`}
                    disabled={busy}
                  >
                    <div
                      className={`${styles.rrRailAvatar} ${styles[`rrTone_${tone}`]}`}
                      aria-hidden
                    >
                      {initials(c.name)}
                    </div>
                    <div className={styles.rrReviewerMeta}>
                      <span className={styles.rrReviewerName}>{c.name}</span>
                      <span className={styles.rrReviewerRole}>
                        {c.role === "admin" ? "Admin" : "Teacher"}
                      </span>
                    </div>
                    <div className={styles.rrReviewerCheck} aria-hidden>
                      {isSelected ? "✓" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.rrFieldGroup}>
          <label className={styles.rrFieldLabel} htmlFor="rr-review-note">
            Note for reviewers · optional
          </label>
          <textarea
            id="rr-review-note"
            className={styles.rrTextarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            maxLength={2000}
            placeholder="Anything reviewers should know?"
          />
        </div>

        <div className={styles.rrModalFoot}>
          <button
            type="button"
            className="rd-btn rd-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rd-btn rd-btn-primary"
            onClick={() => void submit()}
            disabled={busy}
          >
            <Send size={13} strokeWidth={2.2} />
            {busy ? "Submitting…" : selected.size === 0 ? "Submit" : `Submit to ${selected.size}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Delete ───────────────────────── */

function DeleteDialog({
  open,
  onClose,
  report,
  isAdmin,
  onChanged,
  backToReportsHref,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportDetailRow;
  isAdmin: boolean;
  onChanged: () => void;
  backToReportsHref: string;
}) {
  const [busy, setBusy] = React.useState(false);

  // Treat approved/sent deletion as a "harder" action — extra copy and admin-only.
  const isProtectedStatus = report.status === "approved" || report.status === "sent";

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/reports/${report.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't delete this report." });
        return;
      }
      ToastBus.push({ message: "Report deleted." });
      onClose();
      onChanged();
      // Navigation back to the list is handled by the parent (rail view
      // clears selection); standalone callers can pass backToReportsHref.
      void backToReportsHref;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className={`${styles.rrModalCard} ${styles.rrModalCardSm}`}>
        <DialogHeader>
          <DialogTitle>Delete this report?</DialogTitle>
          <DialogDescription>
            {report.title || `${report.studentName} report`} · {report.studentName}
          </DialogDescription>
        </DialogHeader>
        <div className={styles.rrDeleteBody}>
          <p>
            This will permanently delete the report and any attached photos, quotes, and voice
            memos.
          </p>
          {isProtectedStatus && (
            <p className={styles.rrDeleteWarn}>
              This report has already been{" "}
              {report.status === "sent" ? "sent to parents" : "approved"}
              {isAdmin ? " — deleting it as an admin will remove it from everyone's queue." : "."}
            </p>
          )}
          <p className={styles.rrDeleteHint}>You can&rsquo;t undo this.</p>
        </div>
        <div className={styles.rrModalFoot}>
          <button
            type="button"
            className="rd-btn rd-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rd-btn rd-btn-danger-ghost"
            onClick={() => void submit()}
            disabled={busy}
            style={{
              background: "var(--color-terracotta)",
              color: "#fff",
              border: "1px solid var(--color-terracotta)",
            }}
          >
            <Trash2 size={13} strokeWidth={2} />
            {busy ? "Deleting…" : "Delete report"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Send to parents ───────────────────────── */

type GuardianRow = {
  guardianId: string;
  name: string;
  email: string | null;
  relationship: string | null;
};

type SendStep = "recipients" | "message";

export function SendToParentsDialog({
  reportId,
  studentId,
  studentName,
  open,
  onOpenChange,
  onSent,
}: {
  reportId: string;
  studentId: string;
  studentName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent: () => void;
}) {
  const [step, setStep] = React.useState<SendStep>("recipients");
  const [guardians, setGuardians] = React.useState<GuardianRow[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [messageBody, setMessageBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep("recipients");
    setMessageBody("");
    setError(null);
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v1/students/${studentId}/guardians?receivesReports=true`, {
        credentials: "include",
      });
      if (cancelled) return;
      if (!res.ok) {
        setError("Couldn't load guardians.");
        return;
      }
      const data = (await res.json()) as { guardians: GuardianRow[] };
      setGuardians(data.guardians);
      setSelected(new Set(data.guardians.filter((g) => g.email).map((g) => g.guardianId)));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  const toggleGuardian = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const sendRes = await fetch("/api/v1/reports/send", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId,
          guardianRefs: [...selected],
          messageBody: messageBody.trim() || undefined,
        }),
      });
      const sendData = (await sendRes.json().catch(() => ({}))) as {
        error?: string;
        drain?: { sent?: number; failed?: number };
      };
      if (!sendRes.ok) {
        setError(sendData.error || "Couldn't send report.");
        return;
      }
      const sentCount = sendData.drain?.sent ?? selected.size;
      ToastBus.push({
        message: `Report emailed to ${sentCount} guardian${sentCount === 1 ? "" : "s"}.`,
      });
      onSent();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const eligible = guardians?.filter((g) => g.email) ?? [];
  const firstName = studentName.split(" ")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.rrModalCard}>
        {step === "recipients" ? (
          <>
            <DialogHeader>
              <DialogTitle>Send report to parents</DialogTitle>
              <DialogDescription>
                Choose which of {firstName}&apos;s guardians should receive this report by email.
              </DialogDescription>
            </DialogHeader>

            {guardians === null && !error && (
              <p className="py-4 text-center text-sm text-ink-secondary">Loading guardians…</p>
            )}

            {error && <p className="py-2 text-sm text-status-error">{error}</p>}

            {guardians !== null && eligible.length === 0 && (
              <p className="py-4 text-sm text-ink-secondary">
                No guardians with email addresses are linked to this student.
              </p>
            )}

            {eligible.length > 0 && (
              <div className="mt-2 space-y-2">
                {eligible.map((g) => (
                  <label
                    key={g.guardianId}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink/10 px-3 py-2.5 transition-colors hover:bg-ink/5"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(g.guardianId)}
                      onChange={() => toggleGuardian(g.guardianId)}
                      className="size-4 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{g.name}</div>
                      <div className="truncate text-xs text-ink-secondary">
                        {g.email}
                        {g.relationship && ` · ${g.relationship}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className={styles.rrModalFoot}>
              <button
                type="button"
                className="rd-btn rd-btn-secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rd-btn rd-btn-primary"
                disabled={selected.size === 0}
                onClick={() => setStep("message")}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a note for parents</DialogTitle>
              <DialogDescription>
                This message will appear in the email body alongside the report PDF attachment.
                Leave blank to send without a personal note.
              </DialogDescription>
            </DialogHeader>

            {error && <p className="py-2 text-sm text-status-error">{error}</p>}

            <div className="mt-2">
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={`Hi! Here is ${firstName}'s latest report. Please don't hesitate to reach out if you have any questions.`}
                rows={5}
                className="w-full resize-none rounded-lg border border-ink/10 bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-ink-tertiary">
                Sending to {selected.size} guardian(s). The report will be attached as a PDF.
              </p>
            </div>

            <div className={styles.rrModalFoot}>
              <button
                type="button"
                className="rd-btn rd-btn-secondary"
                disabled={busy}
                onClick={() => setStep("recipients")}
              >
                Back
              </button>
              <button
                type="button"
                className="rd-btn rd-btn-primary"
                disabled={busy}
                onClick={() => void handleSend()}
              >
                {busy ? "Sending…" : `Send to ${selected.size} guardian(s)`}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
