"use client";

import * as React from "react";
import { AREAS, stateMeta, type AreaName, type SubtopicState } from "../mock-data";
import { SectionHeading } from "../section-heading";
import type {
  CurriculumByTopic,
  CurriculumStatus,
  SubtopicProgress,
} from "@/lib/queries/curriculum";

type StepLabel = { key: SubtopicState; label: string; date: string | null };

const STATUS_TO_STATE: Record<CurriculumStatus, SubtopicState | null> = {
  introduced: "i",
  practicing: "p",
  mastered: "m",
  na: null,
};

const DEFAULT_AREA_TONE = { tone: "var(--color-clay)", soft: "var(--color-clay-soft)" };

function areaToneFor(topicName: string) {
  // Topic names from seed match the prototype's 5 areas; fall back gracefully.
  return AREAS[topicName as AreaName] ?? DEFAULT_AREA_TONE;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

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
  topics,
  value,
  onChange,
  mobile,
}: {
  topics: CurriculumByTopic[];
  value: string;
  onChange: (id: string) => void;
  mobile: boolean;
}) {
  const inner = topics.map((t) => {
    const active = value === t.topicId;
    return (
      <button
        key={t.topicId}
        type="button"
        className={mobile ? "subtopic-chip tap" : "tap"}
        data-active={mobile ? active : undefined}
        onClick={() => onChange(t.topicId)}
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
        {t.topicName}
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
  subtopics,
  value,
  onChange,
  mobile,
}: {
  subtopics: SubtopicProgress[];
  value: string | null;
  onChange: (id: string) => void;
  mobile: boolean;
}) {
  const inner = subtopics.map((s) => {
    const active = value === s.subtopicId;
    const stateKey = STATUS_TO_STATE[s.status];
    return (
      <button
        key={s.subtopicId}
        type="button"
        className="subtopic-chip tap"
        data-active={active}
        onClick={() => onChange(s.subtopicId)}
      >
        {stateKey && (
          <span
            className="subtopic-chip-dot"
            style={{ background: stateMeta[stateKey].tone }}
            aria-hidden
          />
        )}
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

function SubtopicDetail({ sub, mobile }: { sub: SubtopicProgress; mobile: boolean }) {
  const stateKey = STATUS_TO_STATE[sub.status];
  const meta = stateKey ? stateMeta[stateKey] : null;
  const tone = areaToneFor(sub.topicName);
  const stateOrder: SubtopicState[] = ["i", "p", "m"];
  const currentIdx = stateKey ? stateOrder.indexOf(stateKey) : -1;
  const stepLabels: StepLabel[] = [
    { key: "i", label: "Introduced", date: formatDate(sub.introducedAt) },
    { key: "p", label: "Practicing", date: formatDate(sub.practicingAt) },
    { key: "m", label: "Mastered", date: formatDate(sub.masteredAt) },
  ];

  return (
    <div
      key={sub.subtopicId}
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
            <span className="legend-dot" style={{ width: 7, height: 7, background: tone.tone }} />
            {sub.topicName}
          </div>
        </div>
        {meta && (
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              padding: "4px 10px",
              borderRadius: 999,
              background: meta.soft,
              color: meta.deep,
              border: `1px solid ${meta.tone}`,
            }}
          >
            Currently {meta.label}
          </span>
        )}
      </div>

      {mobile ? (
        <StepDiagramVertical labels={stepLabels} currentIdx={currentIdx} />
      ) : (
        <StepDiagramHorizontal labels={stepLabels} currentIdx={currentIdx} />
      )}

      {sub.comment && (
        <div
          style={{
            marginTop: 18,
            fontSize: 13,
            color: "var(--color-ink-secondary)",
            lineHeight: 1.45,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          {sub.comment}
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

function EmptyState({ mobile }: { mobile: boolean }) {
  return (
    <div style={{ ...cardStyle, padding: mobile ? 24 : 36, textAlign: "center" }}>
      <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
        No curriculum progress yet
      </div>
      <div style={{ fontSize: 14, color: "var(--color-ink-secondary)", lineHeight: 1.5 }}>
        Once you record progress on any subtopic, it will show up here organised by topic.
      </div>
    </div>
  );
}

export function CurriculumView({
  mobile,
  topics,
}: {
  mobile: boolean;
  topics: CurriculumByTopic[];
}) {
  const defaultTopicId = topics[0]?.topicId ?? null;
  const [topicId, setTopicId] = React.useState<string | null>(defaultTopicId);
  const activeTopic = topics.find((t) => t.topicId === topicId) ?? topics[0] ?? null;
  const [subtopicId, setSubtopicId] = React.useState<string | null>(
    activeTopic?.subtopics[0]?.subtopicId ?? null
  );
  // Reset to the first subtopic when the user picks a different topic.
  // Only depends on topicId by design — we don't want to reset whenever
  // the subtopics array reference changes for unrelated reasons.
  const activeTopicId = activeTopic?.topicId ?? null;
  React.useEffect(() => {
    const topic = topics.find((t) => t.topicId === activeTopicId) ?? topics[0] ?? null;
    setSubtopicId(topic?.subtopics[0]?.subtopicId ?? null);
  }, [activeTopicId, topics]);

  if (topics.length === 0) {
    return (
      <>
        <SectionHeading overline="Curriculum progress" title="Subtopic mastery" mobile={mobile} />
        <div style={{ padding: mobile ? "8px 16px 36px" : "10px 28px 60px" }}>
          <EmptyState mobile={mobile} />
        </div>
      </>
    );
  }

  const activeSubtopic = activeTopic?.subtopics.find((s) => s.subtopicId === subtopicId) ?? null;

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
            <TopicPicker
              topics={topics}
              value={topicId ?? defaultTopicId ?? ""}
              onChange={setTopicId}
              mobile={mobile}
            />
          </div>

          {activeTopic && (
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
              <div
                className="label-cap"
                style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}
              >
                Subtopics
              </div>
              <SubtopicPicker
                subtopics={activeTopic.subtopics}
                value={subtopicId}
                onChange={setSubtopicId}
                mobile={mobile}
              />
            </div>
          )}

          {activeSubtopic && <SubtopicDetail sub={activeSubtopic} mobile={mobile} />}
        </div>
      </div>
    </>
  );
}
