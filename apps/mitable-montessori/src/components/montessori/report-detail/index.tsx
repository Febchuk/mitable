"use client";

import * as React from "react";
import Link from "next/link";
import type { Child, Report, ReportDetail as ReportDetailType } from "../data";
import { ChatPane } from "./chat-pane";
import { ReportPane } from "./report-pane";
import { ReportTopBar } from "./top-bar";
import "./report-detail.css";

const DIRTY_LABEL = "Unsaved changes";

export function ReportDetail({ report, child }: { report: Report; child: Child | undefined }) {
  const [detail, setDetail] = React.useState<ReportDetailType | undefined>(report.detail);
  const [isDirty, setIsDirty] = React.useState(false);

  const onChange = React.useCallback((next: ReportDetailType) => {
    setDetail(next);
    setIsDirty(true);
  }, []);

  const savedMeta = isDirty ? DIRTY_LABEL : (detail?.savedMeta ?? "Not saved yet");

  return (
    <div className="rd-root">
      <ReportTopBar
        child={child}
        status={report.status}
        kind={report.kind}
        dayLabel={detail?.dayLabel}
        classroom={detail?.classroom}
        savedMeta={savedMeta}
        savedMetaDirty={isDirty}
      />
      {detail ? (
        <div className="rd-workspace">
          <div className="rd-split">
            <ChatPane />
            <ReportPane detail={detail} onChange={onChange} />
          </div>
        </div>
      ) : (
        <ReportEmptyState />
      )}
    </div>
  );
}

function ReportEmptyState() {
  return (
    <div className="rd-empty">
      <h2>No draft yet</h2>
      <p>
        This report doesn&rsquo;t have a draft body. Once captured observations are linked, the
        editing assistant will compose a first pass for you.
      </p>
      <p style={{ marginTop: 16 }}>
        <Link
          href="/app/reports"
          className="rd-btn rd-btn-secondary"
          style={{ display: "inline-flex" }}
        >
          Back to reports
        </Link>
      </p>
    </div>
  );
}
