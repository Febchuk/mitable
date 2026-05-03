"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, FileText } from "lucide-react";
import type { Child, ReportStatus } from "../data";
import { ToastBus } from "../primitives";

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
  savedMeta,
}: {
  child: Child | undefined;
  status: ReportStatus;
  kind: string;
  savedMeta: string;
}) {
  const childLabel = child
    ? `${child.name.split(" ")[0]} ${child.name.split(" ").slice(-1)[0][0]}.`
    : "Report";

  const onSaveDraft = () =>
    ToastBus.push({ message: "Saving drafts isn't wired up yet — coming soon." });
  const onSubmit = () => ToastBus.push({ message: "Submitting for review is coming soon." });

  return (
    <header className="rd-topbar">
      <div className="rd-topbar-inner">
        <div className="rd-crumbs">
          <Link href="/app/reports" className="rd-back" aria-label="Back to reports">
            <ChevronLeft size={16} strokeWidth={2} />
          </Link>
          <span>Reports</span>
          <span className="rd-sep">/</span>
          <span>{kind}</span>
          <span className="rd-sep">/</span>
          <span className="rd-current">{childLabel}</span>
          <span className={`rd-pill ${STATUS_CLASS[status]}`} style={{ marginLeft: 10 }}>
            <span className="rd-dot" />
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div className="rd-header-right">
          <span className="rd-saved-meta">{savedMeta}</span>
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
    </header>
  );
}
