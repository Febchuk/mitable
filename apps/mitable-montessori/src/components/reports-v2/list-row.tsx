"use client";

import type { MockReport, V2Tab, V2Tone } from "./mock-data";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

const TONE_CLASS: Record<V2Tone, string> = {
  clay: styles.avClay,
  sage: styles.avSage,
  butter: styles.avButter,
  blue: styles.avBlue,
};

function scoreMiniClass(score: number) {
  if (score >= 85) return styles.scoreMiniGreen;
  if (score >= 60) return styles.scoreMiniAmber;
  return styles.scoreMiniRed;
}

function typePill(type: MockReport["reportType"]) {
  if (type === "MAJOR") return styles.pillMajor;
  if (type === "INCIDENT") return styles.pillIncident;
  return styles.pillDaily;
}

function typeLabel(type: MockReport["reportType"]) {
  return type[0] + type.slice(1).toLowerCase();
}

function completenessClass(pct: number) {
  if (pct >= 80) return styles.completenessHigh;
  if (pct >= 50) return styles.completenessMed;
  return "";
}

export function ListRow({
  report,
  selected,
  tab,
  onSelect,
  onQuickApprove,
  busy = false,
}: {
  report: MockReport;
  selected: boolean;
  tab: V2Tab;
  onSelect: () => void;
  onQuickApprove?: () => void;
  /** Mid-flight action — row dims + buttons disable. */
  busy?: boolean;
}) {
  const score = report.aiScore;
  const showScore = tab === "drafts" || tab === "review";
  const showInlineTick = tab === "review" && score >= 85 && !!onQuickApprove;

  let signal: React.ReactNode = null;
  if (tab === "drafts" && typeof report.completenessPercent === "number") {
    const pct = report.completenessPercent;
    signal = (
      <span className={`${styles.completeness} ${completenessClass(pct)}`}>
        <span className={styles.completenessBar}>
          <i style={{ width: `${pct}%` }} />
        </span>
        {pct}%
      </span>
    );
  } else if (tab === "review" && report.reviewers) {
    const done = report.reviewers.filter((r) => r.ticked).length;
    const total = report.reviewers.length;
    signal = (
      <span className={styles.ticks}>
        {report.reviewers.map((r, i) => (
          <span
            key={`${r.initials}-${i}`}
            className={`${styles.tick} ${r.ticked ? styles.tickDone : ""}`}
            title={r.name}
          >
            {r.ticked && <Icon.Check size={11} />}
          </span>
        ))}
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </span>
    );
  } else if (tab === "approved" && report.scheduledSend) {
    signal = (
      <span className={`${styles.pill} ${styles.pillSage}`}>
        <Icon.Send size={9} />
        {report.scheduledSend}
      </span>
    );
  } else if (tab === "sent" && typeof report.deliveryRead === "number") {
    const allRead = report.deliveryRead === report.deliveryTotal;
    signal = (
      <span className={`${styles.pill} ${allRead ? styles.pillSage : styles.pillClay}`}>
        <Icon.Check size={9} />
        {report.deliveryRead}/{report.deliveryTotal} read
      </span>
    );
  }

  let metaRight = "";
  if (tab === "drafts") metaRight = `Edited ${report.lastEditedAgo ?? ""}`;
  else if (tab === "review") {
    if (report.isReadyToPromote) metaRight = "Ready to promote";
    else if (report.isUrgent) metaRight = "Guardian notified · urgent";
    else metaRight = `Sent ${report.sentAgo ?? ""}`;
  } else if (tab === "approved") metaRight = report.approvedBy ? `By ${report.approvedBy}` : "";
  else if (tab === "sent")
    metaRight = `${report.sentAt ?? ""}${report.hasReply ? " · 1 reply" : ""}`;

  return (
    <button
      type="button"
      className={`${styles.row} ${selected ? styles.rowSelected : ""}`}
      onClick={onSelect}
      style={busy ? { opacity: 0.5, pointerEvents: "none" } : undefined}
    >
      <div className={`${styles.av} ${TONE_CLASS[report.childTone]}`}>{report.childInitials}</div>
      <div>
        <div className={styles.nameLine}>
          <span className={styles.name}>{report.childName}</span>
          <span className={`${styles.pill} ${typePill(report.reportType)}`}>
            <span className={styles.dot} />
            {typeLabel(report.reportType)}
          </span>
        </div>
        <div className={styles.summary}>{report.summary}</div>
        <div className={styles.metaLine}>
          {showScore && (
            <span className={`${styles.scoreMini} ${scoreMiniClass(score)}`}>
              <span className={styles.scoreMiniBubble}>{score}</span>
            </span>
          )}
          {signal}
          <span
            className={styles.metaRight}
            style={
              report.isReadyToPromote
                ? { color: "var(--color-sage-deep)", fontWeight: 700 }
                : report.isUrgent
                  ? { color: "var(--color-terracotta-deep)", fontWeight: 700 }
                  : undefined
            }
          >
            {metaRight}
          </span>
        </div>
      </div>
      <div className={styles.rightCol}>
        {showInlineTick && (
          <span
            role="button"
            tabIndex={0}
            className={styles.inlineTick}
            onClick={(e) => {
              e.stopPropagation();
              onQuickApprove?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onQuickApprove?.();
              }
            }}
            title="Quick approve (green score)"
          >
            <Icon.Check size={14} />
          </span>
        )}
      </div>
    </button>
  );
}
