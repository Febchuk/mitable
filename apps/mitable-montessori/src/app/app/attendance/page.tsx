"use client";

import * as React from "react";
import { DAYS, findChild, initialsFor, type AttendanceMark } from "@/components/montessori/data";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar, HandCheck } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";

function Cell({ s, onClick }: { s: AttendanceMark; onClick?: () => void }) {
  let inner: React.ReactNode;
  if (s === "p") {
    inner = (
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "var(--color-sage-soft)",
          color: "var(--color-sage-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <HandCheck color="var(--color-sage-deep)" size={14} />
      </div>
    );
  } else if (s === "a") {
    inner = (
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "var(--color-clay-soft)",
          color: "var(--color-terracotta-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        A
      </div>
    );
  } else if (s === "t") {
    inner = (
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "var(--color-terracotta-soft)",
          color: "var(--color-terracotta-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        •
      </div>
    );
  } else {
    inner = (
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: "transparent",
          border: "1px dashed var(--color-border-strong)",
          opacity: 0.5,
        }}
      />
    );
  }
  return onClick ? (
    <button
      type="button"
      className="tap"
      onClick={onClick}
      style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
    >
      {inner}
    </button>
  ) : (
    <>{inner}</>
  );
}

export default function AttendancePage() {
  const store = useMontessori();
  const ids = Object.keys(store.attendance);
  const todayIdx = 4;

  return (
    <div>
      <PageHeader
        overline="Apr 26 — Apr 30"
        title="Attendance"
        subtitle="Click today's cell to cycle status."
      />

      <div
        style={{
          padding: "14px 24px 0",
          display: "flex",
          gap: 18,
          fontSize: 12,
          color: "var(--color-ink-secondary)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Cell s="p" /> <span>Present</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Cell s="a" /> <span>Absent</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Cell s="t" /> <span>Today (open)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Cell s="-" /> <span>Unmarked</span>
        </div>
      </div>

      <div style={{ padding: "14px 24px 60px" }}>
        <div style={{ ...cardStyle, overflow: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `220px repeat(${DAYS.length}, 1fr) 80px`,
              padding: "12px 20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div />
            {DAYS.map((d) => (
              <div
                key={d}
                className="label-cap"
                style={{ color: "var(--color-ink-muted)", textAlign: "center" }}
              >
                {d}
              </div>
            ))}
            <div
              className="label-cap"
              style={{ color: "var(--color-ink-muted)", textAlign: "right" }}
            >
              Present
            </div>
          </div>
          {ids.map((id) => {
            const c = findChild(id);
            if (!c) return null;
            const row = store.attendance[id];
            const presentDays = row.filter((s) => s === "p" || s === "t").length;
            return (
              <div
                key={id}
                style={{
                  display: "grid",
                  gridTemplateColumns: `220px repeat(${DAYS.length}, 1fr) 80px`,
                  alignItems: "center",
                  padding: "10px 20px",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar initials={initialsFor(c.name)} tone={c.tone} size={28} />
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--color-ink)",
                      fontWeight: 500,
                    }}
                  >
                    {c.name}
                  </div>
                </div>
                {row.map((s, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "center" }}>
                    <Cell
                      s={s}
                      onClick={j === todayIdx ? () => store.toggleAttendance(id, j) : undefined}
                    />
                  </div>
                ))}
                <div
                  className="font-numeric"
                  style={{
                    fontSize: 13,
                    color: "var(--color-ink-secondary)",
                    textAlign: "right",
                  }}
                >
                  {presentDays} / 5
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
