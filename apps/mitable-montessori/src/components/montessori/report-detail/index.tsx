"use client";

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  findChild,
  findReport,
  type Child,
  type Report,
  type ReportDetail as ReportDetailType,
} from "../data";
import { useMontessori } from "../store";
import { ChatPane } from "./chat-pane";
import { ReportPane } from "./report-pane";
import { ReportTopBar } from "./top-bar";
import "./report-detail.css";

const DIRTY_LABEL = "Unsaved changes";

type ReportDetailProps =
  | { reportId: string; report?: never; child?: never }
  | { reportId?: never; report: Report; child: Child | undefined };

/** Renders the report editor. Accepts either a `reportId` (resolved via the
   in-memory store, falling back to the seeded INITIAL_REPORTS) or, for tests,
   a fully-formed `{ report, child }` pair. */
export function ReportDetail(props: ReportDetailProps) {
  if ("reportId" in props && props.reportId !== undefined) {
    return <ReportDetailById reportId={props.reportId} />;
  }
  return <ReportDetailView report={props.report} child={props.child} />;
}

function ReportDetailById({ reportId }: { reportId: string }) {
  const { reports } = useMontessori();
  const report = reports.find((r) => r.id === reportId) ?? findReport(reportId);
  if (!report) {
    notFound();
  }
  const child = findChild(report.childId);
  return <ReportDetailView report={report} child={child} />;
}

function ReportDetailView({ report, child }: { report: Report; child: Child | undefined }) {
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
