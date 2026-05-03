"use client";

import * as React from "react";
import {
  AXES,
  LEVEL_TONES,
  WHOLE_CHILD_OBSERVATIONS,
  type AxisKey,
  type Level,
} from "../mock-data";
import { SectionHeading } from "../section-heading";
import { AxisDescriptorInline, SpiderHeroCard, SpiderModal } from "./spider";

function LevelTransitionBadge({ from, to }: { from: Level | null; to: Level | null }) {
  if (!from && !to) {
    return (
      <span
        className="label-cap"
        style={{
          color: "var(--color-ink-muted)",
          fontSize: 10,
          padding: "2px 7px",
          borderRadius: 999,
          border: "1px solid var(--color-border)",
          letterSpacing: "0.06em",
        }}
      >
        Confirms current
      </span>
    );
  }
  const tFrom = from ? LEVEL_TONES[from] : null;
  const tTo = to ? LEVEL_TONES[to] : null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      <span style={{ color: tFrom?.deep || "var(--color-ink-muted)" }}>{from}</span>
      <span style={{ color: "var(--color-ink-muted)" }}>→</span>
      <span style={{ color: tTo?.deep || "var(--color-ink)" }}>{to}</span>
    </span>
  );
}

type ObservationsProps = {
  selectedAxis: AxisKey | null;
  onClearAxis: () => void;
  initial?: number;
  pageSize?: number;
};

function WholeChildObservations({
  selectedAxis,
  onClearAxis,
  initial = 5,
  pageSize = 5,
}: ObservationsProps) {
  const all = WHOLE_CHILD_OBSERVATIONS;
  const source = selectedAxis ? all.filter((o) => o.axis === selectedAxis) : all;

  const [shown, setShown] = React.useState(initial);
  React.useEffect(() => {
    setShown(initial);
  }, [selectedAxis, initial]);

  const rows = source.slice(0, shown);
  const axis = selectedAxis ? AXES.find((a) => a.key === selectedAxis) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
            {axis ? `${axis.label} · ${axis.level}` : "All seven dimensions"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>
            {axis ? `Notes that shaped ${axis.label}` : "Notes that shaped this assessment"}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-ink-muted)", marginTop: 2 }}>
            {source.length} of {all.length} {all.length === 1 ? "note" : "notes"}
          </div>
        </div>
        {axis && (
          <button
            type="button"
            className="tap"
            onClick={onClearAxis}
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 999,
              background: "var(--color-canvas)",
              color: "var(--color-ink-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            Clear filter
          </button>
        )}
      </div>

      {selectedAxis && <AxisDescriptorInline axisKey={selectedAxis} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((o) => {
          const obsAxis = AXES.find((a) => a.key === o.axis);
          return (
            <div
              key={o.id}
              style={{
                background: "var(--color-canvas)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 6,
                  flexWrap: "wrap",
                }}
              >
                <span className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                  {obsAxis?.label || o.axis}
                </span>
                <span
                  className="font-numeric"
                  style={{ fontSize: 11, color: "var(--color-ink-muted)" }}
                  title={o.abs}
                >
                  {o.rel}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--color-ink)", lineHeight: 1.45 }}>
                {o.note}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <LevelTransitionBadge from={o.from} to={o.to} />
                <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{o.author}</span>
              </div>
            </div>
          );
        })}
      </div>

      {shown < source.length && (
        <button
          type="button"
          className="tap"
          onClick={() => setShown((n) => Math.min(source.length, n + pageSize))}
          style={{
            padding: "10px 14px",
            background: "var(--color-canvas)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-ink-secondary)",
          }}
        >
          Load {Math.min(pageSize, source.length - shown)} more
        </button>
      )}
      {source.length === 0 && (
        <div
          style={{
            padding: "20px 0",
            fontSize: 13,
            color: "var(--color-ink-muted)",
            fontStyle: "italic",
            textAlign: "center",
          }}
        >
          No notes for {axis?.label || "this axis"} yet.
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(42,39,35,0.04)",
};

export function WholeChildView({ mobile }: { mobile: boolean }) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedAxis, setSelectedAxis] = React.useState<AxisKey | null>(null);

  return (
    <>
      <SectionHeading
        overline="Whole-child assessment"
        title="Seven dimensions"
        accent={mobile ? "how Ada is becoming" : "how Ada is becoming herself"}
        mobile={mobile}
      />

      <div style={{ padding: mobile ? "8px 16px 36px" : "10px 28px 60px" }}>
        {mobile ? (
          <>
            <div style={{ ...cardStyle, padding: 16 }}>
              <SpiderHeroCard
                mobile
                size={300}
                selectedAxis={selectedAxis}
                onSelectAxis={setSelectedAxis}
                onExpand={() => setModalOpen(true)}
                showExpand
              />
            </div>
            <div style={{ ...cardStyle, padding: 16, marginTop: 14 }}>
              <WholeChildObservations
                selectedAxis={selectedAxis}
                onClearAxis={() => setSelectedAxis(null)}
              />
            </div>
          </>
        ) : (
          <div
            style={{
              ...cardStyle,
              padding: 22,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, 1fr)",
              gap: 28,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <SpiderHeroCard
                mobile={false}
                size={520}
                selectedAxis={selectedAxis}
                onSelectAxis={setSelectedAxis}
                onExpand={() => setModalOpen(true)}
                showExpand
              />
            </div>
            <div
              style={{
                borderLeft: "1px solid var(--color-border)",
                paddingLeft: 28,
                minWidth: 0,
              }}
            >
              <WholeChildObservations
                selectedAxis={selectedAxis}
                onClearAxis={() => setSelectedAxis(null)}
              />
            </div>
          </div>
        )}
      </div>

      <SpiderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mobile={mobile}
        selectedAxis={selectedAxis}
        onSelectAxis={setSelectedAxis}
      />
    </>
  );
}
