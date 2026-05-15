"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  Eye,
  MoreVertical,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { initialsFor, type Tone } from "@/components/montessori/data";
import type {
  ReportDetail as ReportDetailRow,
  ReportListRowV2 as ReportListRow,
} from "@/lib/queries/reports";
import { PageHeader } from "@/components/montessori/page-header";
import { NewReportTrigger } from "@/components/montessori/new-report";
import { Avatar, HandCheck } from "@/components/montessori/primitives";
import { ReportDetail } from "@/components/montessori/report-detail";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
import { ActionRail, type ActionRailModal } from "./action-rail";
import { ReportModalsHost, type ReportModal } from "./report-modals";
import styles from "./reports-rail.module.css";

const STATUS_TONE: Record<
  ReportListRow["status"],
  { bg: string; fg: string; label: string; sparkle?: boolean; sent?: boolean }
> = {
  draft: {
    bg: "var(--color-butter-soft)",
    fg: "var(--color-butter-deep)",
    label: "Drafted",
    sparkle: true,
  },
  submitted_for_review: {
    bg: "var(--color-clay-soft)",
    fg: "var(--color-terracotta-deep)",
    label: "Awaiting review",
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
    label: "Sent",
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

/** Short relative time ("12m", "3h", "yesterday", "May 7"). Mirrors the
 *  prototype's row meta voice — compact, no padding, no commas. */
function formatRelative(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** Map AI score to a green / amber / red tone for the completeness bar. */
function scoreTone(score: number): "high" | "med" | "low" {
  if (score >= 85) return "high";
  if (score >= 60) return "med";
  return "low";
}

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

/** Status filter is fixed to the four lifecycle buckets in the prototype. */
type StatusFilter = "drafts" | "review" | "approved" | "sent";
const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "drafts", label: "Drafts" },
  { id: "review", label: "In Review" },
  { id: "approved", label: "Approved" },
  { id: "sent", label: "Sent" },
];

function statusBucket(status: ReportListRow["status"]): StatusFilter {
  if (status === "draft" || status === "changes_requested") return "drafts";
  if (status === "submitted_for_review" || status === "in_review") return "review";
  if (status === "approved") return "approved";
  return "sent";
}

const ALL_CLASSROOMS = "__ALL__";

function firstSelectableReportId(
  rows: ReportListRow[],
  variant: "teacher" | "admin",
  classroomScope: string,
  filter: StatusFilter
): string | null {
  const isAdmin = variant === "admin";
  const scoped =
    !isAdmin || classroomScope === ALL_CLASSROOMS
      ? rows
      : rows.filter((r) => r.classroomId === classroomScope);
  return applyFilter(scoped, filter)[0]?.id ?? null;
}

function applyFilter(rows: ReportListRow[], filter: StatusFilter): ReportListRow[] {
  return rows.filter((r) => statusBucket(r.status) === filter);
}

export function ReportsRailView({
  reports,
  variant = "teacher",
  initialOpenReportId = null,
}: {
  reports: ReportListRow[];
  variant?: "teacher" | "admin";
  /** Deep-link from activity feed etc. — opens this report in the rail when present in `reports`. */
  initialOpenReportId?: string | null;
}) {
  const locale = useUiLocale();
  const isAdmin = variant === "admin";

  // Distinct (id, name) pairs derived from the loaded reports for the admin
  // classroom scope dropdown. Sorted by name with a stable fallback.
  const classroomOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of reports) {
      if (!r.classroomId) continue;
      if (!seen.has(r.classroomId)) {
        seen.set(r.classroomId, r.classroomName ?? "Untitled classroom");
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [reports]);

  const [classroomScope, setClassroomScope] = React.useState<string>(ALL_CLASSROOMS);
  const [filter, setFilter] = React.useState<StatusFilter>("drafts");

  const scopedReports = React.useMemo(() => {
    if (!isAdmin || classroomScope === ALL_CLASSROOMS) return reports;
    return reports.filter((r) => r.classroomId === classroomScope);
  }, [reports, isAdmin, classroomScope]);

  const filtered = React.useMemo(() => applyFilter(scopedReports, filter), [scopedReports, filter]);

  // Selection: keep stable across reorders + filter changes when possible.
  const [selectedId, setSelectedId] = React.useState<string | null>(() => {
    if (initialOpenReportId && reports.some((r) => r.id === initialOpenReportId)) {
      return initialOpenReportId;
    }
    return firstSelectableReportId(reports, variant, ALL_CLASSROOMS, "drafts");
  });

  React.useEffect(() => {
    if (!initialOpenReportId) return;
    const target = reports.find((r) => r.id === initialOpenReportId);
    if (!target) return;
    setFilter(statusBucket(target.status));
    if (isAdmin) setClassroomScope(ALL_CLASSROOMS);
    setSelectedId(initialOpenReportId);
  }, [initialOpenReportId, reports, isAdmin]);

  // The currently selected list row — drives the loading skeleton header
  // so the editor pane shows the right student/status while the full
  // detail is still in flight.
  const selectedRow = React.useMemo(
    () => (selectedId ? (reports.find((r) => r.id === selectedId) ?? null) : null),
    [reports, selectedId]
  );

  React.useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // In-memory cache so re-clicking previously-viewed reports is instant.
  // Survives row navigation but resets on full page navigation, which is
  // the right scope — fresh visits should pick up server-side updates.
  const detailCacheRef = React.useRef<Map<string, ReportDetailRow>>(new Map());

  const [detail, setDetail] = React.useState<ReportDetailRow | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  // Bumped after server-side mutations (e.g. send-to-parents) so the
  // selected report's cache is invalidated and the SWR effect re-fetches.
  const [refreshTick, setRefreshTick] = React.useState(0);

  const refreshSelectedDetail = React.useCallback(() => {
    if (selectedId) detailCacheRef.current.delete(selectedId);
    setRefreshTick((t) => t + 1);
  }, [selectedId]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    // Stale-while-revalidate: if we've fetched this report before, render
    // immediately. We still kick off a background fetch to refresh, so PATCH
    // results from the editor and any server-side changes catch up.
    const cached = detailCacheRef.current.get(selectedId);
    if (cached) {
      setDetail(cached);
      setDetailError(null);
    } else {
      // First view of this id — clear the previous report so the editor
      // pane doesn't flash stale content while the new fetch resolves.
      setDetail(null);
      setDetailLoading(true);
      setDetailError(null);
    }

    let cancelled = false;
    const ac = new AbortController();
    fetch(`/api/v1/reports/${selectedId}`, {
      credentials: "include",
      signal: ac.signal,
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          // Only surface an error if we have nothing cached to fall back to.
          if (!cached) {
            setDetailError(j.error || `Couldn't load report (${res.status})`);
            setDetail(null);
          }
          return;
        }
        const json = (await res.json()) as { report: ReportDetailRow };
        detailCacheRef.current.set(json.report.id, json.report);
        // Only apply if we're still pointing at this id — otherwise the
        // user has already moved on.
        if (json.report.id === selectedId) {
          setDetail(json.report);
        }
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (!cached) {
          setDetailError(err instanceof Error ? err.message : "Failed to load report");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [selectedId, refreshTick]);

  // Prefetch on hover/focus so the first click on a row is instant for
  // anything the teacher hovered over. No-op when already cached.
  const prefetchDetail = React.useCallback((id: string) => {
    if (detailCacheRef.current.has(id)) return;
    fetch(`/api/v1/reports/${id}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { report: ReportDetailRow } | null) => {
        if (json?.report) detailCacheRef.current.set(json.report.id, json.report);
      })
      .catch(() => {
        // Silent: prefetch failures fall through to the click-time fetch.
      });
  }, []);

  // Per-bucket counts drive both the page-header subtitle and the segmented
  // status tabs in the rail head, so they stay in sync without re-deriving.
  const counts = React.useMemo<Record<StatusFilter, number>>(() => {
    const acc: Record<StatusFilter, number> = {
      drafts: 0,
      review: 0,
      approved: 0,
      sent: 0,
    };
    for (const r of scopedReports) acc[statusBucket(r.status)] += 1;
    return acc;
  }, [scopedReports]);

  const subtitle = isAdmin
    ? `${counts.review} in review · ${counts.drafts} drafts · ${counts.approved} approved · ${counts.sent} sent`
    : `${counts.drafts} drafts · ${counts.review} in review · ${counts.approved} approved · ${counts.sent} sent`;

  /* Modal state — driven by the action rail (desktop) and the bottom action
     bar (mobile overlay). One state powers both surfaces; the rail-view owns
     it so the modals live above any layout boundary. */
  const [modalOpen, setModalOpen] = React.useState<ReportModal>(null);
  const openModal = React.useCallback((m: ActionRailModal) => setModalOpen(m), []);
  const closeModal = React.useCallback(() => setModalOpen(null), []);

  /* On mobile, tapping a row opens the report in a full-bleed overlay
     instead of stacking it below the list. The state is independent from
     selectedId so closing the overlay doesn't blow away the selection. */
  const [mobileOverlayOpen, setMobileOverlayOpen] = React.useState(false);
  const handleRowClick = React.useCallback((id: string) => {
    setSelectedId(id);
    setMobileOverlayOpen(true);
  }, []);
  const closeMobileOverlay = React.useCallback(() => {
    setMobileOverlayOpen(false);
    setModalOpen(null);
  }, []);

  // Lock body scroll while the mobile overlay is up.
  React.useEffect(() => {
    if (!mobileOverlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOverlayOpen]);

  // Esc closes the mobile overlay (the modals handle their own Esc via Radix).
  React.useEffect(() => {
    if (!mobileOverlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen === null) closeMobileOverlay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOverlayOpen, modalOpen, closeMobileOverlay]);

  // After a server mutation (Submit / Delete), close any open modal, drop
  // the cached detail for this id, and re-fetch the list via parent. Delete
  // additionally clears the selection so the list-only mobile view doesn't
  // get stuck on a gone report.
  const handleReportChanged = React.useCallback(() => {
    refreshSelectedDetail();
    // If the report no longer exists in the list after the next render, the
    // existing useEffect that watches `filtered` will reset selection.
  }, [refreshSelectedDetail]);

  const backHref = isAdmin ? "/admin/reports" : "/app/reports";

  return (
    <div className={styles.rrRoot}>
      <PageHeader
        overline={isAdmin ? "Across the school" : "My drafts + approved"}
        title="Reports"
        subtitle={subtitle}
        actions={!isAdmin ? <NewReportTrigger /> : undefined}
      />

      <div className={styles.rrLayout}>
        {/* Left rail — flat reports list */}
        <aside className={styles.rrRail}>
          {isAdmin && (
            <div className={styles.rrAdminScopeRow}>
              <ClassroomScopeSelect
                value={classroomScope}
                onChange={setClassroomScope}
                options={classroomOptions}
              />
            </div>
          )}

          <div className={styles.rrFilterBar}>
            <div className={styles.rrTabs} role="tablist" aria-label="Report status">
              {STATUS_FILTERS.map((t) => {
                const active = filter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${styles.rrTab} tap`}
                    data-active={active ? "true" : "false"}
                    onClick={() => setFilter(t.id)}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.rrList}>
            {filtered.length === 0 ? (
              <div className={styles.rrEmpty}>
                {scopedReports.length === 0
                  ? isAdmin
                    ? "No reports in this classroom yet."
                    : "No reports yet. Tap + above to draft the first one."
                  : "No reports match this filter."}
              </div>
            ) : (
              filtered.map((r) => {
                const active = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`${styles.rrRow} tap`}
                    data-active={active ? "true" : "false"}
                    onClick={() => handleRowClick(r.id)}
                    onMouseEnter={() => prefetchDetail(r.id)}
                    onFocus={() => prefetchDetail(r.id)}
                  >
                    <Avatar
                      initials={initialsFor(r.studentName)}
                      tone={toneFor(r.studentId)}
                      size={36}
                    />
                    <div className={styles.rrRowText}>
                      <div className={styles.rrRowTop}>
                        <div className={styles.rrRowName}>{r.studentName}</div>
                        <div className={styles.rrRowDate}>{formatWhen(r, locale)}</div>
                      </div>
                      <div className={styles.rrRowTitle}>{r.title || "Untitled report"}</div>
                      <div className={styles.rrRowMeta}>
                        <RowSignal row={r} bucket={filter} locale={locale} />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right pane — embedded ReportDetail for the selected row */}
        <section className={styles.rrMain}>
          {detail ? (
            // `key` forces ReportDetail to remount when the selected report
            // changes — its internal state (sections / chat / save queue)
            // is per-report, so a fresh instance is the cleanest swap.
            <ReportDetail
              key={detail.id}
              report={detail}
              hideBackLink
              hideTopBarActions
              hideTopBar
              variant={variant}
              onReportChanged={refreshSelectedDetail}
            />
          ) : detailLoading && selectedRow ? (
            <ReportLoadingSkeleton row={selectedRow} locale={locale} />
          ) : detailError ? (
            <div className={styles.rrEmptyState}>{detailError}</div>
          ) : (
            <div className={styles.rrEmptyState}>
              <div className="font-display" style={{ fontSize: 22, color: "var(--color-ink)" }}>
                No reports yet
              </div>
              <div
                style={{
                  marginTop: 8,
                  color: "var(--color-ink-secondary)",
                  fontSize: 13.5,
                  maxWidth: 460,
                  margin: "8px auto 0",
                }}
              >
                {isAdmin
                  ? "Pick a classroom to see its reports."
                  : "Tap the + in the top-right of the rail to draft your first report."}
              </div>
            </div>
          )}
        </section>

        {/* Action rail (desktop only — CSS hides on <lg). Reads the row’s
            status from the selected list row so it renders the right
            icons immediately, even while the detail is still loading. */}
        {selectedRow ? (
          <ActionRail
            status={selectedRow.status}
            isAdmin={isAdmin}
            onOpenModal={openModal}
            aiScore={selectedRow.displayScore}
          />
        ) : (
          <div className={styles.rrActionRail} aria-hidden />
        )}
      </div>

      {/* Modals (mounted once at the rail level so they sit above either
          the desktop columns or the mobile overlay). */}
      {detail && (
        <ReportModalsHost
          open={modalOpen}
          onClose={closeModal}
          report={detail}
          isAdmin={isAdmin}
          onChanged={handleReportChanged}
          backToReportsHref={backHref}
        />
      )}

      {/* Mobile overlay (CSS hides on ≥lg). Shows the report full-bleed
          when a row is tapped, with a bottom action bar that opens the same
          modals as the desktop rail. */}
      {mobileOverlayOpen && selectedRow && (
        <MobileReportOverlay
          row={selectedRow}
          detail={detail}
          detailLoading={detailLoading}
          locale={locale}
          variant={variant}
          isAdmin={isAdmin}
          onClose={closeMobileOverlay}
          onOpenModal={openModal}
          onReportChanged={refreshSelectedDetail}
        />
      )}
    </div>
  );
}

/**
 * Per-row meta signal — what reads to the right of the kind pill in the
 * rail's row list. Mirrors the prototype's four bucket modes:
 *   Drafts    → AI score completeness bar + "edited Xm ago"
 *   In Review → reviewer tick boxes (✓ ✓ □ + N/total) + "sent Xh"
 *   Approved  → paper-plane + relative approved time
 *   Sent      → delivered count + sent-date
 */
function RowSignal({
  row,
  bucket,
  locale,
}: {
  row: ReportListRow;
  bucket: StatusFilter;
  locale: string;
}) {
  if (bucket === "drafts") {
    const tone = scoreTone(row.completenessPercent);
    return (
      <span className={`${styles.rrSignal} ${styles.rrSignalCompleteness}`}>
        <span className={styles.rrCompleteness} data-tone={tone}>
          <span className={styles.rrCompletenessBar} aria-hidden>
            <i style={{ width: `${Math.max(0, Math.min(100, row.completenessPercent))}%` }} />
          </span>
          <span className={styles.rrCompletenessValue}>{row.completenessPercent}%</span>
        </span>
        <span className={styles.rrSignalMeta}>{formatRelative(row.updatedAt, locale)}</span>
      </span>
    );
  }

  if (bucket === "review") {
    const { approved, total } = row.reviewerTicks;
    const ticks = total > 0 ? total : 1;
    return (
      <span className={`${styles.rrSignal} ${styles.rrSignalTicks}`}>
        <span className={styles.rrTicks} aria-label={`${approved} of ${ticks} reviewers approved`}>
          {Array.from({ length: ticks }).map((_, i) => {
            const done = i < approved;
            return (
              <span key={i} className={styles.rrTickBox} data-done={done ? "true" : "false"}>
                {done ? <Check size={9} strokeWidth={3} /> : null}
              </span>
            );
          })}
          <span className={styles.rrTickCount}>
            {approved}/{ticks}
          </span>
        </span>
        <span className={styles.rrSignalMeta}>
          {row.lastSubmittedAt ? formatRelative(row.lastSubmittedAt, locale) : ""}
        </span>
      </span>
    );
  }

  if (bucket === "approved") {
    const when = row.lastSubmittedAt ?? row.updatedAt;
    return (
      <span className={`${styles.rrSignal} ${styles.rrSignalApproved}`}>
        <span className={styles.rrApprovedPill}>
          <Send size={10} strokeWidth={2.2} />
          <span>Approved</span>
        </span>
        <span className={styles.rrSignalMeta}>{formatRelative(when, locale)}</span>
      </span>
    );
  }

  // sent
  const { delivered, pending, failed } = row.delivery;
  const total = delivered + pending + failed;
  const allDelivered = total > 0 && delivered === total;
  return (
    <span className={`${styles.rrSignal} ${styles.rrSignalSent}`}>
      <span className={styles.rrSentPill} data-tone={allDelivered ? "sage" : "clay"}>
        <HandCheck color="currentColor" size={10} />
        <span>
          {delivered}/{total || 1} {allDelivered ? "delivered" : "sending"}
        </span>
      </span>
      <span className={styles.rrSignalMeta}>{formatWhen(row, locale)}</span>
    </span>
  );
}

/**
 * Full-bleed mobile overlay hosting <ReportDetail> + a bottom action bar.
 * Mirrors the desktop ActionRail's four icons. Modals open via the same
 * `openModal` callback as desktop, so the mounted `<ReportModalsHost>` at
 * the rail level handles them identically on both surfaces.
 */
function MobileReportOverlay({
  row,
  detail,
  detailLoading,
  locale,
  variant,
  isAdmin,
  onClose,
  onOpenModal,
  onReportChanged,
}: {
  row: ReportListRow;
  detail: ReportDetailRow | null;
  detailLoading: boolean;
  locale: string;
  variant: "teacher" | "admin";
  isAdmin: boolean;
  onClose: () => void;
  onOpenModal: (m: ActionRailModal) => void;
  onReportChanged: () => void;
}) {
  const tone = STATUS_TONE[row.status];
  const status = row.status;

  // Visibility per row status (mirrors the table baked into ActionRail).
  const showSend = status === "draft" || status === "changes_requested";
  const showAdminReview = isAdmin && (status === "submitted_for_review" || status === "in_review");
  const showDelete =
    status === "draft" ||
    status === "changes_requested" ||
    (isAdmin && (status === "approved" || status === "sent"));

  return (
    <>
      <div
        className={styles.rrMobileOverlayScrim}
        role="presentation"
        onClick={onClose}
        aria-hidden
      />
      <div className={styles.rrMobileOverlay} role="dialog" aria-label={row.studentName}>
        <div className={styles.rrMobileOverlayTop}>
          <button
            type="button"
            className={`${styles.rrMobileOverlayBack} tap`}
            onClick={onClose}
            aria-label="Back to reports list"
          >
            <ChevronLeft size={17} strokeWidth={2.2} />
          </button>
          <div className={styles.rrMobileOverlayTitle}>
            <div className={styles.rrMobileOverlayTitleName}>{row.studentName}</div>
            <div className={styles.rrMobileOverlayTitleSub}>
              <span style={{ color: tone.fg }}>{tone.label}</span>
              <span aria-hidden>·</span>
              <span>{row.title || "Untitled report"}</span>
            </div>
          </div>
          <button
            type="button"
            className={`${styles.rrMobileOverlayKebab} tap`}
            aria-label="More options"
            onClick={() => onOpenModal("history")}
          >
            <MoreVertical size={17} strokeWidth={1.8} />
          </button>
        </div>

        <div className={styles.rrMobileOverlayBody}>
          {detail ? (
            <ReportDetail
              key={detail.id}
              report={detail}
              hideBackLink
              hideTopBarActions
              hideTopBar
              variant={variant}
              onReportChanged={onReportChanged}
            />
          ) : detailLoading ? (
            <ReportLoadingSkeleton row={row} locale={locale} />
          ) : (
            <div className={styles.rrEmptyState}>Loading…</div>
          )}
        </div>

        <div className={styles.rrMobileActions}>
          <button
            type="button"
            className={`${styles.rrMobileAction} tap`}
            onClick={() => onOpenModal("preview")}
            aria-label="Preview PDF"
          >
            <Eye size={17} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={`${styles.rrMobileAction} tap`}
            onClick={() => onOpenModal("history")}
            aria-label="History"
          >
            <Clock size={17} strokeWidth={1.8} />
          </button>
          {showSend && (
            <button
              type="button"
              className={`${styles.rrMobileAction} tap`}
              onClick={() => onOpenModal("send")}
              aria-label="Submit for review"
            >
              <Send size={17} strokeWidth={2} />
            </button>
          )}
          {showAdminReview && (
            <>
              <button
                type="button"
                className={`${styles.rrMobileAction} tap`}
                onClick={() => onOpenModal("approve")}
                aria-label="Approve report"
              >
                <Check size={17} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className={`${styles.rrMobileAction} tap`}
                onClick={() => onOpenModal("request_changes")}
                aria-label="Request changes"
              >
                <RotateCcw size={17} strokeWidth={1.8} />
              </button>
            </>
          )}
          {showDelete && (
            <button
              type="button"
              className={`${styles.rrMobileAction} ${styles.rrMobileActionDanger} tap`}
              onClick={() => onOpenModal("delete")}
              aria-label="Delete report"
            >
              <Trash2 size={17} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Loading skeleton mirroring the editor header. Built from the rail row's
 * data so the user sees the right student, status, kind and date the
 * instant they click — even before the full detail fetch resolves. Body
 * area is a quiet dotted spinner card.
 */
function ReportLoadingSkeleton({ row, locale }: { row: ReportListRow; locale: string }) {
  const tone = STATUS_TONE[row.status];
  const kind = kindLabel(row.reportType);
  const headingTitle = `${kind} report — ${row.studentName.split(" ")[0]}`;

  // Map list-row status onto the topbar's narrower vocabulary.
  const pillClass =
    row.status === "sent" || row.status === "approved"
      ? "rd-pill-approved"
      : row.status === "draft"
        ? "rd-pill-draft"
        : "rd-pill-submitted";

  return (
    <div className={styles.rrSkeleton}>
      <div className="rd-page-header">
        <div className="rd-page-header-row">
          <div className="rd-page-header-left">
            <Avatar
              initials={initialsFor(row.studentName)}
              tone={toneFor(row.studentId)}
              size={56}
            />
            <div style={{ minWidth: 0 }}>
              <div className="rd-page-header-title-row">
                <h1 className="rd-page-header-title">{headingTitle}</h1>
                <span className={`rd-pill ${pillClass}`}>
                  <span className="rd-dot" />
                  {tone.label}
                </span>
              </div>
              <div className="rd-meta-row label-cap">
                <span>{kind}</span>
                <span className="rd-meta-sep" />
                <span>{formatWhen(row, locale)}</span>
                {row.classroomName && (
                  <>
                    <span className="rd-meta-sep" />
                    <span>{row.classroomName}</span>
                  </>
                )}
                <span className="rd-meta-sep" />
                <span style={{ color: "var(--color-ink-muted)" }}>Loading…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.rrSkeletonBody}>
        <span className={styles.rrLoadingSpinner} aria-hidden />
        <div style={{ marginTop: 12 }}>Loading {row.studentName.split(" ")[0]}&rsquo;s report…</div>
      </div>
    </div>
  );
}

function ClassroomScopeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <label className={styles.rrScope}>
      <span className="sr-only">Classroom</span>
      <select
        className={styles.rrScopeSelect}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by classroom"
      >
        <option value={ALL_CLASSROOMS}>All classrooms</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} strokeWidth={2} className={styles.rrScopeChev} aria-hidden />
    </label>
  );
}
