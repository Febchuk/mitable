"use client";

import * as React from "react";
import { STATUS_COLOR, STATUS_LABEL, type ProgressMark } from "@/components/montessori/data";
import type { ProgressByTopic } from "@/components/montessori/store";
import type {
  ClassroomProgressStudent,
  ClassroomProgressSubject,
  ClassroomProgressSubtopic,
  ClassroomProgressTopic,
} from "@/lib/queries/classroom-progress";

const MASTERY_ORDER: ProgressMark[] = ["m", "p", "i", "-"];

type LeftRailProps = {
  subjects: ClassroomProgressSubject[];
  /** null = "All subjects". */
  subjectId: string | null;
  onSubjectChange: (id: string | null) => void;
  topics: ClassroomProgressTopic[];
  topicId: string | null;
  onTopicChange: (id: string) => void;
  students: ClassroomProgressStudent[];
  currentSubtopics: ClassroomProgressSubtopic[];
  progressByTopic: ProgressByTopic;
};

export function LeftRail({
  subjects,
  subjectId,
  onSubjectChange,
  topics,
  topicId,
  onTopicChange,
  students,
  currentSubtopics,
  progressByTopic,
}: LeftRailProps) {
  const currentTopicData = React.useMemo(
    () => (topicId ? (progressByTopic[topicId] ?? {}) : {}),
    [progressByTopic, topicId]
  );
  const currentTopic = topics.find((t) => t.id === topicId) ?? null;

  const dueCount = students.filter((s) => {
    const row = currentTopicData[s.id] ?? {};
    return Object.values(row).some((m) => m === "p" || m === "i");
  }).length;

  const counts = React.useMemo(() => {
    const o: Record<ProgressMark, number> = { m: 0, p: 0, i: 0, "-": 0 };
    let total = 0;
    for (const s of students) {
      const row = currentTopicData[s.id] ?? {};
      // Only count cells whose subtopic is part of the current topic — guards
      // against any stale entries lingering after a curriculum edit.
      for (const st of currentSubtopics) {
        const v = row[st.id] ?? "-";
        o[v]++;
        total++;
      }
    }
    return { ...o, total };
  }, [currentTopicData, students, currentSubtopics]);

  const subtopicCountByTopicId = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of topics) m.set(t.id, 0);
    // currentSubtopics is current-topic only; we need a flat lookup, so the
    // caller already passes topics filtered by subject. Topic count uses the
    // store-side classroomProgress.subtopics list — but here we only have the
    // current topic's subtopics. Approximate: compute from progressByTopic
    // keys for each topic. Falls back to 0 when topic has no rows yet.
    for (const t of topics) {
      const tp = progressByTopic[t.id] ?? {};
      // First student row's keys reflect all subtopics in that topic since
      // the seed pass in store.tsx initialises every cell.
      const firstStudent = Object.values(tp)[0];
      m.set(t.id, firstStudent ? Object.keys(firstStudent).length : 0);
    }
    return m;
  }, [topics, progressByTopic]);

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
            {currentTopic?.name ?? "—"}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--color-ink-secondary)", marginTop: 2 }}>
            {dueCount} {dueCount === 1 ? "child" : "children"} with work in progress
          </div>
        </div>
      </div>

      {subjects.length > 0 && (
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
            Subject
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SubjectButton
              label="All subjects"
              isActive={subjectId === null}
              onClick={() => onSubjectChange(null)}
            />
            {subjects.map((s) => (
              <SubjectButton
                key={s.id}
                label={s.name}
                isActive={subjectId === s.id}
                onClick={() => onSubjectChange(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
          Topic
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {topics.map((t) => {
            const subCount = subtopicCountByTopicId.get(t.id) ?? 0;
            const isActive = topicId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className="tap"
                onClick={() => onTopicChange(t.id)}
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
                <span>{t.name}</span>
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

function SubjectButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tap"
      onClick={onClick}
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
      <span>{label}</span>
    </button>
  );
}
