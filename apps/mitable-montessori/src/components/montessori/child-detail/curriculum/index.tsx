"use client";

import * as React from "react";
import {
  AREAS,
  SUBTOPICS,
  TIMELINE,
  stateMeta,
  type AreaName,
  type Subtopic,
  type SubtopicState,
} from "../mock-data";
import { SectionHeading } from "../section-heading";

const AREA_LIST: AreaName[] = ["Sensorial", "Math", "Language", "Practical Life", "Cultural"];

type StepLabel = { key: SubtopicState; label: string; date: string | null };

function StepDiagramHorizontal({
  labels,
  currentIdx,
}: {
  labels: StepLabel[];
  currentIdx: number;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {labels.map((l, i) => {
          const isFilled = i <= currentIdx;
          const stateAttr = isFilled ? `filled-${l.key}` : "";
          return (
            <React.Fragment key={l.key}>
              <span className="step-pill" data-state={stateAttr} data-current={i === currentIdx}>
                <span
                  className="legend-dot"
                  style={{
                    background: isFilled ? stateMeta[l.key].tone : "var(--color-border-strong)",
                    opacity: isFilled ? 1 : 0.5,
                  }}
                />
                {l.label}
              </span>
              {i < labels.length - 1 && (
                <div style={{ flex: 1, position: "relative", height: 24 }}>
                  <div
                    className="step-track"
                    data-filled={i < currentIdx ? "full" : i === currentIdx ? "true" : "false"}
                    style={{ position: "absolute", top: 11, left: 0, right: 0 }}
                  />
                  <span className="step-date">{labels[i + 1].date || "—"}</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 28,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--color-ink-muted)",
        }}
      >
        <span>Started {labels[0].date || "—"}</span>
        <span>
          {currentIdx === 2 ? "Mastered" : `Next: ${labels[currentIdx + 1]?.label || "—"}`}
        </span>
      </div>
    </div>
  );
}

function StepDiagramVertical({ labels, currentIdx }: { labels: StepLabel[]; currentIdx: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {labels.map((l, i) => {
        const isFilled = i <= currentIdx;
        const stateAttr = isFilled ? `filled-${l.key}` : "";
        return (
          <React.Fragment key={l.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                className="step-pill"
                data-state={stateAttr}
                data-current={i === currentIdx}
                style={{ minWidth: 134 }}
              >
                <span
                  className="legend-dot"
                  style={{
                    background: isFilled ? stateMeta[l.key].tone : "var(--color-border-strong)",
                    opacity: isFilled ? 1 : 0.5,
                  }}
                />
                {l.label}
              </span>
              <span
                className="font-numeric"
                style={{ fontSize: 12, color: "var(--color-ink-muted)" }}
              >
                {l.date || "—"}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div
                style={{
                  marginLeft: 18,
                  height: 18,
                  width: 2,
                  background: i < currentIdx ? stateMeta[l.key].tone : "var(--color-border)",
                  opacity: i < currentIdx ? 0.7 : 1,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function TopicPicker({
  value,
  onChange,
  mobile,
}: {
  value: AreaName;
  onChange: (a: AreaName) => void;
  mobile: boolean;
}) {
  const list = AREA_LIST.filter((area) => SUBTOPICS.some((s) => s.area === area));
  const inner = list.map((area) => {
    const active = value === area;
    return (
      <button
        key={area}
        type="button"
        className={mobile ? "subtopic-chip tap" : "tap"}
        data-active={mobile ? active : undefined}
        onClick={() => onChange(area)}
        style={
          mobile
            ? undefined
            : {
                padding: "9px 16px",
                borderRadius: 999,
                background: active ? "var(--color-ink)" : "var(--color-surface)",
                color: active ? "var(--color-surface)" : "var(--color-ink)",
                border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-border)",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }
        }
      >
        {area}
      </button>
    );
  });

  if (mobile) {
    return (
      <div className="subtopic-strip" style={{ paddingBottom: 4 }}>
        {inner}
      </div>
    );
  }
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{inner}</div>;
}

function SubtopicPicker({
  area,
  value,
  onChange,
  mobile,
}: {
  area: AreaName;
  value: string | null;
  onChange: (name: string) => void;
  mobile: boolean;
}) {
  const subs = SUBTOPICS.filter((s) => s.area === area);
  const inner = subs.map((s) => {
    const active = value === s.name;
    return (
      <button
        key={s.name}
        type="button"
        className="subtopic-chip tap"
        data-active={active}
        onClick={() => onChange(s.name)}
      >
        {s.name}
      </button>
    );
  });
  if (mobile) {
    return (
      <div className="subtopic-strip" style={{ paddingBottom: 4 }}>
        {inner}
      </div>
    );
  }
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{inner}</div>;
}

function SubtopicDetail({ subtopicName, mobile }: { subtopicName: string; mobile: boolean }) {
  const sub = SUBTOPICS.find((s) => s.name === subtopicName) as Subtopic | undefined;
  const initial = 5;
  const [shown, setShown] = React.useState(initial);
  React.useEffect(() => {
    setShown(initial);
  }, [subtopicName]);

  if (!sub) return null;

  const all = TIMELINE.filter((t) => t.material === sub.name);
  const rows = all.slice(0, shown);
  const stateOrder: SubtopicState[] = ["i", "p", "m"];
  const currentIdx = stateOrder.indexOf(sub.state);
  const stepLabels: StepLabel[] = [
    { key: "i", label: "Introduced", date: sub.introduced },
    { key: "p", label: "Practicing", date: sub.practicing },
    { key: "m", label: "Mastered", date: sub.mastered },
  ];

  return (
    <div
      key={subtopicName}
      className="anim-slide-up"
      style={{
        marginTop: 18,
        padding: mobile ? "16px" : "18px 20px",
        background: "var(--color-canvas)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: mobile ? 18 : 22,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--color-ink)",
              lineHeight: 1.15,
            }}
          >
            {sub.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-ink-muted)",
              marginTop: 4,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span
              className="legend-dot"
              style={{ width: 7, height: 7, background: AREAS[sub.area].tone }}
            />
            {sub.area}
          </div>
        </div>
      </div>

      {mobile ? (
        <StepDiagramVertical labels={stepLabels} currentIdx={currentIdx} />
      ) : (
        <StepDiagramHorizontal labels={stepLabels} currentIdx={currentIdx} />
      )}

      <div style={{ marginTop: 24 }}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}>
          Activities for {sub.name}
        </div>
        {all.length === 0 && (
          <div
            style={{
              fontSize: 12.5,
              color: "var(--color-ink-muted)",
              fontStyle: "italic",
              padding: "10px 0",
            }}
          >
            No observations yet for this subtopic.
          </div>
        )}
        {rows.map((row, i) => {
          const transitionKey = row.transition
            ? (row.transition.to.toLowerCase()[0] as SubtopicState)
            : null;
          const transitionMeta = transitionKey ? stateMeta[transitionKey] : null;
          return (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: mobile ? "auto 1fr" : "70px 1fr auto",
                gap: 12,
                padding: "10px 0",
                borderTop: i ? "1px solid var(--color-border)" : "0",
                alignItems: "flex-start",
              }}
            >
              <div
                className="font-numeric"
                style={{
                  fontSize: 12,
                  color: "var(--color-ink-muted)",
                  minWidth: mobile ? 56 : "auto",
                }}
              >
                {row.date}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--color-ink-secondary)",
                  lineHeight: 1.45,
                }}
              >
                {row.comment}
                {row.transition && transitionMeta && (
                  <span
                    style={{
                      display: "inline-block",
                      marginLeft: mobile ? 0 : 8,
                      marginTop: mobile ? 6 : 0,
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
              {!mobile && (
                <div
                  className="font-numeric"
                  style={{
                    fontSize: 11.5,
                    color: "var(--color-ink-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.rel}
                </div>
              )}
            </div>
          );
        })}

        {shown < all.length && (
          <button
            type="button"
            className="tap"
            onClick={() => setShown((n) => Math.min(all.length, n + initial))}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "9px 14px",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--color-ink-secondary)",
            }}
          >
            Load {Math.min(initial, all.length - shown)} more
          </button>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(42,39,35,0.04)",
};

export function CurriculumView({ mobile }: { mobile: boolean }) {
  const defaultArea = (AREA_LIST.find((a) => SUBTOPICS.some((s) => s.area === a)) ||
    "Sensorial") as AreaName;
  const [area, setArea] = React.useState<AreaName>(defaultArea);
  const [subtopic, setSubtopic] = React.useState<string | null>(
    SUBTOPICS.find((s) => s.area === defaultArea)?.name || null
  );
  React.useEffect(() => {
    const firstInArea = SUBTOPICS.find((s) => s.area === area);
    setSubtopic(firstInArea?.name || null);
  }, [area]);

  return (
    <>
      <SectionHeading overline="Curriculum progress" title="Subtopic mastery" mobile={mobile} />
      <div style={{ padding: mobile ? "8px 16px 36px" : "10px 28px 60px" }}>
        <div style={{ ...cardStyle, padding: mobile ? 16 : 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div
              className="label-cap"
              style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}
            >
              Topics
            </div>
            <TopicPicker value={area} onChange={setArea} mobile={mobile} />
          </div>

          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
            <div
              className="label-cap"
              style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}
            >
              Subtopics
            </div>
            <SubtopicPicker area={area} value={subtopic} onChange={setSubtopic} mobile={mobile} />
          </div>

          {subtopic && <SubtopicDetail subtopicName={subtopic} mobile={mobile} />}
        </div>
      </div>
    </>
  );
}
