"use client";

import * as React from "react";
import { Clock, Eye, Send, Trash2 } from "lucide-react";
import type { ReportListRow } from "@/lib/queries/reports";
import styles from "./reports-rail.module.css";

type ReportStatus = ReportListRow["status"];

export type ActionRailModal = "preview" | "history" | "send" | "delete";

/**
 * Resolves which action-rail icons should render for a given report. Mirrors
 * the rail-visibility table approved with the design — kept in one place so
 * desktop and mobile share the exact same affordances.
 *
 * - Preview PDF + History are always visible.
 * - Submit for review only on `draft` (teachers re-submit from draft after
 *   `changes_requested`, so we include that too).
 * - Delete on draft for anyone; on approved / sent for admins only.
 */
export function railIcons(status: ReportStatus, isAdmin: boolean): ActionRailModal[] {
  const out: ActionRailModal[] = ["preview", "history"];
  if (status === "draft" || status === "changes_requested") {
    out.push("send");
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
  pendingReviewerBadge = 0,
  reviewerSummary = [],
}: {
  status: ReportStatus;
  isAdmin: boolean;
  onOpenModal: (modal: ActionRailModal) => void;
  /** Unread reviewer-comment count, surfaced as a terracotta dot on the History icon. */
  pendingReviewerBadge?: number;
  /** Compact reviewer indicators (≤3 shown). */
  reviewerSummary?: { initials: string; tone: "sage" | "clay" | "butter" | "blue" }[];
}) {
  const icons = railIcons(status, isAdmin);
  const showPreview = icons.includes("preview");
  const showHistory = icons.includes("history");
  const showSend = icons.includes("send");
  const showDelete = icons.includes("delete");

  return (
    <aside className={styles.rrActionRail} aria-label="Report actions">
      {showPreview && (
        <RailButton
          tip="Preview PDF"
          aria-label="Preview PDF"
          onClick={() => onOpenModal("preview")}
        >
          <Eye size={17} strokeWidth={1.8} />
        </RailButton>
      )}

      {showHistory && (
        <RailButton
          tip="History"
          tint="sage"
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
          variant="primary"
          aria-label="Submit for review"
          onClick={() => onOpenModal("send")}
        >
          <Send size={17} strokeWidth={2} />
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

      <div className={styles.rrRailSpacer} />

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
    </aside>
  );
}

function RailButton({
  tip,
  children,
  variant,
  tint,
  danger,
  badge,
  onClick,
  ...aria
}: {
  tip: string;
  children: React.ReactNode;
  variant?: "primary";
  tint?: "sage";
  danger?: boolean;
  badge?: number;
  onClick: () => void;
} & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">) {
  const cls = [
    styles.rrRailBtn,
    variant === "primary" ? styles.rrRailBtnPrimary : "",
    tint === "sage" ? styles.rrRailBtnSage : "",
    danger ? styles.rrRailBtnDanger : "",
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
