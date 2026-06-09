"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { useMontessori } from "@/components/montessori/store";
import { ClassSwitcher } from "@/components/montessori/class-switcher";
import type {
  ClassroomProgress,
  ClassroomProgressSubject,
  ClassroomProgressSubtopic,
  ClassroomProgressTopic,
} from "@/lib/queries/classroom-progress";

function topicsForSubject(subjectId: string, topics: ClassroomProgressTopic[]) {
  return topics.filter((t) => t.subjectId === subjectId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function subtopicsForTopic(topicId: string, subtopics: ClassroomProgressSubtopic[]) {
  return subtopics.filter((s) => s.topicId === topicId).sort((a, b) => a.sortOrder - b.sortOrder);
}

function counts(cp: ClassroomProgress) {
  const topicCount = cp.topics.length;
  const subtopicCount = cp.subtopics.length;
  return { topicCount, subtopicCount };
}

/** Read-only subject block — matches admin `SubjectCard` layout and colors. */
export function ReadOnlySubjectCard({
  subject,
  topics,
  subtopics,
}: {
  subject: ClassroomProgressSubject;
  topics: ClassroomProgressTopic[];
  subtopics: ClassroomProgressSubtopic[];
}) {
  const subjectTopics = topicsForSubject(subject.id, topics);
  const totalSubtopics = subjectTopics.reduce(
    (sum, t) => sum + subtopicsForTopic(t.id, subtopics).length,
    0
  );

  return (
    <section
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 16,
        background: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--color-terracotta-soft, var(--color-muted))",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-ink)" }}>
          {subject.name}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {subjectTopics.length} topic{subjectTopics.length === 1 ? "" : "s"} · {totalSubtopics}{" "}
          lesson
          {totalSubtopics === 1 ? "" : "s"}
        </span>
      </div>

      <div
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "var(--color-canvas, var(--color-surface))",
        }}
      >
        {subjectTopics.length === 0 ? (
          <div
            style={{
              padding: "20px 12px",
              textAlign: "center",
              color: "var(--color-ink-muted)",
              fontSize: 13,
            }}
          >
            No topics in this subject.
          </div>
        ) : (
          subjectTopics.map((topic) => (
            <ReadOnlyTopicCard key={topic.id} topic={topic} subtopics={subtopics} />
          ))
        )}
      </div>
    </section>
  );
}

/** Read-only topic block — matches admin `TopicCard` layout and colors. */
function ReadOnlyTopicCard({
  topic,
  subtopics,
}: {
  topic: ClassroomProgressTopic;
  subtopics: ClassroomProgressSubtopic[];
}) {
  const rows = subtopicsForTopic(topic.id, subtopics);

  return (
    <section
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        background: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--color-muted)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>
          {topic.name}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {rows.length} lesson{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((subtopic, index) => (
          <li
            key={subtopic.id}
            style={{
              padding: "9px 12px",
              borderTop: index ? "1px solid var(--color-border)" : 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--color-ink)" }}>{subtopic.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Blank curriculum — same visual language as admin `EmptyCurriculumState` (no CTA). */
function ReadOnlyEmptyCurriculum() {
  return (
    <div
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 999,
          background: "var(--color-muted)",
          color: "var(--color-ink-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BookOpen size={26} strokeWidth={1.4} />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>
          This curriculum is blank
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--color-ink-secondary)",
            marginTop: 4,
            maxWidth: 360,
          }}
        >
          Your school has not added subjects to this program yet.
        </div>
      </div>
    </div>
  );
}

export function ClassroomCurriculumReader() {
  const { classroomProgress: cp } = useMontessori();

  if (!cp) {
    return (
      <div>
        <PageHeader
          title="Curriculum"
          subtitle="View your class program once you have an assignment."
        />
        <ClassSwitcher style={{ padding: "4px 24px 0" }} />
        <div style={{ padding: "20px 24px 64px" }}>
          <section style={cardStyle}>
            <div style={{ padding: 28, textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--color-ink-secondary)" }}>
                You need an assigned class before a curriculum can load here.
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!cp.curriculumAssigned) {
    return (
      <div>
        <PageHeader title="Curriculum" subtitle={cp.classroomName} />
        <ClassSwitcher style={{ padding: "4px 24px 0" }} />
        <div style={{ padding: "20px 24px 64px" }}>
          <section style={cardStyle}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--color-border)" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-ink)" }}>
                {cp.classroomName}
              </h2>
              <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}>
                No program is linked to this class yet.
              </div>
            </div>
            <div style={{ padding: 18 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-secondary)" }}>
                When your school links a program to this class, the full scope and sequence will
                appear here, matching what you see in the admin curriculum editor.
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const subjects = [...cp.subjects].sort((a, b) => a.sortOrder - b.sortOrder);
  const { topicCount, subtopicCount } = counts(cp);
  const displayName = cp.curriculumName?.trim() || "Curriculum";

  return (
    <div>
      <PageHeader title="Curriculum" subtitle={`${cp.classroomName} · ${displayName}`} />
      <ClassSwitcher style={{ padding: "4px 24px 0" }} />
      <div style={{ padding: "20px 24px 64px" }}>
        <section style={cardStyle}>
          <div
            style={{
              padding: "16px 18px",
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-ink)" }}>
                {displayName}
              </h2>
              <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}>
                {subjects.length} subjects · {topicCount} topics · {subtopicCount} lessons
              </div>
            </div>
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            {subjects.length === 0 ? (
              <ReadOnlyEmptyCurriculum />
            ) : (
              subjects.map((subject) => (
                <ReadOnlySubjectCard
                  key={subject.id}
                  subject={subject}
                  topics={cp.topics}
                  subtopics={cp.subtopics}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
