"use client";

import * as React from "react";
import Link from "next/link";
import { LEVEL_TONES, stateMeta, type Level, type SubtopicState } from "../mock-data";
import { SectionHeading } from "../section-heading";
import type { ActivityFeedEntry, ReportStatus } from "@/lib/queries/activity";

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(42,39,35,0.04)",
};

const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  submitted_for_review: "In review",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  sent: "Sent",
};

const REPORT_STATUS_COLOR: Record<ReportStatus, { bg: string; fg: string }> = {
  draft: { bg: "var(--color-muted)", fg: "var(--color-ink-muted)" },
  submitted_for_review: {
    bg: "var(--color-butter-soft, #fef9eb)",
    fg: "var(--color-butter-deep, #92700a)",
  },
  in_review: { bg: "var(--color-butter-soft, #fef9eb)", fg: "var(--color-butter-deep, #92700a)" },
  changes_requested: {
    bg: "var(--color-terracotta-soft, #fdf1ee)",
    fg: "var(--color-terracotta-deep, #9b3a2a)",
  },
  approved: { bg: "var(--color-sage-soft, #eef6f1)", fg: "var(--color-sage-deep, #1f6b42)" },
  sent: { bg: "var(--color-sage-soft, #eef6f1)", fg: "var(--color-sage-deep, #1f6b42)" },
};

const TRANSITION_LABEL: Record<"introduced" | "practicing" | "mastered", string> = {
  introduced: "Introduced",
  practicing: "Practicing",
  mastered: "Mastered",
};

function transitionState(s: "introduced" | "practicing" | "mastered"): SubtopicState {
  if (s === "introduced") return "i";
  if (s === "practicing") return "p";
  return "m";
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function LevelTransition({ from, to }: { from: Level | null; to: Level | null }) {
  if (!from && !to) {
    return (
      <span
        className="label-cap"
        style={{
          color: "var(--color-ink-muted)",
          fontSize: 10,
          padding: "2px 7px",
          borderRadius: 999,
          border: "1px solid var(--color-border)",
          letterSpacing: "0.06em",
        }}
      >
        Confirms current
      </span>
    );
  }
  const tFrom = from ? LEVEL_TONES[from] : null;
  const tTo = to ? LEVEL_TONES[to] : null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      <span style={{ color: tFrom?.deep || "var(--color-ink-muted)" }}>{from}</span>
      <span style={{ color: "var(--color-ink-muted)" }}>→</span>
      <span style={{ color: tTo?.deep || "var(--color-ink)" }}>{to}</span>
    </span>
  );
}

function CurriculumEntry({
  e,
  mobile,
}: {
  e: Extract<ActivityFeedEntry, { kind: "curriculum" }>;
  mobile: boolean;
}) {
  const transitionMeta = e.transitionToStatus
    ? stateMeta[transitionState(e.transitionToStatus)]
    : null;
  return (
    <div
      style={{
        background: mobile ? "var(--color-canvas)" : "transparent",
        border: mobile ? "1px solid var(--color-border)" : "0",
        borderRadius: mobile ? 12 : 0,
        padding: mobile ? "12px 14px" : "12px 0",
        borderBottom: mobile ? undefined : "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <span className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
          Curriculum · {e.topicName}
        </span>
        <span
          className="font-numeric"
          style={{ fontSize: 11, color: "var(--color-ink-muted)" }}
          title={e.createdAt}
        >
          {formatRelative(e.createdAt)}
        </span>
      </div>
      <div style={{ fontSize: 14, color: "var(--color-ink)", lineHeight: 1.45 }}>
        Worked on <strong style={{ fontWeight: 600 }}>{e.subtopicName}</strong>
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--color-ink-secondary)",
          marginTop: 4,
          lineHeight: 1.45,
        }}
      >
        {e.comment}
      </div>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {transitionMeta && e.transitionToStatus && (
          <span
            style={{
              display: "inline-block",
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 999,
              color: transitionMeta.deep,
              background: transitionMeta.soft,
              border: `1px solid ${transitionMeta.tone}`,
            }}
          >
            → {TRANSITION_LABEL[e.transitionToStatus]}
          </span>
        )}
        {e.authorName && (
          <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{e.authorName}</span>
        )}
      </div>
    </div>
  );
}

