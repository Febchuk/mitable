"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, Mail, Send, Trash2 } from "lucide-react";
import type { Tone } from "../data";
import { initialsFor } from "../data";

type ReportStatus = "draft" | "review" | "approved" | "sent";
type ChildLike = { name: string; tone: Tone };
import { Avatar } from "../primitives";
import { ChevLeft } from "../child-detail/icons";

const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  review: "Awaiting review",
  approved: "Approved",
  sent: "Sent to parents",
};

const STATUS_CLASS: Record<ReportStatus, string> = {
  draft: "rd-pill-draft",
  review: "rd-pill-submitted",
  approved: "rd-pill-approved",
  sent: "rd-pill-approved",
};

export function ReportTopBar({
  child,
  status,
  kind,
  dayLabel,
  classroom,
  savedMeta,
  savedMetaDirty = false,
  reportsListHref = "/app/reports",
  isAdmin = false,
  actionBusy = false,
  onSaveDraft,
  onSubmitForReview,
  onApprove,
  onSendToParents,
  onDeleteClick,
}: {
  child: ChildLike | undefined;
  status: ReportStatus;
  kind: string;
  dayLabel?: string;
  classroom?: string;
  savedMeta: string;
  savedMetaDirty?: boolean;
  reportsListHref?: string;
  isAdmin?: boolean;
  actionBusy?: boolean;
  onSaveDraft?: () => void;
  onSubmitForReview?: () => void;
  onApprove?: () => void;
  onSendToParents?: () => void;
  onDeleteClick?: () => void;
}) {
  const displayName = child?.name ?? "Report";
  const headingTitle = child ? `${kind} report — ${child.name.split(" ")[0]}` : `${kind} report`;

  return (
    <div className="rd-page-header">
      <div className="rd-page-header-top">
        <Link href={reportsListHref} className="rd-back-link">
          <ChevLeft />
          <span>All reports</span>
        </Link>
      </div>

      <div className="rd-page-header-row">
        <div className="rd-page-header-left">
          {child && <Avatar initials={initialsFor(displayName)} tone={child.tone} size={56} />}
          <div style={{ minWidth: 0 }}>
            <div className="rd-page-header-title-row">
              <h1 className="rd-page-header-title">{headingTitle}</h1>
              <span className={`rd-pill ${STATUS_CLASS[status]}`}>
                <span className="rd-dot" />
                {STATUS_LABEL[status]}
              </span>
            </div>
            <div className="rd-meta-row label-cap">
              <span>{kind}</span>
              {dayLabel && (
                <>
                  <span className="rd-meta-sep" />
                  <span>{dayLabel}</span>
                </>
              )}
              {classroom && (
                <>
                  <span className="rd-meta-sep" />
                  <span>{classroom}</span>
                </>
              )}
              <span className="rd-meta-sep" />
              <span
                className={`rd-saved-meta-inline${savedMetaDirty ? " rd-saved-meta-dirty" : ""}`}
              >
                {savedMeta}
              </span>
            </div>
          </div>
        </div>

        <div className="rd-page-header-actions">
          <TopBarActions
            status={status}
            isAdmin={isAdmin}
            actionBusy={actionBusy}
            onSaveDraft={onSaveDraft}
            onSubmitForReview={onSubmitForReview}
            onApprove={onApprove}
            onSendToParents={onSendToParents}
            onDeleteClick={onDeleteClick}
          />
        </div>
      </div>
    </div>
  );
}

function TopBarActions({
  status,
  isAdmin,
  actionBusy,
  onSaveDraft,
  onSubmitForReview,
  onApprove,
  onSendToParents,
  onDeleteClick,
}: {
  status: ReportStatus;
  isAdmin: boolean;
  actionBusy: boolean;
  onSaveDraft?: () => void;
  onSubmitForReview?: () => void;
  onApprove?: () => void;
  onSendToParents?: () => void;
  onDeleteClick?: () => void;
}) {
  if (status === "sent") {
    return (
      <>
        <span className="rd-btn rd-btn-secondary" style={{ cursor: "default", opacity: 0.7 }}>
          <Mail size={14} strokeWidth={2} />
          Sent to parents
        </span>
        {onDeleteClick && (
          <button
            type="button"
            className="rd-btn rd-btn-danger-ghost"
            onClick={onDeleteClick}
            aria-label="Delete report"
          >
            <Trash2 size={14} strokeWidth={2} />
            Delete
          </button>
        )}
      </>
    );
  }

  if (status === "approved" && isAdmin) {
    return (
      <>
        <button
          type="button"
          className="rd-btn rd-btn-primary"
          disabled={actionBusy}
          onClick={onSendToParents}
        >
          {actionBusy ? (
            "Sending…"
          ) : (
            <>
              <Send size={13} strokeWidth={2.5} /> Send to parents
            </>
          )}
        </button>
        {onDeleteClick && (
          <button
            type="button"
            className="rd-btn rd-btn-danger-ghost"
            disabled={actionBusy}
            onClick={onDeleteClick}
            aria-label="Delete report"
          >
            <Trash2 size={14} strokeWidth={2} />
            Delete
          </button>
        )}
      </>
    );
  }

  if (status === "review" && isAdmin) {
    return (
      <>
        <button
          type="button"
          className="rd-btn rd-btn-primary"
          disabled={actionBusy}
          onClick={onApprove}
        >
          {actionBusy ? (
            "Approving…"
          ) : (
            <>
              <Check size={13} strokeWidth={2.5} /> Approve
            </>
          )}
        </button>
        {onDeleteClick && (
          <button
            type="button"
            className="rd-btn rd-btn-danger-ghost"
            disabled={actionBusy}
            onClick={onDeleteClick}
            aria-label="Delete report"
          >
            <Trash2 size={14} strokeWidth={2} />
            Delete
          </button>
        )}
      </>
    );
  }

  // draft or changes_requested — teacher actions
  return (
    <>
      {onSaveDraft && (
        <button type="button" className="rd-btn rd-btn-secondary" onClick={onSaveDraft}>
          <FileText size={14} strokeWidth={2} />
          Save draft
        </button>
      )}
      {onSubmitForReview && (
        <button
          type="button"
          className="rd-btn rd-btn-primary"
          disabled={actionBusy}
          onClick={onSubmitForReview}
        >
          {actionBusy ? (
            "Submitting…"
          ) : (
            <>
              <ArrowRight size={13} strokeWidth={2.5} /> Submit for review
            </>
          )}
        </button>
      )}
      {onDeleteClick && (
        <button
          type="button"
          className="rd-btn rd-btn-danger-ghost"
          disabled={actionBusy}
          onClick={onDeleteClick}
          aria-label="Delete report"
        >
          <Trash2 size={14} strokeWidth={2} />
          Delete
        </button>
      )}
    </>
  );
}
