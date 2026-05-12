"use client";

import { useState } from "react";
import Link from "next/link";
import type { MockReport, V2Tab, V2Tone } from "./mock-data";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

/** Minimal shape of `ReportDetail.sections` (defined in queries/reports.ts).
 *  Kept inline so this component stays usable without a query import. */
export type RenderedSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
};

const TONE_CLASS: Record<V2Tone, string> = {
  clay: styles.avClay,
  sage: styles.avSage,
  butter: styles.avButter,
  blue: styles.avBlue,
};

type PaneTab = "report" | "chat" | "history";

function scoreClass(score: number) {
  if (score >= 85) return styles.scoreGreen;
  if (score >= 60) return styles.scoreAmber;
  return styles.scoreRed;
}

function calloutClass(score: number) {
  if (score >= 85) return "";
  if (score >= 60) return styles.aiCalloutAmber;
  return styles.aiCalloutRed;
}

function flagChipClass(status: "ok" | "warn" | "fail") {
  if (status === "ok") return styles.flagChipOk;
  if (status === "warn") return styles.flagChipWarn;
  return styles.flagChipFail;
}

/**
 * Reading pane content. Used by both Layout A (with the in-pane Chat/History
 * tabs) and Layout C (where Chat/History live in the side rail). The
 * `embeddedPaneTabs` prop controls whether the in-pane tab strip renders.
 */
