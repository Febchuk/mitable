"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ToastBus } from "@/components/montessori/primitives";
import type { MockReport, V2Tab } from "./mock-data";
import { tabCounts } from "./mock-data";
import { ListRow } from "./list-row";
import { ReadingPane, type RenderedSection } from "./reading-pane";
import { ChatRail } from "./chat-rail";
import { SendForReviewDrawer, SendForReviewMobileSheet } from "./send-for-review";
import { RequestChangesDialog } from "./request-changes-dialog";
import { SendToParentsDialog } from "./send-to-parents-dialog";
import { Icon } from "./icons";
import {
  approveReport,
  requestChanges,
  rescoreReport,
  submitReport,
  tickReviewer,
  ReportsApiError,
} from "@/lib/reports-v2/api";
import styles from "./reports-v2.module.css";

type Variant = "teacher" | "admin";

const TABS: { id: V2Tab; label: string; sub: string }[] = [
  { id: "drafts", label: "Drafts", sub: "ready to send" },
  { id: "review", label: "In Review", sub: "waiting on reviewers" },
  { id: "approved", label: "Approved", sub: "cleared to send to parents" },
  { id: "sent", label: "Sent", sub: "delivered this week" },
];

/** UI mode for in-flight action — drives spinner placement + which dialog is open. */
type Modal =
  | null
  | "send-for-review"
  | "send-for-review-mobile"
  | "request-changes"
  | "send-to-parents";

