"use client";

import * as React from "react";
import { AREAS, TIMELINE, stateMeta, type ActivityEntry, type SubtopicState } from "../mock-data";
import { SectionHeading } from "../section-heading";

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(42,39,35,0.04)",
};

type ObservationsProps = {
  mobile: boolean;
  headerLabel?: string;
  headerTitle?: string;
  initial?: number;
  pageSize?: number;
  source?: ActivityEntry[];
};

export function RecentObservations({
  mobile,
  headerLabel = "Activity feed",
  headerTitle = "What Ada has worked with",
  initial = 5,
  pageSize = 5,
  source = TIMELINE,
}: ObservationsProps) {
  const [shown, setShown] = React.useState(initial);
  React.useEffect(() => {
    setShown(initial);
  }, [source, initial]);
  const rows = source.slice(0, shown);

  return (
    <div style={{ ...cardStyle, padding: mobile ? 16 : 22 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
            {headerLabel}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-ink)" }}>
            {headerTitle}
          </div>
          {source !== TIMELINE && (
            <div style={{ fontSize: 12, color: "var(--color-ink-muted)", marginTop: 2 }}>
              {source.length} of {TIMELINE.length} entries
            </div>
          )}
        </div>
      </div>

      <div
        className={mobile ? undefined : "timeline-rail"}
        style={mobile ? { display: "flex", flexDirection: "column", gap: 10 } : undefined}
      >
        {rows.map((row) => {
          const transitionKey = row.transition
            ? (row.transition.to.toLowerCase()[0] as SubtopicState)
            : null;
          const transitionMeta = transitionKey ? stateMeta[transitionKey] : null;

          return mobile ? (
            <div
              key={row.id}
              style={{
                background: "var(--color-canvas)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <span
                className="legend-dot"
                style={{
                  width: 9,
                  height: 9,
                  background: AREAS[row.area].tone,
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "var(--color-ink)" }}>
                  Ada did <strong style={{ fontWeight: 600 }}>{row.material}</strong>
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--color-ink-secondary)",
                    marginTop: 3,
                    lineHeight: 1.4,
                  }}
                >
                  {row.comment}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-ink-muted)",
                    marginTop: 6,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span>{row.area}</span>
                  <span className="dot-sep" />
                  <span className="font-numeric">{row.date}</span>
                </div>
              </div>
            </div>
          ) : (
            <div key={row.id} className="timeline-row">
              <div className="timeline-dot-wrap">
                <span
                  className="timeline-dot"
                  style={{ background: AREAS[row.area].tone }}
                  title={row.area}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, color: "var(--color-ink)" }}>
                  Ada did <strong style={{ fontWeight: 600 }}>{row.material}</strong>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      color: "var(--color-ink-muted)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {row.area}
                  </span>
                </div>
                {row.comment && (
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--color-ink-secondary)",
                      marginTop: 3,
                      lineHeight: 1.45,
                      maxWidth: 560,
                    }}
                  >
                    {row.comment}
                  </div>
                )}
                {row.transition && transitionMeta && (
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      fontSize: 10.5,
                      fontWeight: 500,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: 999,
                      color: transitionMeta.deep,
                      background: transitionMeta.soft,
                      border: `1px solid ${transitionMeta.tone}`,
                    }}
                  >
                    → {row.transition.to}
                  </span>
                )}
              </div>
              <div
                title={row.abs}
                className="font-numeric"
                style={{ fontSize: 12, color: "var(--color-ink-muted)", whiteSpace: "nowrap" }}
              >
                {row.rel}
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
            marginTop: 14,
            width: "100%",
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
      {shown > initial && shown >= source.length && source.length > initial && (
        <button
          type="button"
          className="tap"
          onClick={() => setShown(initial)}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "10px 14px",
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-ink-muted)",
          }}
        >
          Show fewer
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
          No observations match this axis yet.
        </div>
      )}
    </div>
  );
}

export function ActivityView({ mobile }: { mobile: boolean }) {
  return (
    <>
      <SectionHeading
        overline="Activity"
        title="All observations"
        accent={mobile ? undefined : "every material, every cycle"}
        mobile={mobile}
      />
      <div style={{ padding: mobile ? "8px 16px 36px" : "10px 28px 60px" }}>
        <RecentObservations
          mobile={mobile}
          source={TIMELINE}
          headerLabel="Activity feed"
          headerTitle="What Ada has worked with"
          initial={5}
          pageSize={5}
        />
      </div>
    </>
  );
}