function WholeChildEntry({
  e,
  mobile,
}: {
  e: Extract<ActivityFeedEntry, { kind: "whole-child" }>;
  mobile: boolean;
}) {
  return (
    <div
      style={{
        background: mobile ? "var(--color-canvas)" : "transparent",
        border: mobile ? "1px solid var(--color-border)" : "0",
        borderRadius: mobile ? 12 : 0,
        padding: mobile ? "12px 14px" : "12px 0",
        borderBottom: mobile ? undefined : "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <span className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
          Whole child · {e.axisLabel}
        </span>
        <span
          className="font-numeric"
          style={{ fontSize: 11, color: "var(--color-ink-muted)" }}
          title={e.createdAt}
        >
          {formatRelative(e.createdAt)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-ink)", lineHeight: 1.45 }}>{e.note}</div>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <LevelTransition from={e.fromLevel} to={e.toLevel} />
        {e.authorName && (
          <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{e.authorName}</span>
        )}
      </div>
    </div>
  );
}

function ReportEntry({
  e,
  mobile,
  reportsRailBasePath,
}: {
  e: Extract<ActivityFeedEntry, { kind: "report" }>;
  mobile: boolean;
  reportsRailBasePath: string;
}) {
  const statusColor = REPORT_STATUS_COLOR[e.status];
  const displayTitle =
    e.title ??
    (e.reportType === "daily"
      ? "Daily report"
      : e.reportType === "incident"
        ? "Incident report"
        : "Major report");
  return (
    <Link
      href={`${reportsRailBasePath}?open=${encodeURIComponent(e.id)}`}
      style={{
        display: "block",
        background: mobile ? "var(--color-canvas)" : "transparent",
        border: mobile ? "1px solid var(--color-border)" : "0",
        borderRadius: mobile ? 12 : 0,
        padding: mobile ? "12px 14px" : "12px 0",
        borderBottom: mobile ? undefined : "1px solid var(--color-border)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <span className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
          Report · {e.reportType.charAt(0).toUpperCase() + e.reportType.slice(1)}
        </span>
        <span
          className="font-numeric"
          style={{ fontSize: 11, color: "var(--color-ink-muted)" }}
          title={e.createdAt}
        >
          {formatRelative(e.createdAt)}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)", lineHeight: 1.4 }}>
        {displayTitle}
      </div>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 999,
            color: statusColor.fg,
            background: statusColor.bg,
            border: "1px solid currentColor",
          }}
        >
          {REPORT_STATUS_LABEL[e.status]}
        </span>
        {e.authorName && (
          <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{e.authorName}</span>
        )}
      </div>
    </Link>
  );
}

export function ActivityView({
  mobile,
  entries,
  reportsRailBasePath,
}: {
  mobile: boolean;
  entries: ActivityFeedEntry[];
  reportsRailBasePath: string;
}) {
  const [shown, setShown] = React.useState(8);
  const visible = entries.slice(0, shown);

  return (
    <>
      <SectionHeading
        overline="Activity"
        title="All observations"
        accent={mobile ? undefined : "every material, every cycle"}
        mobile={mobile}
      />
      <div style={{ padding: mobile ? "8px 16px 36px" : "10px 28px 60px" }}>
        <div style={{ ...cardStyle, padding: mobile ? 16 : 22 }}>
          <div style={{ marginBottom: 12 }}>
            <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
              Activity feed
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>
              Curriculum, whole-child &amp; reports
            </div>
            <div style={{ fontSize: 12, color: "var(--color-ink-muted)", marginTop: 2 }}>
              {entries.length} {entries.length === 1 ? "entry" : "entries"} total
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 10 : 0 }}>
            {visible.map((e) =>
              e.kind === "curriculum" ? (
                <CurriculumEntry key={`c-${e.id}`} e={e} mobile={mobile} />
              ) : e.kind === "whole-child" ? (
                <WholeChildEntry key={`w-${e.id}`} e={e} mobile={mobile} />
              ) : (
                <ReportEntry
                  key={`r-${e.id}`}
                  e={e}
                  mobile={mobile}
                  reportsRailBasePath={reportsRailBasePath}
                />
              )
            )}
          </div>

          {entries.length === 0 && (
            <div
              style={{
                padding: "20px 0",
                fontSize: 13,
                color: "var(--color-ink-muted)",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              No activity yet. Start with a new observation from the header.
            </div>
          )}

          {shown < entries.length && (
            <button
              type="button"
              className="tap"
              onClick={() => setShown((n) => Math.min(entries.length, n + 8))}
              style={{
                marginTop: 14,
                width: "100%",
                padding: "10px 14px",
                background: "var(--color-canvas)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-ink-secondary)",
              }}
            >
              Load {Math.min(8, entries.length - shown)} more
            </button>
          )}
        </div>
      </div>
    </>
  );
}
