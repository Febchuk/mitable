"use client";

import * as React from "react";
import { ChevronRight, Search } from "lucide-react";
import { CHILDREN, initialsFor } from "@/components/montessori/data";
import { FilterChips, PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";

const FILTERS = ["All", "Present today", "Reports due this week", "New this term"];

export default function RosterPage() {
  const store = useMontessori();
  const list = CHILDREN.filter((c) => {
    if (store.rosterFilter === "Present today") return c.present;
    if (store.rosterFilter === "Reports due this week")
      return store.reports.some((r) => r.childId === c.id && r.status !== "sent");
    if (store.rosterFilter === "New this term")
      return /2026/.test(c.enrolled) || /2025/.test(c.enrolled);
    return true;
  });

  return (
    <div>
      <PageHeader
        overline={`Primrose Room · ${CHILDREN.length} children`}
        title="Roster"
        actions={
          <button
            type="button"
            className="tap"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-ink-secondary)",
            }}
          >
            <Search size={18} strokeWidth={1.5} />
          </button>
        }
      />
      <div style={{ padding: "16px 24px 0" }}>
        <FilterChips
          options={FILTERS}
          value={store.rosterFilter}
          onChange={store.setRosterFilter}
        />
      </div>
      <div style={{ padding: "16px 24px 60px" }}>
        {/* Desktop table */}
        <div className="hidden lg:block" style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 0.6fr 0.8fr 1.2fr 0.8fr 24px",
              padding: "12px 20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            {["Child", "Age", "Enrolled", "Latest observation", "Family", ""].map((h) => (
              <div key={h} className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                {h}
              </div>
            ))}
          </div>
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              className="tap"
              onClick={() => store.setSelectedChild(c.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 0.6fr 0.8fr 1.2fr 0.8fr 24px",
                alignItems: "center",
                padding: "12px 20px",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: 0,
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar initials={initialsFor(c.name)} tone={c.tone} size={34} />
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)" }}>
                  {c.name}
                </div>
              </div>
              <div
                className="font-numeric"
                style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}
              >
                {c.age}
              </div>
              <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{c.enrolled}</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{c.recent}</div>
              <div style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>{c.guardian}</div>
              <ChevronRight size={14} strokeWidth={1.5} />
            </button>
          ))}
        </div>

        {/* Mobile list */}
        <div className="lg:hidden" style={cardStyle}>
          {list.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className="tap"
              onClick={() => store.setSelectedChild(c.id)}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                background: "transparent",
                border: 0,
                borderTop: i ? "1px solid var(--color-border)" : "0",
              }}
            >
              <Avatar initials={initialsFor(c.name)} tone={c.tone} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: "var(--color-ink)",
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-ink-secondary)",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.recent}
                </div>
              </div>
              <div
                className="font-numeric"
                style={{ fontSize: 12, color: "var(--color-ink-muted)" }}
              >
                {c.age}
              </div>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          ))}
          {list.length === 0 && (
            <div
              style={{
                padding: 20,
                fontSize: 13,
                color: "var(--color-ink-muted)",
                textAlign: "center",
              }}
            >
              No children match.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
