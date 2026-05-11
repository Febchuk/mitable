"use client";

import * as React from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { initialsFor, type Tone } from "@/components/montessori/data";
import type { ReportDetail as ReportDetailRow, ReportListRow } from "@/lib/queries/reports";
import { FilterChips, PageHeader } from "@/components/montessori/page-header";
import { NewReportTrigger } from "@/components/montessori/new-report";
import { Avatar, HandCheck } from "@/components/montessori/primitives";
import { ReportDetail } from "@/components/montessori/report-detail";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
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

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

const FILTERS = ["All", "Drafts", "Awaiting review", "Sent", "Daily", "Major", "Incident"];

const ALL_CLASSROOMS = "__ALL__";

function applyFilter(rows: ReportListRow[], filter: string): ReportListRow[] {
  return rows.filter((r) => {
    if (filter === "All") return true;
    if (filter === "Drafts") return r.status === "draft";
    if (filter === "Awaiting review")
      return r.status === "submitted_for_review" || r.status === "in_review";
    if (filter === "Sent") return r.status === "sent" || r.status === "approved";
    if (filter === "Daily") return r.reportType === "daily";
    if (filter === "Major") return r.reportType === "major";
    if (filter === "Incident") return r.reportType === "incident";
    return true;
  });
}

export function ReportsRailView({
  reports,
  variant = "teacher",
}: {
  reports: ReportListRow[];
  variant?: "teacher" | "admin";
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
  const [filter, setFilter] = React.useState("All");

  const scopedReports = React.useMemo(() => {
    if (!isAdmin || classroomScope === ALL_CLASSROOMS) return reports;
    return reports.filter((r) => r.classroomId === classroomScope);
  }, [reports, isAdmin, classroomScope]);

  const filtered = React.useMemo(() => applyFilter(scopedReports, filter), [scopedReports, filter]);

  // Selection: keep stable across reorders + filter changes when possible.
  const [selectedId, setSelectedId] = React.useState<string | null>(filtered[0]?.id ?? null);

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

  const drafts = scopedReports.filter((r) => r.status === "draft").length;
  const awaiting = scopedReports.filter(
    (r) => r.status === "submitted_for_review" || r.status === "in_review"
  ).length;
  const sent = scopedReports.filter((r) => r.status === "sent" || r.status === "approved").length;

  const subtitle = isAdmin
    ? `${awaiting} awaiting review · ${drafts} drafts · ${sent} sent`
    : `${drafts} drafts · ${awaiting} awaiting review · ${sent} sent`;

  return (
    <div className={styles.rrRoot}>
      <PageHeader
        overline={isAdmin ? "Across the school" : "My drafts + approved"}
        title="Reports"
        subtitle={subtitle}
      />

      <div className={styles.rrLayout}>
        {/* Left rail — flat reports list */}
        <aside className={styles.rrRail}>
          <header className={styles.rrRailHeader}>
            {isAdmin ? (
              <ClassroomScopeSelect
                value={classroomScope}
                onChange={setClassroomScope}
                options={classroomOptions}
              />
            ) : (
              <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                All reports
              </div>
            )}
            {!isAdmin && <NewReportTrigger />}
          </header>

          <div className={styles.rrFilterBar}>
            <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
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
                const tone = STATUS_TONE[r.status];
                const active = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`${styles.rrRow} tap`}
                    data-active={active ? "true" : "false"}
                    onClick={() => setSelectedId(r.id)}
                    onMouseEnter={() => prefetchDetail(r.id)}
                    onFocus={() => prefetchDetail(r.id)}
                  >
                    <Avatar
                      initials={initialsFor(r.studentName)}
                      tone={toneFor(r.studentId)}
                      size={32}
                    />
                    <div className={styles.rrRowText}>
                      <div className={styles.rrRowTop}>
                        <div className={styles.rrRowName}>{r.studentName}</div>
                        <div className={styles.rrRowDate}>{formatWhen(r, locale)}</div>
                      </div>
                      <div className={styles.rrRowTitle}>{r.title || "Untitled report"}</div>
                      <div className={styles.rrRowMeta}>
                        <span className={styles.rrRowKind}>{kindLabel(r.reportType)}</span>
                        <span
                          className={styles.rrRowStatus}
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {tone.sparkle && <Sparkles size={10} strokeWidth={1.5} />}
                          {tone.sent && <HandCheck color={tone.fg} size={10} />}
                          {tone.label}
                        </span>
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
      </div>
    </div>
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
