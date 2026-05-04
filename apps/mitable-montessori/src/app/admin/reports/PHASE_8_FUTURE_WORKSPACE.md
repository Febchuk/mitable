# Phase 8 admin reports workspace (archived)

Original Phase 8 design: a desktop split-view where admins picked a report
from a left list pane and reviewed it inline in a right detail pane, with a
collapsible chat rail and a mobile back-to-list flow. Replaced during the
main-rebase with a plainer mirror of the teacher reports list (see
`./page.tsx`), because the workspace depended on a mock-data `ReportDetail`
API that PR #268 superseded with Supabase reads.

When we revisit this:

1. Extend the current Supabase-backed `ReportDetail` to accept embed-mode
   props (`reportsListHref`, `embedSidebarMode`, `onBackToList`) and a
   collapsible chat rail — OR have the workspace fetch the selected report
   itself and pass `report={ReportDetailRow}` down so embed-only props can
   live in a thin wrapper.
2. Drop the in-memory store dependency (`useMontessori().reports`) — the
   workspace should read from `listReports()` like everything else now does.
3. Point `/admin/reports` and `/admin/reports/[id]` at the workspace component
   instead of the shared `ReportsListView`.

Full original code (including the Phase 8 `ReportDetail` modifications,
chat-pane API, mock data revival in `data.ts`, and CSS deltas) lives at git
ref `49505b8f` and on the `backup/phase-8-pre-rebase` branch. Delete that
backup once nothing else needs it.

---

## `admin-reports-workspace.tsx`

```tsx
"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { findChild, type Report, type ReportStatus } from "@/components/montessori/data";
import { ReportDetail } from "@/components/montessori/report-detail";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { useMontessori } from "@/components/montessori/store";
import "./admin-reports.css";

function pickDefaultReportId(reports: Report[]): string | null {
  const demo = reports.find((r) => r.id === "r3");
  if (demo) return demo.id;
  const withDetail = reports.find((r) => r.detail);
  return withDetail?.id ?? reports[0]?.id ?? null;
}

function sortReportsForAdmin(reports: Report[]): Report[] {
  const rank = (s: ReportStatus) => (s === "review" ? 0 : s === "draft" ? 1 : 2);
  return [...reports].sort((a, b) => {
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return `${a.when} ${a.period}`.localeCompare(`${b.when} ${b.period}`);
  });
}

function sidebarStatusLabel(status: ReportStatus): string {
  switch (status) {
    case "review":
      return "Pending review";
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    default:
      return status;
  }
}

function useWideScreen() {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const fn = () => setWide(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return wide;
}

export function AdminReportsWorkspace({ initialReportId }: { initialReportId?: string }) {
  const store = useMontessori();
  const wide = useWideScreen();
  const [selectedId, setSelectedId] = React.useState<string | null>(() => initialReportId ?? null);
  const [mobileShowList, setMobileShowList] = React.useState(() => !initialReportId);

  React.useEffect(() => {
    if (initialReportId) {
      setSelectedId(initialReportId);
      setMobileShowList(false);
    }
  }, [initialReportId]);

  React.useEffect(() => {
    if (initialReportId) return;
    setSelectedId((cur) => cur ?? pickDefaultReportId(store.reports));
  }, [initialReportId, store.reports]);

  const sorted = React.useMemo(() => sortReportsForAdmin(store.reports), [store.reports]);

  const reviewCount = sorted.filter((r) => r.status === "review").length;
  const draftCount = sorted.filter((r) => r.status === "draft").length;
  const sentCount = sorted.filter((r) => r.status === "sent").length;

  const showListPane = wide || mobileShowList;
  const showDetailPane = wide || !mobileShowList;

  return (
    <div className="admin-reports-page">
      <PageHeader
        title="Reports"
        subtitle={`${reviewCount} awaiting review · ${draftCount} drafts · ${sentCount} sent`}
      />

      <div className="admin-reports-grid">
        {showListPane ? (
          <aside className="admin-reports-list-card" style={cardStyle} aria-label="Reports list">
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                Reports
              </div>
            </div>
            <div className="admin-reports-list-scroll scroll-quiet">
              {sorted.map((r, index) => {
                const child = findChild(r.childId);
                const title = child?.name ?? "Unknown child";
                const subtitle = `${r.when} · ${sidebarStatusLabel(r.status)}`;
                const active = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="tap"
                    onClick={() => {
                      setSelectedId(r.id);
                      if (!wide) setMobileShowList(false);
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      border: 0,
                      borderTop: index ? "1px solid var(--color-border)" : 0,
                      background: active ? "var(--color-terracotta-soft)" : "transparent",
                      textAlign: "left",
                      font: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                        {title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-ink-secondary)",
                          marginTop: 2,
                        }}
                      >
                        {subtitle}
                      </div>
                      <div
                        className="label-cap"
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: "var(--color-ink-muted)",
                        }}
                      >
                        {r.kind} · {r.period}
                      </div>
                    </div>
                    <ChevronRight size={15} strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>
          </aside>
        ) : null}

        {showDetailPane ? (
          <section className="admin-reports-detail-card" style={cardStyle}>
            {selectedId ? (
              <ReportDetail
                reportId={selectedId}
                reportsListHref="/admin/reports"
                embedSidebarMode
                onBackToList={wide ? undefined : () => setMobileShowList(true)}
              />
            ) : (
              <div
                style={{
                  padding: 28,
                  textAlign: "center",
                  color: "var(--color-ink-muted)",
                  fontSize: 13,
                }}
              >
                Select a report to review.
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
```

## `admin-reports.css`

```css
/* Admin reports workspace — bound the page to the viewport on desktop so the
   chat pane scrolls inside the section card instead of pushing the page. We
   keep mobile alone (natural scroll + bottom-nav padding). */

.admin-reports-page {
  display: flex;
  flex-direction: column;
}

.admin-reports-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  padding: 20px 24px 64px;
  align-items: stretch;
}

.admin-reports-list-card,
.admin-reports-detail-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.admin-reports-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

@media (min-width: 1024px) {
  /* Force the admin <main> (which is flex:1 in a min-height:100vh parent —
     i.e. it grows with content) to stop scrolling and clip overflow whenever
     this page is mounted. */
  main:has(> .admin-reports-page) {
    padding-bottom: 0 !important;
    height: 100dvh;
    max-height: 100dvh;
    overflow: hidden !important;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  /* Pin the page itself to the viewport so child flex/grid items can use
     min-height: 0 to clamp instead of growing. */
  .admin-reports-page {
    height: 100dvh;
    max-height: 100dvh;
    min-height: 0;
    overflow: hidden;
  }
  .admin-reports-grid {
    flex: 1;
    min-height: 0;
    grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
    padding: 20px 24px 24px;
    overflow: hidden;
  }
}
```

## `[id]/page.tsx`

```tsx
import { AdminReportsWorkspace } from "../admin-reports-workspace";

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminReportsWorkspace initialReportId={id} />;
}
```