export function ReportsV2Shell({
  reports,
  variant,
  initialSelectedId,
  selectedSections,
  classrooms,
  activeClassroomId,
  currentUserId,
}: {
  reports: MockReport[];
  variant: Variant;
  initialSelectedId?: string | null;
  selectedSections?: RenderedSection[] | null;
  /** Admin-only: list of classrooms for the filter chip. Omit for teachers. */
  classrooms?: { id: string; name: string | null }[];
  /** Admin-only: currently-selected classroom from ?classroom=. */
  activeClassroomId?: string | null;
  /** Current authenticated user's id. Used to decide whether `Approve` on a
   *  row should call tickReviewer (assigned reviewer) or approveReport
   *  (admin override). null when unauthenticated (page should already have
   *  redirected, but the shell stays robust). */
  currentUserId?: string | null;
}) {
  const isAdmin = variant === "admin";
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const initialTab: V2Tab = useMemo(() => {
    if (initialSelectedId) {
      const sel = reports.find((r) => r.id === initialSelectedId);
      if (sel) return sel.tab;
    }
    return "drafts";
  }, [reports, initialSelectedId]);

  const [tab, setTab] = useState<V2Tab>(initialTab);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [modal, setModal] = useState<Modal>(null);
  /** ids that are mid-flight (spinner + disable). Cleared after revalidate. */
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const counts = tabCounts(reports);
  const visible = useMemo(() => reports.filter((r) => r.tab === tab), [reports, tab]);
  const selected = useMemo(
    () => visible.find((r) => r.id === selectedId) ?? visible[0],
    [visible, selectedId]
  );
  const isSelectedBusy = selected ? busyIds.has(selected.id) : false;

  const onSelect = (id: string) => {
    setSelectedId(id);
    router.push(`${pathname}?open=${encodeURIComponent(id)}`, { scroll: false });
  };

  const sectionsForSelected =
    selected && selected.id === initialSelectedId ? selectedSections : null;

  /**
   * Run an action against a report, with optimistic busy state + a router
   * refresh on success. Errors surface via ToastBus + an error message in any
   * dialog that owns the call.
   */
  const runAction = async (
    reportId: string,
    fn: () => Promise<unknown>,
    successMessage: string
  ): Promise<void> => {
    setBusyIds((s) => new Set(s).add(reportId));
    try {
      await fn();
      ToastBus.push({ message: successMessage });
      // Re-fetch reports + sections so the row moves to the right tab.
      startTransition(() => router.refresh());
    } catch (err) {
      const msg =
        err instanceof ReportsApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong";
      ToastBus.push({ message: msg });
      // Re-throw so dialogs keep their error UI populated.
      throw err;
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(reportId);
        return next;
      });
    }
  };

  /** Approve action — picks the right endpoint based on user's relationship
   *  to the report:
   *    - If the user is an assigned pending reviewer, calls tickReviewer.
   *      That records their ✓ on report_reviewers, leaving final sign-off
   *      to an admin.
   *    - Otherwise (admin override, or no reviewers assigned), calls
   *      approveReport which flips the report to `approved` directly. */
  const handleApprove = async (report: MockReport) => {
    const myAssignment =
      currentUserId && report.reviewerRows
        ? report.reviewerRows.find((r) => r.userId === currentUserId)
        : null;
    const shouldTick = myAssignment && myAssignment.status === "pending";

    if (shouldTick) {
      await runAction(
        report.id,
        () => tickReviewer({ reportId: report.id, status: "approved" }),
        `Approved ${report.childName} — waiting on admin sign-off`
      );
    } else {
      await runAction(report.id, () => approveReport(report.id), `Approved ${report.childName}`);
    }
  };

  const handleRequestChangesFromReviewer = async (report: MockReport, notes: string) => {
    // If the current user is an assigned reviewer, tick with "changes_requested"
    // rather than transitioning the whole report. Otherwise fall through to
    // the workflow endpoint that flips the report status. The two share UX
    // (same dialog) so the caller doesn't have to branch.
    const myAssignment =
      currentUserId && report.reviewerRows
        ? report.reviewerRows.find((r) => r.userId === currentUserId)
        : null;
    const shouldTick = myAssignment && myAssignment.status === "pending";

    if (shouldTick) {
      await runAction(
        report.id,
        () => tickReviewer({ reportId: report.id, status: "changes_requested", note: notes }),
        `Sent ${report.childName} back to author with notes`
      );
    } else {
      await runAction(
        report.id,
        () => requestChanges(report.id, notes),
        `Sent back to ${report.childName}'s author with notes`
      );
    }
    setModal(null);
  };

  const handleSendForReview = async (
    report: MockReport,
    args: { reviewerIds: string[]; note: string }
  ): Promise<void> => {
    await runAction(
      report.id,
      () =>
        submitReport({
          reportId: report.id,
          reviewerIds: args.reviewerIds.length > 0 ? args.reviewerIds : undefined,
          note: args.note || undefined,
        }),
      `Sent ${report.childName}'s report to ${args.reviewerIds.length} reviewer${args.reviewerIds.length === 1 ? "" : "s"}`
    );
    setModal(null);
  };

  const handleRequestChanges = (report: MockReport, notes: string) =>
    handleRequestChangesFromReviewer(report, notes);

  const handleRescore = async (report: MockReport) => {
    await runAction(report.id, () => rescoreReport(report.id), `Re-scored ${report.childName}`);
  };

  const handleSentToParents = async (report: MockReport, count: number) => {
    ToastBus.push({
      message: `${report.childName}'s report sent to ${count} guardian${count === 1 ? "" : "s"}`,
    });
    startTransition(() => router.refresh());
    setModal(null);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.titleLine}>
            <h1>Reports</h1>
            {isAdmin && <span className={styles.adminBadge}>Admin</span>}
          </div>
          {isAdmin && classrooms && classrooms.length > 0 && (
            <ClassroomFilter
              classrooms={classrooms}
              activeId={activeClassroomId ?? null}
              onChange={(id) => {
                const params = new URLSearchParams();
                if (id) params.set("classroom", id);
                startTransition(() =>
                  router.push(params.size > 0 ? `${pathname}?${params}` : pathname, {
                    scroll: false,
                  })
                );
              }}
            />
          )}
        </div>
        <div className={styles.topBarRight}>
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? styles.tabActive : ""}
                onClick={() => {
                  setTab(t.id);
                  setSelectedId(null);
                }}
              >
                {t.label}
                <span className={styles.count}>{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <Link
            href="/app/reports"
            className={`${styles.btn} ${styles.btnSecondary}`}
            style={{ textDecoration: "none" }}
            title="Open the legacy reports page to create a new draft (Phase 3.5 brings creation inline)"
          >
            <Icon.Plus size={13} /> New report
          </Link>
        </div>
      </header>

      <div className={styles.workArea}>
        <div className={styles.layoutC} data-chat-collapsed={chatCollapsed ? "true" : "false"}>
          <ListColumn
            tab={tab}
            counts={counts}
            visible={visible}
            selected={selected}
            busyIds={busyIds}
            onSelect={onSelect}
            onQuickApprove={isAdmin ? handleApprove : undefined}
            compact
          />
          <div style={{ position: "relative", minWidth: 0 }}>
            {selected ? (
              <ReadingPane
                report={selected}
                tab={tab}
                isAdmin={isAdmin}
                embeddedPaneTabs={false}
                sections={sectionsForSelected}
                busy={isSelectedBusy}
                onSendForReview={() => setModal("send-for-review")}
                onApprove={() => handleApprove(selected)}
                onOverrideApprove={() => handleApprove(selected)}
                onRequestChanges={() => setModal("request-changes")}
                onComment={() => setChatCollapsed(false)}
                onSendNow={() => setModal("send-to-parents")}
                onRescore={() => handleRescore(selected)}
              />
            ) : (
              <EmptyState tab={tab} />
            )}
            {modal === "send-for-review" && selected && (
              <SendForReviewDrawer
                report={selected}
                onClose={() => setModal(null)}
                onSubmit={(args) => handleSendForReview(selected, args)}
              />
            )}
          </div>
          <ChatRail
            collapsed={chatCollapsed}
            onToggleCollapsed={() => setChatCollapsed((v) => !v)}
          />
        </div>
      </div>

      {modal === "send-for-review-mobile" && selected && (
        <SendForReviewMobileSheet
          report={selected}
          onClose={() => setModal(null)}
          onSubmit={(args) => handleSendForReview(selected, args)}
        />
      )}

      {modal === "request-changes" && selected && (
        <RequestChangesDialog
          open
          reportTitle={selected.title}
          childName={selected.childName}
          onCancel={() => setModal(null)}
          onSubmit={(notes) => handleRequestChanges(selected, notes)}
        />
      )}

      {modal === "send-to-parents" && selected && selected.studentId && (
        <SendToParentsDialog
          open
          reportId={selected.id}
          studentId={selected.studentId}
          reportTitle={selected.title}
          childName={selected.childName}
          onCancel={() => setModal(null)}
          onSent={(count) => handleSentToParents(selected, count)}
        />
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: V2Tab }) {
  const meta = TABS.find((t) => t.id === tab);
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        padding: 32,
        textAlign: "center",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            color: "var(--color-ink-secondary)",
          }}
        >
          {tab === "drafts"
            ? "no drafts yet"
            : tab === "review"
              ? "nothing waiting for review"
              : tab === "approved"
                ? "no approved reports queued"
                : "no reports sent this week"}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-ink-muted)" }}>
          {tab === "drafts" ? "Start a new report and it'll land here while you write." : meta?.sub}
        </div>
      </div>
    </div>
  );
}