export function ReadingPane({
  report,
  tab,
  isAdmin,
  embeddedPaneTabs,
  sections,
  busy = false,
  onSendForReview,
  onApprove,
  onOverrideApprove,
  onRequestChanges,
  onComment,
  onSendNow,
  onRescore,
  onReassignReviewers,
  onSendBackToDraft,
}: {
  report: MockReport;
  tab: V2Tab;
  isAdmin: boolean;
  embeddedPaneTabs: boolean;
  /** Real report body. When null/undefined, the pane renders a placeholder
   *  body so demo / empty states still look right. */
  sections?: RenderedSection[] | null;
  /** Mid-flight action — strip + header actions disabled. */
  busy?: boolean;
  onSendForReview?: () => void;
  onApprove?: () => void;
  onOverrideApprove?: () => void;
  onRequestChanges?: () => void;
  onComment?: () => void;
  onSendNow?: () => void;
  onRescore?: () => void;
  /** Admin-only: open the reassign reviewers dialog. */
  onReassignReviewers?: () => void;
  /** Admin-only: send the report back to draft (clears reviewer state). */
  onSendBackToDraft?: () => void;
}) {
  const [paneTab, setPaneTab] = useState<PaneTab>("report");
  const [showReasoning, setShowReasoning] = useState(false);

  const showAiCallout = tab === "drafts" || tab === "review";

  return (
    <section className={styles.readingPane}>
      {/* Strip — only on In Review (reviewer your-turn) and Approved (cleared) */}
      {tab === "review" && (
        <div className={styles.reviewStrip}>
          <div className={styles.reviewStripLeft}>
            <span className={styles.handMini}>your turn →</span>
            <span style={{ fontSize: 12, color: "var(--color-ink-secondary)" }}>
              {report.childName} · {report.reportType.toLowerCase()} · sent by {report.authorName}{" "}
              {report.sentAgo ?? ""}
            </span>
          </div>
          <div className={styles.reviewStripActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={onComment}
            >
              <Icon.MessageCircle size={12} /> Comment
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={onRequestChanges}
              disabled={busy}
              style={busy ? { opacity: 0.6 } : undefined}
            >
              <Icon.RotateCcw size={12} /> Request changes
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSage}`}
              onClick={onApprove}
              disabled={busy}
              style={busy ? { opacity: 0.6 } : undefined}
            >
              <Icon.Check size={12} /> {busy ? "Approving…" : "Approve"}
            </button>
          </div>
        </div>
      )}
      {tab === "approved" && (
        <div className={`${styles.reviewStrip} ${styles.reviewStripSage}`}>
          <div className={styles.reviewStripLeft}>
            <span className={styles.handMini}>cleared →</span>
            <span style={{ fontSize: 12, color: "var(--color-sage-deep)", fontWeight: 600 }}>
              Approved by {report.approvedBy} · queued for parents {report.scheduledSend}
            </span>
          </div>
          <div className={styles.reviewStripActions}>
            <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} disabled>
              Reschedule
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onSendNow}
              disabled={busy}
              style={busy ? { opacity: 0.6 } : undefined}
            >
              <Icon.Send size={12} /> {busy ? "Sending…" : "Send now"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={styles.readingHead}>
        <div className={styles.row1}>
          <span
            className={`${styles.pill} ${
              report.reportType === "MAJOR"
                ? styles.pillMajor
                : report.reportType === "INCIDENT"
                  ? styles.pillIncident
                  : styles.pillDaily
            }`}
          >
            <span className={styles.dot} />
            {report.reportType[0] + report.reportType.slice(1).toLowerCase()}
          </span>
          <h2>
            {report.childName} · {report.title}
          </h2>
        </div>
        <div className={styles.row2}>
          <div className={styles.meta}>Tuesday 14 May · 9:15a–9:42a · Sensorial</div>
          <div className={styles.meta}>
            By{" "}
            <span
              className={`${styles.av} ${styles.avSm} ${TONE_CLASS[report.childTone]}`}
              style={{ marginRight: 4, verticalAlign: "middle" }}
            >
              {report.authorInitials}
            </span>
            <b style={{ color: "var(--color-ink-secondary)" }}>{report.authorName}</b>
          </div>
          <div className={styles.readingHeadActions}>
            {showAiCallout && (
              <span
                className={`${styles.score} ${scoreClass(report.aiScore)}`}
                style={report.aiScored === false ? { opacity: 0.6 } : undefined}
                title={
                  report.aiScored === false
                    ? "AI score will appear after the first auto-score completes."
                    : undefined
                }
              >
                <span className={styles.scoreBubble}>
                  {report.aiScored === false ? "·" : report.aiScore}
                </span>
                {report.aiScored === false
                  ? "Calculating…"
                  : tab === "drafts"
                    ? report.aiScore >= 85
                      ? "Ready to send"
                      : report.aiScore >= 60
                        ? "Tighten before sending"
                        : "Needs more work"
                    : report.aiScore >= 85
                      ? "High confidence"
                      : report.aiScore >= 60
                        ? "Worth a closer look"
                        : "Don't fast-approve"}
              </span>
            )}
            {tab === "drafts" && (
              <>
                <Link
                  href={`/app/reports/${report.id}`}
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  style={{ textDecoration: "none" }}
                >
                  <Icon.Edit size={12} /> Edit
                </Link>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={onSendForReview}
                  disabled={busy}
                  style={busy ? { opacity: 0.6 } : undefined}
                >
                  <Icon.Send size={13} /> {busy ? "Sending…" : "Send for review"}
                </button>
              </>
            )}
            {tab === "review" && isAdmin && (
              <>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={onReassignReviewers}
                  disabled={busy}
                  style={busy ? { opacity: 0.6 } : undefined}
                >
                  Reassign
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={onSendBackToDraft}
                  disabled={busy}
                  style={busy ? { opacity: 0.6 } : undefined}
                >
                  <Icon.RotateCcw size={11} /> Back to draft
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={onOverrideApprove}
                  disabled={busy}
                  style={busy ? { opacity: 0.6 } : undefined}
                >
                  <Icon.Check size={11} /> {busy ? "Approving…" : "Override approve"}
                </button>
              </>
            )}
            {tab === "approved" && isAdmin && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={onSendBackToDraft}
                disabled={busy}
                style={busy ? { opacity: 0.6 } : undefined}
              >
                <Icon.RotateCcw size={11} /> Back to draft
              </button>
            )}
          </div>
        </div>
      </div>

      {/* in-pane tabs only in Layout A */}
      {embeddedPaneTabs && (
        <div className={styles.paneTabbar}>
          <button
            type="button"
            className={paneTab === "report" ? styles.paneTabActive : ""}
            onClick={() => setPaneTab("report")}
          >
            Report
          </button>
          <button
            type="button"
            className={paneTab === "chat" ? styles.paneTabActive : ""}
            onClick={() => setPaneTab("chat")}
          >
            Chat
            <span className={styles.paneTabCount}>3</span>
          </button>
          <button
            type="button"
            className={paneTab === "history" ? styles.paneTabActive : ""}
            onClick={() => setPaneTab("history")}
          >
            History
          </button>
        </div>
      )}

      {/* Body */}
      {(!embeddedPaneTabs || paneTab === "report") && (
        <div className={styles.readingBody}>
          {showAiCallout && (
            <div
              className={`${styles.aiCallout} ${calloutClass(report.aiScore)}`}
              style={report.aiScored === false ? { opacity: 0.6 } : undefined}
            >
              <div className={styles.aiRow}>
                <span className={`${styles.score} ${scoreClass(report.aiScore)}`}>
                  <span className={styles.scoreBubble}>
                    {report.aiScored === false ? "·" : report.aiScore}
                  </span>
                  {report.aiScored === false
                    ? "Calculating score…"
                    : report.aiScore >= 85
                      ? "High confidence — ready to send"
                      : report.aiScore >= 60
                        ? "Worth a closer look"
                        : "Needs more work"}
                </span>
                {report.aiFlags.map((f, i) => (
                  <span
                    key={`${f.kind}-${i}`}
                    className={`${styles.flagChip} ${flagChipClass(f.status)}`}
                    title={f.note}
                  >
                    <Icon.Check size={9} />
                    {f.kind === "tone"
                      ? "Tone"
                      : f.kind === "evidence"
                        ? "Evidence"
                        : f.kind === "pii"
                          ? "No PII"
                          : "Template"}
                  </span>
                ))}
                <button
                  type="button"
                  className={styles.reasonToggle}
                  onClick={() => setShowReasoning((v) => !v)}
                >
                  why this score? <Icon.ChevronDown size={11} />
                </button>
              </div>
              {showReasoning && (
                <div className={styles.reasoning}>
                  <ul>
                    {report.aiReasoning.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  {onRescore && (
                    <button
                      type="button"
                      className={styles.reasonToggle}
                      onClick={onRescore}
                      disabled={busy}
                      style={{ marginTop: 8 }}
                    >
                      {busy ? "Re-scoring…" : "↻ Re-score now"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {sections && sections.length > 0 ? (
            sections.map((section) => (
              <div key={section.id} className={styles.readingSection}>
                <h3>{section.heading}</h3>
                {section.paragraphs.map((p) => (
                  // Sections come from `ReportDetail.sections` which is
                  // server-trimmed + tokenized. Safe to render the html
                  // through dangerouslySetInnerHTML — same trust boundary the
                  // existing report-pane.tsx editor uses. We don't surface
                  // PII tokens here; that's stripped by the writer.
                  <p key={p.id} dangerouslySetInnerHTML={{ __html: p.html }} />
                ))}
              </div>
            ))
          ) : (
            <>
              <div className={styles.readingSection}>
                <h3>What happened</h3>
                <p>{report.summary}</p>
                <p style={{ color: "var(--color-ink-muted)", fontStyle: "italic" }}>
                  This report has no body yet — open the editor to draft it.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {embeddedPaneTabs && paneTab === "chat" && (
        <div className={styles.readingBody}>
          <ChatThread />
        </div>
      )}
      {embeddedPaneTabs && paneTab === "history" && (
        <div className={styles.readingBody}>
          <HistoryTrail />
        </div>
      )}
    </section>
  );
}

export function ChatThread() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className={`${styles.msg} ${styles.msgAi}`}>
        <div className={`${styles.av} ${styles.avSm} ${styles.avClay}`}>AI</div>
        <div>
          <div className={styles.msgWho}>Mitable · 11:02a</div>
          <div className="bubble" />
          <div className={styles.msg}>
            <div className={`${styles.msgAi}`}>
              <div className="bubble" />
            </div>
          </div>
          <div
            style={{
              padding: "8px 11px",
              borderRadius: 13,
              background: "var(--color-muted)",
              fontSize: 12.5,
              lineHeight: 1.45,
              maxWidth: 460,
            }}
          >
            I drafted &ldquo;What happened&rdquo; and &ldquo;In her own words&rdquo; from your voice
            memo. Want me to tighten the connection-to-plane paragraph?
          </div>
        </div>
      </div>
      <div className={`${styles.msg} ${styles.msgMe}`}>
        <div
          style={{
            padding: "8px 11px",
            borderRadius: 13,
            background: "var(--color-terracotta-soft)",
            color: "var(--color-terracotta-deep)",
            fontSize: 12.5,
            lineHeight: 1.45,
            maxWidth: 460,
          }}
        >
          Yes, link it to the math sequence next term.
        </div>
      </div>
      <div className={`${styles.msg} ${styles.msgAi}`}>
        <div className={`${styles.av} ${styles.avSm} ${styles.avClay}`}>AI</div>
        <div>
          <div className={styles.msgWho}>Mitable · 11:03a</div>
          <div
            style={{
              padding: "8px 11px",
              borderRadius: 13,
              background: "var(--color-muted)",
              fontSize: 12.5,
              lineHeight: 1.45,
              maxWidth: 460,
            }}
          >
            Tightened — also moved the quote up so it sits beside the self-correction moment. Score
            went 87 → 92.
          </div>
        </div>
      </div>
    </div>
  );
}

export function HistoryTrail({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.historyTrail} ${compact ? styles.historyTrailCompact : ""}`}>
      <div className={styles.historyEvent}>
        <div className={`${styles.historyDot} ${styles.dotSage}`} />
        <div>
          <div className={styles.heHead}>
            <b>Approved</b> by Mei W.<span className={styles.heTime}>just now</span>
          </div>
          <div className={styles.heBody}>Queued for parents Fri 4:00p.</div>
        </div>
      </div>
      <div className={styles.historyEvent}>
        <div className={`${styles.historyDot} ${styles.dotSage}`} />
        <div>
          <div className={styles.heHead}>
            <span style={{ color: "var(--color-sage-deep)" }}>✓ Tick</span> Diego R.
            <span className={styles.heTime}>1h</span>
          </div>
          <div className={styles.heBody}>
            &ldquo;+ one ✓. Consider adding the third repetition next time?&rdquo;
          </div>
        </div>
      </div>
      <div className={styles.historyEvent}>
        <div className={`${styles.historyDot} ${styles.dotButter}`} />
        <div>
          <div className={styles.heHead}>
            <b>Sent for review</b>
            <span className={styles.heTime}>4h</span>
          </div>
          <div className={styles.heBody}>To Mei W., Diego R. By Sara K.</div>
        </div>
      </div>
      <div className={styles.historyEvent}>
        <div className={`${styles.historyDot} ${styles.dotClay}`} />
        <div>
          <div className={styles.heHead}>
            <b>AI score 87 → 92</b>
            <span className={styles.heTime}>11:03a</span>
          </div>
          <div className={styles.heBody}>
            Mitable tightened &ldquo;Connection to the plane&rdquo;.
          </div>
        </div>
      </div>
      <div className={styles.historyEvent}>
        <div className={`${styles.historyDot} ${styles.dotClay}`} />
        <div>
          <div className={styles.heHead}>
            <b>Draft created</b> by Sara K.<span className={styles.heTime}>10:47a</span>
          </div>
          <div className={styles.heBody}>Voice memo · 2 photos · 1 quote.</div>
        </div>
      </div>
    </div>
  );
}
