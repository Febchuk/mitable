"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { MockReport, V2Tab } from "./mock-data";
import { tabCounts } from "./mock-data";
import { ListRow } from "./list-row";
import { ReadingPane, type RenderedSection } from "./reading-pane";
import { ChatRail } from "./chat-rail";
import { SendForReviewDrawer, SendForReviewMobileSheet } from "./send-for-review";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

type Variant = "teacher" | "admin";

const TABS: { id: V2Tab; label: string; sub: string }[] = [
  { id: "drafts", label: "Drafts", sub: "ready to send" },
  { id: "review", label: "In Review", sub: "waiting on reviewers" },
  { id: "approved", label: "Approved", sub: "cleared to send to parents" },
  { id: "sent", label: "Sent", sub: "delivered this week" },
];

export function ReportsV2Shell({
  reports,
  variant,
  initialSelectedId,
  selectedSections,
}: {
  reports: MockReport[];
  variant: Variant;
  /** Server pre-resolved selection (from ?open=…). */
  initialSelectedId?: string | null;
  /** Body of the pre-resolved report. Server-fetched. */
  selectedSections?: RenderedSection[] | null;
}) {
  const isAdmin = variant === "admin";
  const router = useRouter();
  const pathname = usePathname();

  // Default tab: derive from the initially-selected report so the user lands
  // on the right tab when navigating via ?open=. If there's no selection,
  // start on Drafts (the most common entry point for teachers).
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
  const [sendDrawerOpen, setSendDrawerOpen] = useState(false);
  const [sendSheetOpen, setSendSheetOpen] = useState(false);

  const counts = tabCounts(reports);
  const visible = useMemo(() => reports.filter((r) => r.tab === tab), [reports, tab]);
  const selected = useMemo(
    () => visible.find((r) => r.id === selectedId) ?? visible[0],
    [visible, selectedId]
  );

  // Selecting a new row updates the URL with ?open=… so the server can
  // re-fetch that report's sections. This matches the existing /app/reports
  // pattern.
  const onSelect = (id: string) => {
    setSelectedId(id);
    router.push(`${pathname}?open=${encodeURIComponent(id)}`, { scroll: false });
  };

  // Sections only apply when the URL-resolved id matches the in-memory
  // selection. If the user clicked a different row, sections are stale until
  // the route round-trip completes — show the row summary as fallback.
  const sectionsForSelected =
    selected && selected.id === initialSelectedId ? selectedSections : null;

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.titleLine}>
            <h1>Reports</h1>
            {isAdmin && <span className={styles.adminBadge}>Admin</span>}
          </div>
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
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`}>
            <Icon.Plus size={13} /> New report
          </button>
        </div>
      </header>

      <div className={styles.workArea}>
        <div className={styles.layoutC} data-chat-collapsed={chatCollapsed ? "true" : "false"}>
          <ListColumn
            tab={tab}
            counts={counts}
            visible={visible}
            selected={selected}
            onSelect={onSelect}
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
                onSendForReview={() => setSendDrawerOpen(true)}
                onApprove={() => alert("Approve (Phase 3 wires this)")}
                onOverrideApprove={() => alert("Admin override (Phase 5)")}
                onRequestChanges={() => alert("Request changes (Phase 3)")}
                onComment={() => alert("Comment (Phase 3)")}
                onSendNow={() => alert("Send now (Phase 5)")}
              />
            ) : (
              <EmptyState tab={tab} />
            )}
            {sendDrawerOpen && selected && (
              <SendForReviewDrawer report={selected} onClose={() => setSendDrawerOpen(false)} />
            )}
          </div>
          <ChatRail
            collapsed={chatCollapsed}
            onToggleCollapsed={() => setChatCollapsed((v) => !v)}
          />
        </div>
      </div>

      {sendSheetOpen && selected && (
        <SendForReviewMobileSheet report={selected} onClose={() => setSendSheetOpen(false)} />
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

function ListColumn({
  tab,
  counts,
  visible,
  selected,
  onSelect,
  compact,
}: {
  tab: V2Tab;
  counts: Record<V2Tab, number>;
  visible: MockReport[];
  selected: MockReport | undefined;
  onSelect: (id: string) => void;
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
              tab === "review"
                ? () => alert(`Quick approve ${r.childName} (Phase 3 wires this)`)
                : undefined
            }
          />
        ))}
      </div>
    </aside>
  );
}
