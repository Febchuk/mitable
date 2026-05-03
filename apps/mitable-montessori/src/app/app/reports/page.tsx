"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { findChild, initialsFor, type ReportStatus } from "@/components/montessori/data";
import { FilterChips, PageHeader, cardStyle } from "@/components/montessori/page-header";
import { NewReportTrigger } from "@/components/montessori/new-report";
import { Avatar, HandCheck } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";

const STATUS_TONE: Record<ReportStatus, { bg: string; fg: string; label: string }> = {
  draft: {
    bg: "var(--color-butter-soft)",
    fg: "var(--color-butter-deep)",
    label: "Drafted by Mitable",
  },
  review: {
    bg: "var(--color-clay-soft)",
    fg: "var(--color-terracotta-deep)",
    label: "Awaiting admin review",
  },
  sent: {
    bg: "var(--color-sage-soft)",
    fg: "var(--color-sage-deep)",
    label: "Approved · sent",
  },
};

export default function ReportsPage() {
  const store = useMontessori();
  const drafts = store.reports.filter((r) => r.status === "draft").length;
  const reviews = store.reports.filter((r) => r.status === "review").length;
  const sent = store.reports.filter((r) => r.status === "sent").length;

  const filters = [
    "All",
    `Drafts · ${drafts}`,
    `Awaiting review · ${reviews}`,
    `Sent · ${sent}`,
    "Daily",
    "Major",
  ];

  const filtered = store.reports.filter((r) => {
    const f = store.reportsFilter;
    if (f === "All") return true;
    if (f.startsWith("Drafts")) return r.status === "draft";
    if (f.startsWith("Awaiting")) return r.status === "review";
    if (f.startsWith("Sent")) return r.status === "sent";
    if (f === "Daily") return r.kind === "Daily";
    if (f === "Major") return r.kind === "Major";
    return true;
  });

  return (
    <div>
      <PageHeader
        overline="My drafts + approved"
        title="Reports"
        subtitle={`${drafts} drafts · ${reviews} awaiting review · ${sent} sent`}
        actions={<NewReportTrigger />}
      />

      <div style={{ padding: "16px 24px 0" }}>
        <FilterChips
          options={filters}
          value={store.reportsFilter}
          onChange={store.setReportsFilter}
        />
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block" style={{ padding: "16px 24px 60px" }}>
        <div style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1.2fr 140px 24px",
              padding: "12px 20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            {["Child", "Type", "Period", "Status", "", ""].map((h, i) => (
              <div key={i} className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                {h}
              </div>
            ))}
          </div>
          {filtered.map((r) => {
            const child = findChild(r.childId);
            const tone = STATUS_TONE[r.status];
            return (
              <Link
                key={r.id}
                href={`/app/reports/${r.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1.2fr 140px 24px",
                  alignItems: "center",
                  padding: "12px 20px",
                  borderTop: "1px solid var(--color-border)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar
                    initials={child ? initialsFor(child.name) : "··"}
                    tone={child ? child.tone : "clay"}
                    size={32}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--color-ink)",
                      }}
                    >
                      {child ? child.name : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{r.period}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{r.kind}</div>
                <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{r.when}</div>
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "3px 9px",
                      background: tone.bg,
                      color: tone.fg,
                      borderRadius: 999,
                    }}
                  >
                    {r.status === "draft" && <Sparkles size={11} strokeWidth={1.5} />}
                    {r.status === "sent" && <HandCheck color={tone.fg} size={11} />}
                    {tone.label}
                  </span>
                </div>
                <div>
                  {r.status === "draft" ? (
                    <button
                      type="button"
                      className="tap"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        store.approveReport(r.id);
                      }}
                      style={{
                        background: "var(--color-terracotta)",
                        color: "var(--color-surface)",
                        border: 0,
                        borderRadius: 8,
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Approve &amp; send
                    </button>
                  ) : null}
                </div>
                <ChevronRight size={14} strokeWidth={1.5} />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden" style={{ padding: "16px 16px 60px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((r) => {
            const child = findChild(r.childId);
            const tone = STATUS_TONE[r.status];
            return (
              <Link
                key={r.id}
                href={`/app/reports/${r.id}`}
                className="tap"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 14,
                  padding: 14,
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <Avatar
                  initials={child ? initialsFor(child.name) : "··"}
                  tone={child ? child.tone : "clay"}
                  size={36}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--color-ink)",
                    }}
                  >
                    {child ? child.name : "Unknown"}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-ink-muted)",
                      marginTop: 1,
                    }}
                  >
                    {r.kind} report · {r.when}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "3px 9px",
                      background: tone.bg,
                      color: tone.fg,
                      borderRadius: 999,
                    }}
                  >
                    {r.status === "draft" && <Sparkles size={11} strokeWidth={1.5} />}
                    {r.status === "sent" && <HandCheck color={tone.fg} size={11} />}
                    {tone.label}
                  </div>
                  {r.status === "draft" && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="tap"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          store.approveReport(r.id);
                        }}
                        style={{
                          flex: 1,
                          background: "var(--color-terracotta)",
                          color: "var(--color-surface)",
                          border: 0,
                          borderRadius: 8,
                          padding: "6px 0",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Approve &amp; send
                      </button>
                      <span
                        className="tap"
                        style={{
                          background: "transparent",
                          color: "var(--color-ink-secondary)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Open
                      </span>
                    </div>
                  )}
                </div>
                <ChevronRight size={16} strokeWidth={1.5} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
