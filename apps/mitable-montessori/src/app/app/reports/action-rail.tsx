"use client";

import * as React from "react";
import { Check, Clock, FileText, Pencil, RotateCcw, Send, Trash2 } from "lucide-react";
import type { ReportListRow } from "@/lib/queries/reports";
import type { ViewMode } from "@/components/montessori/report-detail/view-mode-toggle";
import styles from "./reports-rail.module.css";

type ReportStatus = ReportListRow["status"];

/** Modal targets only — Preview PDF is no longer a modal; the rail's toggle
 *  swaps the editor pane in-place between editor and PDF preview. */
export type ActionRailModal =
  | "score"
  | "history"
  | "send"
  | "delete"
  | "approve"
  | "request_changes";

/** Map an AI score to its tone band — drives the score-button + score-modal fill. */
export function scoreToneBand(score: number): "high" | "med" | "low" {
  if (score >= 85) return "high";
  if (score >= 60) return "med";
  return "low";
}

/**
 * Resolves which modal-launching icons should render for a given report.
 * Mirrors the rail-visibility table approved with the design — kept in one
 * place so desktop and mobile share the exact same affordances.
 *
 * - History is always visible.
 * - Submit for review only on `draft` (teachers re-submit from draft after
 *   `changes_requested`, so we include that too).
 * - Delete on draft for anyone; on approved / sent for admins only.
 *
 * The preview/edit toggle is rendered separately (not modal-routed) and the
 * score button uses its own visibility check (`aiScore != null`).
 */
export function railIcons(status: ReportStatus, isAdmin: boolean): ActionRailModal[] {
  const out: ActionRailModal[] = ["history"];
  if (status === "draft" || status === "changes_requested") {
    out.push("send");
  }
  // Approve / Request changes for admins on review-state reports.
  if (isAdmin && (status === "submitted_for_review" || status === "in_review")) {
    out.push("approve");
    out.push("request_changes");
  }
  const showDelete =
    status === "draft" ||
    status === "changes_requested" ||
    (isAdmin && (status === "approved" || status === "sent"));
  if (showDelete) out.push("delete");
  return out;
}

export function ActionRail({
  status,
  isAdmin,
  onOpenModal,
  aiScore = null,
  viewMode = "editor",
  onViewModeChange,
  pendingReviewerBadge = 0,
  reviewerSummary = [],
}: {
  status: ReportStatus;
  isAdmin: boolean;
  onOpenModal: (modal: ActionRailModal) => void;
  /** AI confidence score (0–100). When provided, surfaces as the tone-tinted
   *  score button at the top of the rail. When null we hide the button —
   *  the report hasn't been scored yet. */
  aiScore?: number | null;
  /** Controlled view mode for the editor pane. The rail's preview toggle
   *  flips between "editor" and "preview" — there's no Preview PDF modal
   *  anymore; the editor pane swaps in-place. */
  viewMode?: ViewMode;
  onViewModeChange?: (next: ViewMode) => void;
  /** Unread reviewer-comment count, surfaced as a terracotta dot on the History icon. */
  pendingReviewerBadge?: number;
  /** Compact reviewer indicators (≤3 shown). */
  reviewerSummary?: { initials: string; tone: "sage" | "clay" | "butter" | "blue" }[];
}) {
  const icons = railIcons(status, isAdmin);
  const showHistory = icons.includes("history");
  const showSend = icons.includes("send");
  const showApprove = icons.includes("approve");
  const showRequestChanges = icons.includes("request_changes");
  const showDelete = icons.includes("delete");

  // The toggle is a single button whose icon = the destination: FileText
  // when you're in editor mode (tap → preview PDF), Pencil when you're in
  // preview (tap → back to editor). Single tap flips modes.
  const inPreview = viewMode === "preview";
  const togglePreview = () => onViewModeChange?.(inPreview ? "editor" : "preview");

  return (
    <aside className={styles.rrActionRail} aria-label="Report actions">
      {aiScore != null && (
        <button
          type="button"
          className={`${styles.rrRailScoreBtn} tap`}
          data-tone={scoreToneBand(aiScore)}
          data-tip="AI confidence"
          onClick={() => onOpenModal("score")}
          aria-label={`AI confidence score ${aiScore}`}
        >
          <span className={styles.rrRailScoreNumber}>{aiScore}</span>
        </button>
      )}

      {onViewModeChange && (
        <RailButton
          tip={inPreview ? "Back to editor" : "Preview PDF"}
          aria-label={inPreview ? "Switch to editor" : "Preview PDF"}
          aria-pressed={inPreview}
          onClick={togglePreview}
          active={inPreview}
        >
          {inPreview ? (
            <Pencil size={17} strokeWidth={1.8} />
          ) : (
            <FileText size={17} strokeWidth={1.8} />
          )}
        </RailButton>
      )}

      {showHistory && (
        <RailButton
          tip="History"
          aria-label="History"
          onClick={() => onOpenModal("history")}
          badge={pendingReviewerBadge > 0 ? pendingReviewerBadge : undefined}
        >
          <Clock size={17} strokeWidth={1.8} />
        </RailButton>
      )}

      {showSend && (
        <RailButton
          tip="Submit for review"
          aria-label="Submit for review"
          onClick={() => onOpenModal("send")}
        >
          <Send size={17} strokeWidth={2} />
        </RailButton>
      )}

      {showApprove && (
        <RailButton
          tip="Approve"
          aria-label="Approve report"
          onClick={() => onOpenModal("approve")}
        >
          <Check size={17} strokeWidth={2.2} />
        </RailButton>
      )}

      {showRequestChanges && (
        <RailButton
          tip="Request changes"
          aria-label="Request changes"
          onClick={() => onOpenModal("request_changes")}
        >
          <RotateCcw size={17} strokeWidth={1.8} />
        </RailButton>
      )}

      {showDelete && (
        <RailButton
          tip="Delete report"
          danger
          aria-label="Delete report"
          onClick={() => onOpenModal("delete")}
        >
          <Trash2 size={17} strokeWidth={1.8} />
        </RailButton>
      )}

      {reviewerSummary.length > 0 && (
        <>
          <div className={styles.rrRailSep} />
          {reviewerSummary.slice(0, 3).map((r, i) => (
            <div
              key={`${r.initials}-${i}`}
              className={`${styles.rrRailAvatar} ${styles[`rrTone_${r.tone}`]}`}
              aria-hidden
              title={r.initials}
            >
              {r.initials}
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

function RailButton({
  tip,
  children,
  danger,
  active,
  badge,
  onClick,
  ...aria
}: {
  tip: string;
  children: React.ReactNode;
  /** Red treatment reserved for the destructive Delete action. */
  danger?: boolean;
  /** Pressed/active styling for toggle buttons (e.g. preview/edit). */
  active?: boolean;
  badge?: number;
  onClick: () => void;
} & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed">) {
  const cls = [
    styles.rrRailBtn,
    danger ? styles.rrRailBtnDanger : "",
    active ? styles.rrRailBtnActive : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={`${cls} tap`} onClick={onClick} data-tip={tip} {...aria}>
      {children}
      {badge && badge > 0 ? (
        <span className={styles.rrRailBadge} aria-hidden>
          {badge}
        </span>
      ) : null}
    </button>
  );
}
