"use client";

import * as React from "react";
import {
  CHILDREN,
  STATUS_COLOR,
  STATUS_LABEL,
  SUBTOPICS_BY_TOPIC,
  TOPICS,
  type ProgressMark,
  type Topic,
} from "@/components/montessori/data";

const MASTERY_ORDER: ProgressMark[] = ["m", "p", "i", "-"];

type LeftRailProps = {
  topic: Topic;
  onTopicChange: (t: Topic) => void;
  progressByTopic: Record<Topic, Record<string, ProgressMark[]>>;
  presentOnly?: boolean;
};

export function LeftRail({
  topic,
  onTopicChange,
  progressByTopic,
  presentOnly = true,
}: LeftRailProps) {
  const data = React.useMemo(() => progressByTopic[topic] || {}, [progressByTopic, topic]);
  const presentChildren = React.useMemo(
    () => (presentOnly ? CHILDREN.filter((c) => c.present) : CHILDREN),
    [presentOnly]
  );
  const dueCount = presentChildren.filter((c) =>
    (data[c.id] || []).some((s) => s === "p" || s === "i")
  ).length;

  const counts = React.useMemo(() => {
    const ids = presentChildren.map((c) => c.id);
    const all = ids.flatMap((cid) => data[cid] || []);
    const o: Record<ProgressMark, number> = { m: 0, p: 0, i: 0, "-": 0 };
    for (const s of all) o[s]++;
    return { ...o, total: all.length };
  }, [data, presentChildren]);

  return (
    <div
      style={{
        borderRight: "1px solid var(--color-border)",
        padding: "20px 18px 24px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        gap: 18,
      }}
    >
      <div>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
          Today&rsquo;s focus
        </div>
        <div
          style={{
            background: "var(--color-butter-soft)",
            borderRadius: 10,
            padding: "10px 12px",
            border: "1px solid color-mix(in srgb, var(--color-butter) 40%, transparent)",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-butter-deep)" }}>
            {topic}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--color-ink-secondary)", marginTop: 2 }}>
            {dueCount} {dueCount === 1 ? "child" : "children"} with work in progress
          </div>
        </div>
      </div>

      <div>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
          Topic
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {TOPICS.map((t) => {
            const subCount = SUBTOPICS_BY_TOPIC[t].length;
            const isActive = topic === t;
            return (
              <button
                key={t}
                type="button"
                className="tap"
                onClick={() => onTopicChange(t)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: 0,
                  background: isActive ? "var(--color-muted)" : "transparent",
                  color: isActive ? "var(--color-ink)" : "var(--color-ink-secondary)",
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span>{t}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--color-ink-muted)",
                    fontWeight: 400,
                  }}
                >
                  {subCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
          Mastery · this topic
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {MASTERY_ORDER.map((s) => (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--color-ink-secondary)",
              }}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 4,
                  background: s === "-" ? "transparent" : STATUS_COLOR[s],
                  border:
                    s === "-" ? "1px dashed var(--color-border)" : "1px solid var(--color-border)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 500, color: "var(--color-ink)" }}>{counts[s]}</span>
              <span>{STATUS_LABEL[s]}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: "var(--color-ink-muted)",
          }}
        >
          {counts.total} cells · present today
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 14,
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div
          className="font-display"
          style={{
            fontSize: 19,
            color: "var(--color-ink-secondary)",
            lineHeight: 1.2,
          }}
        >
          Tip: tap a subtopic name to lock it in for everyone.
        </div>
      </div>
    </div>
  );
}
