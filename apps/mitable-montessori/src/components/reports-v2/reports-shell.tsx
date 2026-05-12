"use client";

import { useState } from "react";
import type { MockReport, V2Tab } from "./mock-data";
import { tabCounts } from "./mock-data";

type Variant = "teacher" | "admin";

/**
 * Phase 0 stub. Phase 1 replaces this with the full list-rail + reading-pane
 * + chat-rail layout from `_design/reports-review-prototype.html`.
 *
 * Until then it just confirms the route is wired, the feature flag gates it,
 * and fixtures load. Open with NEXT_PUBLIC_FF_REPORTS_V2=1 set.
 */
export function ReportsV2Shell({ reports, variant }: { reports: MockReport[]; variant: Variant }) {
  const [tab, setTab] = useState<V2Tab>("drafts");
  const counts = tabCounts(reports);
  const visible = reports.filter((r) => r.tab === tab);

  return (
    <div
      style={{
        padding: "32px 24px",
        maxWidth: 1200,
        margin: "0 auto",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        color: "var(--color-ink)",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-ink-muted)",
            fontWeight: 600,
          }}
        >
          Reports · v2 preview · {variant}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-caveat)",
            fontSize: 38,
            margin: "4px 0 6px",
            fontWeight: 500,
          }}
        >
          Reports — Review redesign
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-secondary)" }}>
          Phase 0 stub. The full layout shell ships in Phase 1.
        </p>
      </header>

      <nav
        style={{
          display: "inline-flex",
          gap: 4,
          padding: 4,
          background: "var(--color-muted)",
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        {(["drafts", "review", "approved", "sent"] as V2Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "6px 13px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: t === tab ? "var(--color-surface)" : "transparent",
              color: t === tab ? "var(--color-ink)" : "var(--color-ink-secondary)",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            {t === "drafts"
              ? "Drafts"
              : t === "review"
                ? "In Review"
                : t === "approved"
                  ? "Approved"
                  : "Sent"}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "1px 7px",
                borderRadius: 999,
                background: t === tab ? "var(--color-terracotta)" : "var(--color-surface)",
                color: t === tab ? "#fff" : "var(--color-ink-secondary)",
                border: t === tab ? "none" : "1px solid var(--color-border)",
              }}
            >
              {counts[t]}
            </span>
          </button>
        ))}
      </nav>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {visible.map((r) => (
          <li
            key={r.id}
            style={{
              padding: "12px 14px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <strong>{r.childName}</strong>
              <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                · {r.reportType} · {r.title}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background:
                    r.aiScore >= 85
                      ? "var(--color-sage-soft)"
                      : r.aiScore >= 60
                        ? "var(--color-butter-soft)"
                        : "var(--color-terracotta-soft)",
                  color:
                    r.aiScore >= 85
                      ? "var(--color-sage-deep)"
                      : r.aiScore >= 60
                        ? "var(--color-butter-deep)"
                        : "var(--color-terracotta-deep)",
                }}
              >
                {r.aiScore}
              </span>
            </div>
            <div style={{ marginTop: 4, color: "var(--color-ink-secondary)", fontSize: 12 }}>
              {r.summary}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
