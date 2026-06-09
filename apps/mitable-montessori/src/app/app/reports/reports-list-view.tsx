"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Trash2 } from "lucide-react";
import { initialsFor } from "@/components/montessori/data";
import type { ReportListRow } from "@/lib/queries/reports";
import {
  FilterChips,
  FilterSelect,
  PageHeader,
  cardStyle,
} from "@/components/montessori/page-header";
import { NewReportTrigger } from "@/components/montessori/new-report";
import { Avatar, HandCheck, ToastBus } from "@/components/montessori/primitives";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

function formatWhen(row: ReportListRow, locale: string): string {
  const date = row.reportDate || row.createdAt.slice(0, 10);
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function tonesByIndex(i: number): "clay" | "sage" | "butter" | "blue" | "terracotta" {
  return (["clay", "sage", "butter", "blue", "terracotta"] as const)[i % 5];
}

function teacherReportsSubtitle(classroomName: string | null | undefined): string {
  if (classroomName) {
    return `Draft and send ${classroomName} progress reports to families.`;
  }
  return "Draft and send progress reports to families.";
}

export function ReportsListView({
  reports,
  variant = "teacher",
  classroomName,
}: {
  reports: ReportListRow[];
  variant?: "teacher" | "admin";
  classroomName?: string | null;
}) {
  const router = useRouter();
  const locale = useUiLocale();
  const isAdmin = variant === "admin";
  const [filter, setFilter] = React.useState(variant === "admin" ? "All" : "all");
  const [pendingDelete, setPendingDelete] = React.useState<ReportListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const confirmListDelete = React.useCallback(async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/v1/reports/${pendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't delete this report." });
        return;
      }
      setPendingDelete(null);
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }, [pendingDelete, router]);
  const detailHref = (id: string) =>
    isAdmin ? `/admin/reports?open=${encodeURIComponent(id)}` : `/app/reports/${id}`;

  const drafts = reports.filter((r) => r.status === "draft").length;
  const reviews = reports.filter(
    (r) => r.status === "submitted_for_review" || r.status === "in_review"
  ).length;
  const sent = reports.filter((r) => r.status === "sent" || r.status === "approved").length;

  const chipFilters = [
    "All",
    `Drafts · ${drafts}`,
    `Awaiting review · ${reviews}`,
    `Sent · ${sent}`,
    "Daily",
    "Major",
    "Incident",
  ];

  const selectFilters = [
    { value: "all", label: "All reports" },
    { value: "drafts", label: "Drafts" },
    { value: "awaiting", label: "Awaiting review" },
    { value: "sent", label: "Sent" },
    { value: "daily", label: "Daily" },
    { value: "major", label: "Major" },
    { value: "incident", label: "Incident" },
  ];

  const filtered = reports.filter((r) => {
    if (isAdmin) {
      if (filter === "All") return true;
      if (filter.startsWith("Drafts")) return r.status === "draft";
      if (filter.startsWith("Awaiting"))
        return r.status === "submitted_for_review" || r.status === "in_review";
      if (filter.startsWith("Sent")) return r.status === "sent" || r.status === "approved";
      if (filter === "Daily") return r.reportType === "daily";
      if (filter === "Major") return r.reportType === "major";
      if (filter === "Incident") return r.reportType === "incident";
      return true;
    }
    if (filter === "all") return true;
    if (filter === "drafts") return r.status === "draft";
    if (filter === "awaiting")
      return r.status === "submitted_for_review" || r.status === "in_review";
    if (filter === "sent") return r.status === "sent" || r.status === "approved";
    if (filter === "daily") return r.reportType === "daily";
    if (filter === "major") return r.reportType === "major";
    if (filter === "incident") return r.reportType === "incident";
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={
          isAdmin
            ? "Review and manage reports across the school."
            : teacherReportsSubtitle(classroomName)
        }
        actions={isAdmin ? undefined : <NewReportTrigger />}
      />

      <div style={{ padding: "16px 24px 0" }}>
        {isAdmin ? (
          <FilterChips options={chipFilters} value={filter} onChange={setFilter} />
        ) : (
          <FilterSelect label="Show" value={filter} onChange={setFilter} options={selectFilters} />
        )}
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
                gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1.2fr 36px",
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
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 0.7fr 0.8fr 1.2fr 36px",
                    alignItems: "center",
                    padding: "12px 20px",
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  <Link
                    href={detailHref(r.id)}
                    style={{
                      display: "contents",
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
                      {formatWhen(r, locale)}
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
                  </Link>
                  <button
                    type="button"
                    aria-label={`Delete report for ${r.studentName}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setPendingDelete(r);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: 6,
                      borderRadius: 8,
                      color: "var(--color-ink-muted)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                </div>
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
              <div
                key={r.id}
                className="tap"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 14,
                  padding: 14,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <Link
                  href={detailHref(r.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <Avatar
                    initials={initialsFor(r.studentName)}
                    tone={tonesByIndex(idx)}
                    size={36}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>
                      {r.studentName}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-ink-muted)", marginTop: 1 }}>
                      {kindLabel(r.reportType)} report · {formatWhen(r, locale)}
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
                </Link>
                <button
                  type="button"
                  aria-label={`Delete report for ${r.studentName}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setPendingDelete(r);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 6,
                    marginTop: -2,
                    borderRadius: 8,
                    color: "var(--color-ink-muted)",
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={18} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Delete this report?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? (
                <>
                  This removes the report for{" "}
                  <span className="font-medium text-ink">{pendingDelete.studentName}</span> from the
                  database. This cannot be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-ink/15 bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas-muted"
              disabled={deleteBusy}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{
                borderColor: "rgba(232, 116, 116, 0.45)",
                color: "var(--status-error, #e87474)",
              }}
              disabled={deleteBusy}
              onClick={() => void confirmListDelete()}
            >
              {deleteBusy ? "Deleting…" : "Delete report"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