function ClassroomFilter({
  classrooms,
  activeId,
  onChange,
}: {
  classrooms: { id: string; name: string | null }[];
  activeId: string | null;
  onChange: (id: string | null) => void;
}) {
  const active = classrooms.find((c) => c.id === activeId) ?? null;
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginLeft: 12,
        padding: "5px 6px 5px 11px",
        borderRadius: 999,
        border: "1px solid var(--color-border)",
        background: active
          ? "color-mix(in srgb, var(--color-terracotta-soft) 50%, var(--color-surface))"
          : "var(--color-surface)",
        fontSize: 11.5,
        fontWeight: 600,
        color: active ? "var(--color-terracotta-deep)" : "var(--color-ink-secondary)",
      }}
    >
      <span style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 10 }}>
        Classroom
      </span>
      <select
        value={activeId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
          color: "inherit",
          padding: "2px 4px",
          cursor: "pointer",
          outline: "none",
        }}
      >
        <option value="">All</option>
        {classrooms.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name ?? "Unnamed"}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListColumn({
  tab,
  counts,
  visible,
  selected,
  busyIds,
  onSelect,
  onQuickApprove,
  compact,
}: {
  tab: V2Tab;
  counts: Record<V2Tab, number>;
  visible: MockReport[];
  selected: MockReport | undefined;
  busyIds: Set<string>;
  onSelect: (id: string) => void;
  /** Quick approve, only wired for admin. */
  onQuickApprove?: (report: MockReport) => Promise<void> | void;
  compact?: boolean;
}) {
  const TAB_META = TABS.find((t) => t.id === tab);
  return (
    <aside className={styles.listRail}>
      <div className={styles.listToolbar} style={compact ? { padding: "12px 14px 10px" } : {}}>
        <h2 style={compact ? { fontSize: 16 } : {}}>{TAB_META?.label}</h2>
        <div className={styles.sub}>
          {counts[tab]} report{counts[tab] === 1 ? "" : "s"} · {TAB_META?.sub}
        </div>
      </div>
      <div className={styles.rows}>
        {visible.map((r) => (
          <ListRow
            key={r.id}
            report={r}
            tab={tab}
            selected={selected?.id === r.id}
            onSelect={() => onSelect(r.id)}
            onQuickApprove={
              tab === "review" && onQuickApprove ? () => onQuickApprove(r) : undefined
            }
            busy={busyIds.has(r.id)}
          />
        ))}
      </div>
    </aside>
  );
}
