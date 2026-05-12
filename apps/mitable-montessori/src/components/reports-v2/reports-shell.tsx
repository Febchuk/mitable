"use client";

import { useMemo, useState } from "react";
import type { MockReport, V2Tab } from "./mock-data";
import { tabCounts } from "./mock-data";
import { useLocalStorageString } from "./use-local-storage";
import { ListRow } from "./list-row";
import { ReadingPane } from "./reading-pane";
import { ChatRail } from "./chat-rail";
import { SendForReviewDrawer, SendForReviewMobileSheet } from "./send-for-review";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

type Variant = "teacher" | "admin";
type Layout = "A" | "C";

const isLayout = (raw: string): raw is Layout => raw === "A" || raw === "C";

const TABS: { id: V2Tab; label: string; sub: string }[] = [
  { id: "drafts", label: "Drafts", sub: "ready to send" },
  { id: "review", label: "In Review", sub: "waiting on reviewers" },
  { id: "approved", label: "Approved", sub: "cleared to send to parents" },
  { id: "sent", label: "Sent", sub: "delivered this week" },
];

export function ReportsV2Shell({ reports, variant }: { reports: MockReport[]; variant: Variant }) {
  const isAdmin = variant === "admin";
  const [tab, setTab] = useState<V2Tab>("drafts");
  const [layout, setLayout] = useLocalStorageString<Layout>(
    "mitable.reports-v2.layout",
    "A",
    isLayout
  );
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sendDrawerOpen, setSendDrawerOpen] = useState(false);
  const [sendSheetOpen, setSendSheetOpen] = useState(false);

  const counts = tabCounts(reports);
  const visible = useMemo(() => reports.filter((r) => r.tab === tab), [reports, tab]);
  const selected = useMemo(
    () => visible.find((r) => r.id === selectedId) ?? visible[0],
    [visible, selectedId]
  );

  return (
    <div className={styles.shell}>
      {/* Top bar */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.titleLine}>
            <h1>Reports</h1>
            {isAdmin && <span className={styles.adminBadge}>Admin</span>}
            <span style={{ fontSize: 10.5, color: "var(--color-ink-muted)" }}>· v2 preview</span>
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
          <div className={styles.layoutToggle} title="Toggle layout">
            <button
              type="button"
              className={layout === "A" ? styles.toggleActive : ""}
              onClick={() => setLayout("A")}
            >
              A
            </button>
            <button
              type="button"
              className={layout === "C" ? styles.toggleActive : ""}
              onClick={() => setLayout("C")}
            >
              C
            </button>
          </div>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`}>
            <Icon.Plus size={13} /> New report
          </button>
        </div>
      </header>

      {/* Work area */}
      <div className={styles.workArea}>
        {layout === "A" ? (
          <div className={styles.layoutA}>
            <ListColumn
              tab={tab}
              counts={counts}
              visible={visible}
              selected={selected}
              onSelect={setSelectedId}
            />
            <div style={{ position: "relative", minWidth: 0 }}>
              {selected && (
                <ReadingPane
                  report={selected}
                  tab={tab}
                  isAdmin={isAdmin}
                  embeddedPaneTabs
                  onSendForReview={() => setSendDrawerOpen(true)}
                  onApprove={() => alert("Approve (Phase 3 wires this)")}
                  onOverrideApprove={() => alert("Admin override (Phase 5)")}
                  onRequestChanges={() => alert("Request changes (Phase 3)")}
                  onComment={() => alert("Comment (Phase 3)")}
                  onSendNow={() => alert("Send now (Phase 5)")}
                />
              )}
              {sendDrawerOpen && selected && (
                <SendForReviewDrawer report={selected} onClose={() => setSendDrawerOpen(false)} />
              )}
            </div>
          </div>
        ) : (
          <div className={styles.layoutC} data-chat-collapsed={chatCollapsed ? "true" : "false"}>
            <ListColumn
              tab={tab}
              counts={counts}
              visible={visible}
              selected={selected}
              onSelect={setSelectedId}
              compact
            />
            <div style={{ position: "relative", minWidth: 0 }}>
              {selected && (
                <ReadingPane
                  report={selected}
                  tab={tab}
                  isAdmin={isAdmin}
                  embeddedPaneTabs={false}
                  onSendForReview={() => setSendDrawerOpen(true)}
                  onApprove={() => alert("Approve (Phase 3 wires this)")}
                  onOverrideApprove={() => alert("Admin override (Phase 5)")}
                  onRequestChanges={() => alert("Request changes (Phase 3)")}
                  onComment={() => alert("Comment (Phase 3)")}
                  onSendNow={() => alert("Send now (Phase 5)")}
                />
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
        )}
      </div>

      {sendSheetOpen && selected && (
        <SendForReviewMobileSheet report={selected} onClose={() => setSendSheetOpen(false)} />
      )}
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
