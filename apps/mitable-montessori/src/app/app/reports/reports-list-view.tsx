"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { initialsFor } from "@/components/montessori/data";
import type { ReportListRow } from "@/lib/queries/reports";
import { FilterChips, PageHeader, cardStyle } from "@/components/montessori/page-header";
import { NewReportTrigger } from "@/components/montessori/new-report";
import { Avatar, HandCheck } from "@/components/montessori/primitives";

const STATUS_TONE: Record<
  ReportListRow["status"],
  { bg: string; fg: string; label: string; sparkle?: boolean; sent?: boolean }
> = {
  draft: {
    bg: "var(--color-butter-soft)",
    fg: "var(--color-butter-deep)",
    label: "Drafted by Mitable",
    sparkle: true,
  },
  submitted_for_review: {
    bg: "var(--color-clay-soft)",
    fg: "var(--color-terracotta-deep)",
    label: "Awaiting admin review",
  },
  in_review: {
    bg: "var(--color-clay-soft)",
    fg: "var(--color-terracotta-deep)",
    label: "In review",
  },
  changes_requested: {
    bg: "var(--color-butter-soft)",
    fg: "var(--color-butter-deep)",
    label: "Changes requested",
  },
  approved: {
    bg: "var(--color-sage-soft)",
    fg: "var(--color-sage-deep)",
    label: "Approved",
  },
  sent: {
    bg: "var(--color-sage-soft)",
    fg: "var(--color-sage-deep)",
    label: "Approved · sent",
    sent: true,
  },
};

function kindLabel(t: ReportListRow["reportType"]): string {
  if (t === "daily") return "Daily";
  if (t === "major") return "Major";
  return "Incident";
}

function formatWhen(row: ReportListRow): string {
  const date = row.reportDate || row.createdAt.slice(0, 10);
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function tonesByIndex(i: number): "clay" | "sage" | "butter" | "blue" | "terracotta" {
  return (["clay", "sage", "butter", "blue", "terracotta"] as const)[i % 5];
}

export function ReportsListView({
  reports,
  variant = "teacher",
}: {
  reports: ReportListRow[];
  variant?: "teacher" | "admin";
}) {
  const [filter, setFilter] = React.useState("All");
  const isAdmin = variant === "admin";
  const detailHref = (id: string) => (isAdmin ? `/admin/reports/${id}` : `/app/reports/${id}`);

  const drafts = reports.filter((r) => r.status === "draft").length;
  const reviews = reports.filter(
    (r) => r.status === "submitted_for_review" || r.status === "in_review"
  ).length;
  const sent = reports.filter((r) => r.status === "sent" || r.status === "approved").length;

  const filters = [
    "All",
    `Drafts · ${drafts}`,
    `Awaiting review · ${reviews}`,
    `Sent · ${sent}`,
    "Daily",
    "Major",
    "Incident",
  ];

  const filtered = reports.filter((r) => {
    if (filter === "All") return true;
    if (filter.startsWith("Drafts")) return r.status === "draft";
    if (filter.startsWith("Awaiting"))
      return r.status === "submitted_for_review" || r.status === "in_review";
    if (filter.startsWith("Sent")) return r.status === "sent" || r.status === "approved";
    if (filter === "Daily") return r.reportType === "daily";
    if (filter === "Major") return r.reportType === "major";
    if (filter === "Incident") return r.reportType === "incident";
    return true;
  });

  return (
    <div>
      <PageHeader
        overline={isAdmin ? "Across the school" : "My drafts + approved"}
        title="Reports"
        subtitle={
          isAdmin
            ? `${reviews} awaiting review · ${drafts} drafts · ${sent} sent`
            : `${drafts} drafts · ${reviews} awaiting review · ${sent} sent`
        }
        actions={isAdmin ? undefined : <NewReportTrigger />}
      />

      <div style={{ padding: "16px 24px 0" }}>
        <FilterChips options={filters} value={filter} onChange={setFilter} />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--color-ink-muted)" }}>
          <p style={{ fontSize: 14, margin: 0 }}>
            {reports.length === 0
              ? "No reports yet. Tap + to start drafting."
              : "No reports match this filter."}
          </p>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden lg:block" style={{ padding: "16px 24px 60px" }}>
        {filtered.length > 0 && (
          <div style={cardStyle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1.2fr 24px",
                padding: "12px 20px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {["Child", "Type", "Date", "Status", ""].map((h, i) => (
                <div key={i} className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                  {h}
                </div>
              ))}
            </div>
            {filtered.map((r, idx) => {
              const tone = STATUS_TONE[r.status];
              return (
                <Link
                  key={r.id}
                  href={detailHref(r.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1.2fr 24px",
                    alignItems: "center",
                    padding: "12px 20px",
                    borderTop: "1px solid var(--color-border)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar
                      initials={initialsFor(r.studentName)}
                      tone={tonesByIndex(idx)}
                      size={32}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)" }}>
                        {r.studentName}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                        {r.title || "Untitled"}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
                    {kindLabel(r.reportType)}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
                    {formatWhen(r)}
                  </div>
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
                      {tone.sparkle && <Sparkles size={11} strokeWidth={1.5} />}
                      {tone.sent && <HandCheck color={tone.fg} size={11} />}
                      {tone.label}
                    </span>
                  </div>
                  <ChevronRight size={14} strokeWidth={1.5} />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden" style={{ padding: "16px 16px 60px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((r, idx) => {
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
                <Avatar initials={initialsFor(r.studentName)} tone={tonesByIndex(idx)} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>
                    {r.studentName}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-muted)", marginTop: 1 }}>
                    {kindLabel(r.reportType)} report · {formatWhen(r)}
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
                    {tone.sparkle && <Sparkles size={11} strokeWidth={1.5} />}
                    {tone.sent && <HandCheck color={tone.fg} size={11} />}
                    {tone.label}
                  </div>
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
