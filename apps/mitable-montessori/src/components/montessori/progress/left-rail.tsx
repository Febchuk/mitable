"use client";

import * as React from "react";
import { STATUS_COLOR, STATUS_LABEL, type ProgressMark } from "@/components/montessori/data";
import type { ProgressByTopic } from "@/components/montessori/store";
import type {
  ClassroomGroup,
  ClassroomProgressStudent,
  ClassroomProgressSubject,
  ClassroomProgressTopic,
} from "@/lib/queries/classroom-progress";
import { GROUP_COLOR_META } from "@/lib/classroom-groups";
import styles from "./progress.module.css";

const MASTERY_ORDER: ProgressMark[] = ["m", "p", "i", "-"];

type LeftRailProps = {
  /** Every classroom the teacher can switch between. ≤1 hides the Class picker. */
  classrooms: Array<{ id: string; name: string }>;
  selectedClassroomId: string | null;
  onClassChange: (id: string) => void;
  /** True while a class swap is in flight — dims the picker. */
  classroomBusy?: boolean;
  /** Admin-defined classroom groups ("teams"). Empty hides the Group filter. */
  groups: ClassroomGroup[];
  /** null = whole class. */
  groupId: string | null;
  onGroupChange: (id: string | null) => void;
  subjects: ClassroomProgressSubject[];
  /** null = "All subjects". */
  subjectId: string | null;
  onSubjectChange: (id: string | null) => void;
  topics: ClassroomProgressTopic[];
  /** null = "All topics" (grouped full-curriculum view). */
  topicId: string | null;
  onTopicChange: (id: string | null) => void;
  students: ClassroomProgressStudent[];
  /** Every subtopic currently on screen, with its topic — drives the mastery
   *  tally across one or many topics. */
  visibleSubtopics: Array<{ id: string; topicId: string }>;
  progressByTopic: ProgressByTopic;
};

export function LeftRail({
  classrooms,
  selectedClassroomId,
  onClassChange,
  classroomBusy = false,
  groups,
  groupId,
  onGroupChange,
  subjects,
  subjectId,
  onSubjectChange,
  topics,
  topicId,
  onTopicChange,
  students,
  visibleSubtopics,
  progressByTopic,
}: LeftRailProps) {
  const counts = React.useMemo(() => {
    const o: Record<ProgressMark, number> = { m: 0, p: 0, i: 0, "-": 0 };
    let total = 0;
    for (const s of students) {
      for (const st of visibleSubtopics) {
        const v = progressByTopic[st.topicId]?.[s.id]?.[st.id] ?? "-";
        o[v]++;
        total++;
      }
    }
    return { ...o, total };
  }, [progressByTopic, students, visibleSubtopics]);

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
      className={`${styles.leftRail} scroll-quiet`}
      style={{
        borderRight: "1px solid var(--color-border)",
        padding: "20px 18px 24px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        gap: 18,
      }}
    >
      {classrooms.length > 1 && (
        <div
          style={{
            opacity: classroomBusy ? 0.5 : 1,
            pointerEvents: classroomBusy ? "none" : "auto",
          }}
        >
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
            Class
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {classrooms.map((c) => (
              <SubjectButton
                key={c.id}
                label={c.name}
                isActive={selectedClassroomId === c.id}
                onClick={() => onClassChange(c.id)}
              />
            ))}
          </div>
        </div>
      )}

      {groups.length > 0 && (
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
            Group
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <GroupButton
              label="Whole class"
              isActive={groupId === null}
              onClick={() => onGroupChange(null)}
            />
            {groups.map((g) => (
              <GroupButton
                key={g.id}
                label={g.name}
                color={GROUP_COLOR_META[g.color].cssVar}
                isActive={groupId === g.id}
                onClick={() => onGroupChange(g.id)}
              />
            ))}
          </div>
        </div>
      )}

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
          <button
            type="button"
            className="tap"
            onClick={() => onTopicChange(null)}
            style={{
              textAlign: "left",
              padding: "8px 10px",
              borderRadius: 8,
              border: 0,
              background: topicId === null ? "var(--color-muted)" : "transparent",
              color: topicId === null ? "var(--color-ink)" : "var(--color-ink-secondary)",
              fontSize: 13,
              fontWeight: topicId === null ? 500 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            All topics
          </button>
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
          {topicId === null ? "Mastery · all visible" : "Mastery · this topic"}
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

function GroupButton({
  label,
  color,
  isActive,
  onClick,
}: {
  label: string;
  color?: string;
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
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          flexShrink: 0,
          background: color ?? "transparent",
          border: color ? undefined : "1px dashed var(--color-border)",
        }}
      />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </button>
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
