"use client";

import * as React from "react";
import { SUBTOPICS, findChild, initialsFor, type ProgressMark } from "@/components/montessori/data";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";

const DOT_TONES: Record<ProgressMark, { bg: string; ring: string }> = {
  m: { bg: "var(--color-sage)", ring: "var(--color-sage-soft)" },
  p: { bg: "var(--color-butter)", ring: "var(--color-butter-soft)" },
  i: { bg: "var(--color-clay)", ring: "var(--color-clay-soft)" },
  "-": { bg: "transparent", ring: "var(--color-border)" },
};

function Dot({ s }: { s: ProgressMark }) {
  const t = DOT_TONES[s];
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        background: t.bg,
        border: `2px solid ${t.ring}`,
        transition: "all 240ms ease",
      }}
    />
  );
}

export default function ProgressPage() {
  const store = useMontessori();
  const ids = Object.keys(store.progress);

  return (
    <div>
      <PageHeader
        overline="Sensorial · last 30 days"
        title="Progress"
        subtitle={`${ids.length} children · ${SUBTOPICS.length} subtopics`}
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
        {(
          [
            { s: "m", l: "Mastered" },
            { s: "p", l: "Practicing" },
            { s: "i", l: "Introduced" },
            { s: "-", l: "Not started" },
          ] as Array<{ s: ProgressMark; l: string }>
        ).map((d) => (
          <div key={d.s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot s={d.s} /> <span>{d.l}</span>
          </div>
        ))}
      </div>

      {/* Desktop matrix */}
      <div className="hidden lg:block" style={{ padding: "14px 24px 60px" }}>
        <div style={{ ...cardStyle, overflow: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `200px repeat(${SUBTOPICS.length}, 1fr)`,
              alignItems: "end",
              padding: "10px 18px 8px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div />
            {SUBTOPICS.map((s) => (
              <div
                key={s}
                style={{
                  fontSize: 10.5,
                  color: "var(--color-ink-secondary)",
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  padding: "0 0 4px",
                  height: 96,
                  lineHeight: 1.1,
                  fontWeight: 500,
                }}
              >
                {s}
              </div>
            ))}
          </div>
          {ids.map((id, i) => {
            const c = findChild(id);
            if (!c) return null;
            return (
              <div
                key={id}
                style={{
                  display: "grid",
                  gridTemplateColumns: `200px repeat(${SUBTOPICS.length}, 1fr)`,
                  alignItems: "center",
                  padding: "8px 18px",
                  borderTop: i ? "1px solid var(--color-border)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar initials={initialsFor(c.name)} tone={c.tone} size={26} />
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
                {store.progress[id].map((s, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "center" }}>
                    <Dot s={s} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile matrix — first 7 subtopics */}
      <div className="lg:hidden" style={{ padding: "14px 16px 60px" }}>
        <div style={{ ...cardStyle, overflow: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "54px repeat(7, 1fr)",
              alignItems: "end",
              padding: "10px 8px 8px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div />
            {SUBTOPICS.slice(0, 7).map((s) => (
              <div
                key={s}
                style={{
                  fontSize: 10,
                  color: "var(--color-ink-secondary)",
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  padding: "0 0 6px",
                  height: 96,
                  lineHeight: 1.1,
                  fontWeight: 500,
                }}
              >
                {s}
              </div>
            ))}
          </div>
          {ids.map((id, i) => {
            const c = findChild(id);
            if (!c) return null;
            return (
              <div
                key={id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "54px repeat(7, 1fr)",
                  alignItems: "center",
                  padding: "8px 8px",
                  borderTop: i ? "1px solid var(--color-border)" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Avatar initials={initialsFor(c.name)} tone={c.tone} size={28} />
                </div>
                {store.progress[id].slice(0, 7).map((s, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "center" }}>
                    <Dot s={s} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
