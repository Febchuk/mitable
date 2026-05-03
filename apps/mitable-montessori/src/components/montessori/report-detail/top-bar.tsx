"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import type { Child, ReportStatus } from "../data";
import { initialsFor } from "../data";
import { Avatar, ToastBus } from "../primitives";
import { ChevLeft } from "../child-detail/icons";

const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  review: "Submitted for review",
  sent: "Approved · sent",
};

const STATUS_CLASS: Record<ReportStatus, string> = {
  draft: "rd-pill-draft",
  review: "rd-pill-submitted",
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
}: {
  child: Child | undefined;
  status: ReportStatus;
  kind: string;
  dayLabel?: string;
  classroom?: string;
  savedMeta: string;
  savedMetaDirty?: boolean;
}) {
  const displayName = child?.name ?? "Report";
  const headingTitle = child ? `${kind} report — ${child.name.split(" ")[0]}` : `${kind} report`;

  const onSaveDraft = () =>
    ToastBus.push({ message: "Saving drafts isn't wired up yet — coming soon." });
  const onSubmit = () => ToastBus.push({ message: "Submitting for review is coming soon." });

  return (
    <div className="rd-page-header">
      <div className="rd-page-header-top">
        <Link href="/app/reports" className="rd-back-link">
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
          <button type="button" className="rd-btn rd-btn-secondary" onClick={onSaveDraft}>
            <FileText size={14} strokeWidth={2} />
            Save draft
          </button>
          <button type="button" className="rd-btn rd-btn-primary" onClick={onSubmit}>
            Submit for review
            <ArrowRight size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
