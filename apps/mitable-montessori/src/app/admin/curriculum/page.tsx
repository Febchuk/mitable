"use client";

import * as React from "react";
import { BookOpen, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_CURRICULA,
  type DefaultCurriculum,
} from "@/lib/admin/curriculum-data";

type AdminSubtopic = { id: string; name: string };

type AdminTopic = {
  id: string;
  name: string;
  subtopics: AdminSubtopic[];
};

type AdminSubject = {
  id: string;
  name: string;
  topics: AdminTopic[];
};

type AdminCurriculum = {
  id: string;
  name: string;
  ageRange: string;
  subjects: AdminSubject[];
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fromDefault(curriculum: DefaultCurriculum): AdminCurriculum {
  return {
    id: curriculum.id,
    name: curriculum.name,
    ageRange: curriculum.ageRange,
    subjects: curriculum.subjects.map((subject) => ({
      id: uid("subject"),
      name: subject.name,
      topics: subject.topics.map((topic) => ({
        id: uid("topic"),
        name: topic.name,
        subtopics: topic.subtopics.map((name) => ({ id: uid("sub"), name })),
      })),
    })),
  };
}

function initialCurricula(): AdminCurriculum[] {
  return DEFAULT_CURRICULA.map(fromDefault);
}

function topicCount(curriculum: AdminCurriculum): number {
  return curriculum.subjects.reduce((sum, subject) => sum + subject.topics.length, 0);
}

function subtopicCount(curriculum: AdminCurriculum): number {
  return curriculum.subjects.reduce(
    (sum, subject) =>
      sum + subject.topics.reduce((s, topic) => s + topic.subtopics.length, 0),
    0
  );
}

export default function AdminCurriculumPage() {
  const [curricula, setCurricula] = React.useState<AdminCurriculum[]>(() =>
    initialCurricula()
  );
  const [selectedId, setSelectedId] = React.useState(curricula[0]?.id ?? "");
  const [createOpen, setCreateOpen] = React.useState(false);

  const selected =
    curricula.find((curriculum) => curriculum.id === selectedId) ?? curricula[0];

  const updateCurriculum = (
    id: string,
    update: (curriculum: AdminCurriculum) => AdminCurriculum
  ) => {
    setCurricula((prev) =>
      prev.map((curriculum) => (curriculum.id === id ? update(curriculum) : curriculum))
    );
  };

  const updateSubject = (
    curriculumId: string,
    subjectId: string,
    update: (subject: AdminSubject) => AdminSubject
  ) => {
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      subjects: curriculum.subjects.map((subject) =>
        subject.id === subjectId ? update(subject) : subject
      ),
    }));
  };

  const updateTopic = (
    curriculumId: string,
    subjectId: string,
    topicId: string,
    update: (topic: AdminTopic) => AdminTopic
  ) => {
    updateSubject(curriculumId, subjectId, (subject) => ({
      ...subject,
      topics: subject.topics.map((topic) => (topic.id === topicId ? update(topic) : topic)),
    }));
  };

  const addCurriculum = (input: { name: string; ageRange?: string }) => {
    const id = uid("curriculum");
    const next: AdminCurriculum = {
      id,
      name: input.name.trim(),
      ageRange: input.ageRange?.trim() ?? "",
      subjects: [],
    };
    setCurricula((prev) => [...prev, next]);
    setSelectedId(id);
  };

  const removeCurriculum = (id: string) => {
    setCurricula((prev) => {
      const next = prev.filter((curriculum) => curriculum.id !== id);
      if (id === selectedId) setSelectedId(next[0]?.id ?? "");
      return next;
    });
  };

  const addSubject = (curriculumId: string, name: string) => {
    if (!name.trim()) return;
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      subjects: [
        ...curriculum.subjects,
        { id: uid("subject"), name: name.trim(), topics: [] },
      ],
    }));
  };

  const removeSubject = (curriculumId: string, subjectId: string) => {
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      subjects: curriculum.subjects.filter((subject) => subject.id !== subjectId),
    }));
  };

  const renameSubject = (curriculumId: string, subjectId: string, name: string) => {
    updateSubject(curriculumId, subjectId, (subject) => ({
      ...subject,
      name: name.trim() || subject.name,
    }));
  };

  const addTopic = (curriculumId: string, subjectId: string, name: string) => {
    if (!name.trim()) return;
    updateSubject(curriculumId, subjectId, (subject) => ({
      ...subject,
      topics: [...subject.topics, { id: uid("topic"), name: name.trim(), subtopics: [] }],
    }));
  };

  const removeTopic = (curriculumId: string, subjectId: string, topicId: string) => {
    updateSubject(curriculumId, subjectId, (subject) => ({
      ...subject,
      topics: subject.topics.filter((topic) => topic.id !== topicId),
    }));
  };

  const renameTopic = (
    curriculumId: string,
    subjectId: string,
    topicId: string,
    name: string
  ) => {
    updateTopic(curriculumId, subjectId, topicId, (topic) => ({
      ...topic,
      name: name.trim() || topic.name,
    }));
  };

  const addSubtopic = (
    curriculumId: string,
    subjectId: string,
    topicId: string,
    name: string
  ) => {
    if (!name.trim()) return;
    updateTopic(curriculumId, subjectId, topicId, (topic) => ({
      ...topic,
      subtopics: [...topic.subtopics, { id: uid("sub"), name: name.trim() }],
    }));
  };

  const removeSubtopic = (
    curriculumId: string,
    subjectId: string,
    topicId: string,
    subtopicId: string
  ) => {
    updateTopic(curriculumId, subjectId, topicId, (topic) => ({
      ...topic,
      subtopics: topic.subtopics.filter((subtopic) => subtopic.id !== subtopicId),
    }));
  };

  const renameSubtopic = (
    curriculumId: string,
    subjectId: string,
    topicId: string,
    subtopicId: string,
    name: string
  ) => {
    updateTopic(curriculumId, subjectId, topicId, (topic) => ({
      ...topic,
      subtopics: topic.subtopics.map((subtopic) =>
        subtopic.id === subtopicId
          ? { ...subtopic, name: name.trim() || subtopic.name }
          : subtopic
      ),
    }));
  };

  return (
    <div>
      <PageHeader
        title="Curriculum"
        subtitle="View and modify curricula."
        actions={
          <Button variant="default" onClick={() => setCreateOpen(true)}>
            <Plus size={16} strokeWidth={1.7} /> Add curriculum
          </Button>
        }
      />

      <div
        style={{
          padding: "20px 24px 64px",
          display: "grid",
          gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <aside style={cardStyle}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
            <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
              Curricula
            </div>
          </div>
          {curricula.map((curriculum, index) => {
            const active = curriculum.id === selected?.id;
            const sCount = curriculum.subjects.length;
            const tCount = topicCount(curriculum);
            return (
              <button
                key={curriculum.id}
                type="button"
                className="tap"
                onClick={() => setSelectedId(curriculum.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  border: 0,
                  borderTop: index ? "1px solid var(--color-border)" : 0,
                  background: active ? "var(--color-terracotta-soft)" : "transparent",
                  textAlign: "left",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                    {curriculum.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}>
                    {curriculum.ageRange
                      ? `${curriculum.ageRange} · ${sCount} subjects · ${tCount} topics`
                      : `${sCount} subjects · ${tCount} topics`}
                  </div>
                </div>
                <ChevronRight size={15} strokeWidth={1.5} />
              </button>
            );
          })}
        </aside>

        <section style={cardStyle}>
          {selected ? (
            <CurriculumDetail
              curriculum={selected}
              topicCount={topicCount(selected)}
              subtopicCount={subtopicCount(selected)}
              onAddSubject={(name) => addSubject(selected.id, name)}
              onRemoveSubject={(subjectId) => removeSubject(selected.id, subjectId)}
              onRenameSubject={(subjectId, name) =>
                renameSubject(selected.id, subjectId, name)
              }
              onAddTopic={(subjectId, name) => addTopic(selected.id, subjectId, name)}
              onRemoveTopic={(subjectId, topicId) =>
                removeTopic(selected.id, subjectId, topicId)
              }
              onRenameTopic={(subjectId, topicId, name) =>
                renameTopic(selected.id, subjectId, topicId, name)
              }
              onAddSubtopic={(subjectId, topicId, name) =>
                addSubtopic(selected.id, subjectId, topicId, name)
              }
              onRemoveSubtopic={(subjectId, topicId, subtopicId) =>
                removeSubtopic(selected.id, subjectId, topicId, subtopicId)
              }
              onRenameSubtopic={(subjectId, topicId, subtopicId, name) =>
                renameSubtopic(selected.id, subjectId, topicId, subtopicId, name)
              }
              onRemoveCurriculum={() => removeCurriculum(selected.id)}
            />
          ) : (
            <div style={{ padding: 28, textAlign: "center", color: "var(--color-ink-muted)" }}>
              No curricula yet. Add one to get started.
            </div>
          )}
        </section>
      </div>

      <CreateCurriculumDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={addCurriculum}
      />
    </div>
  );
}

function CurriculumDetail({
  curriculum,
  topicCount,
  subtopicCount,
  onAddSubject,
  onRemoveSubject,
  onRenameSubject,
  onAddTopic,
  onRemoveTopic,
  onRenameTopic,
  onAddSubtopic,
  onRemoveSubtopic,
  onRenameSubtopic,
  onRemoveCurriculum,
}: {
  curriculum: AdminCurriculum;
  topicCount: number;
  subtopicCount: number;
  onAddSubject: (name: string) => void;
  onRemoveSubject: (subjectId: string) => void;
  onRenameSubject: (subjectId: string, name: string) => void;
  onAddTopic: (subjectId: string, name: string) => void;
  onRemoveTopic: (subjectId: string, topicId: string) => void;
  onRenameTopic: (subjectId: string, topicId: string, name: string) => void;
  onAddSubtopic: (subjectId: string, topicId: string, name: string) => void;
  onRemoveSubtopic: (subjectId: string, topicId: string, subtopicId: string) => void;
  onRenameSubtopic: (
    subjectId: string,
    topicId: string,
    subtopicId: string,
    name: string
  ) => void;
  onRemoveCurriculum: () => void;
}) {
  const [showAddSubject, setShowAddSubject] = React.useState(false);
  const [newSubjectName, setNewSubjectName] = React.useState("");
  const isEmpty = curriculum.subjects.length === 0;

  const submitSubject = () => {
    if (!newSubjectName.trim()) return;
    onAddSubject(newSubjectName);
    setNewSubjectName("");
    setShowAddSubject(false);
  };

  return (
    <>
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
            {curriculum.name}
          </h2>
          <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}>
            {curriculum.subjects.length} subjects · {topicCount} topics · {subtopicCount}{" "}
            lessons{curriculum.ageRange ? ` · ${curriculum.ageRange}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button variant="default" onClick={() => setShowAddSubject(true)}>
            <Plus size={16} strokeWidth={1.7} /> Add subject
          </Button>
          <Button variant="ghost" onClick={onRemoveCurriculum}>
            <Trash2 size={16} strokeWidth={1.6} /> Remove
          </Button>
        </div>
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        {showAddSubject && (
          <div
            style={{
              border: "1px dashed var(--color-border)",
              borderRadius: 12,
              padding: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "var(--color-canvas, var(--color-muted))",
            }}
          >
            <Input
              autoFocus
              value={newSubjectName}
              onChange={(event) => setNewSubjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSubject();
                if (event.key === "Escape") {
                  setShowAddSubject(false);
                  setNewSubjectName("");
                }
              }}
              placeholder="New subject name (e.g. Mathematics)"
              className="h-10 bg-surface"
            />
            <Button type="button" onClick={submitSubject} disabled={!newSubjectName.trim()}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowAddSubject(false);
                setNewSubjectName("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {isEmpty && !showAddSubject ? (
          <EmptyCurriculumState onAddSubject={() => setShowAddSubject(true)} />
        ) : (
          curriculum.subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              onRename={(name) => onRenameSubject(subject.id, name)}
              onRemove={() => onRemoveSubject(subject.id)}
              onAddTopic={(name) => onAddTopic(subject.id, name)}
              onRemoveTopic={(topicId) => onRemoveTopic(subject.id, topicId)}
              onRenameTopic={(topicId, name) => onRenameTopic(subject.id, topicId, name)}
              onAddSubtopic={(topicId, name) => onAddSubtopic(subject.id, topicId, name)}
              onRemoveSubtopic={(topicId, subtopicId) =>
                onRemoveSubtopic(subject.id, topicId, subtopicId)
              }
              onRenameSubtopic={(topicId, subtopicId, name) =>
                onRenameSubtopic(subject.id, topicId, subtopicId, name)
              }
            />
          ))
        )}
      </div>
    </>
  );
}

function EmptyCurriculumState({ onAddSubject }: { onAddSubject: () => void }) {
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
          Add a subject to get started — for example &quot;Practical Life&quot; or &quot;Mathematics&quot;.
        </div>
      </div>
      <Button onClick={onAddSubject}>
        <Plus size={16} strokeWidth={1.7} /> Add first subject
      </Button>
    </div>
  );
}

function SubjectCard({
  subject,
  onRename,
  onRemove,
  onAddTopic,
  onRemoveTopic,
  onRenameTopic,
  onAddSubtopic,
  onRemoveSubtopic,
  onRenameSubtopic,
}: {
  subject: AdminSubject;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddTopic: (name: string) => void;
  onRemoveTopic: (topicId: string) => void;
  onRenameTopic: (topicId: string, name: string) => void;
  onAddSubtopic: (topicId: string, name: string) => void;
  onRemoveSubtopic: (topicId: string, subtopicId: string) => void;
  onRenameSubtopic: (topicId: string, subtopicId: string, name: string) => void;
}) {
  const [showAddTopic, setShowAddTopic] = React.useState(false);
  const [draftTopic, setDraftTopic] = React.useState("");
  const totalSubtopics = subject.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0);

  const submitTopic = () => {
    if (!draftTopic.trim()) return;
    onAddTopic(draftTopic);
    setDraftTopic("");
    setShowAddTopic(false);
  };

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
        <InlineEditableText
          value={subject.name}
          onCommit={onRename}
          textStyle={{ fontSize: 16, fontWeight: 700, color: "var(--color-ink)" }}
        />
        <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {subject.topics.length} topic{subject.topics.length === 1 ? "" : "s"} ·{" "}
          {totalSubtopics} lesson{totalSubtopics === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => setShowAddTopic(true)}>
          <Plus size={14} strokeWidth={1.7} /> Add topic
        </Button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove subject"
          className="tap"
          style={{
            border: 0,
            background: "transparent",
            padding: 6,
            borderRadius: 8,
            color: "var(--color-ink-muted)",
            cursor: "pointer",
          }}
          title="Remove subject"
        >
          <Trash2 size={16} strokeWidth={1.6} />
        </button>
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
        {showAddTopic && (
          <div
            style={{
              border: "1px dashed var(--color-border)",
              borderRadius: 12,
              padding: 10,
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "var(--color-surface)",
            }}
          >
            <Input
              autoFocus
              value={draftTopic}
              onChange={(event) => setDraftTopic(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitTopic();
                if (event.key === "Escape") {
                  setShowAddTopic(false);
                  setDraftTopic("");
                }
              }}
              placeholder="New topic name (e.g. Decimal System)"
              className="h-9 bg-canvas"
            />
            <Button type="button" size="sm" onClick={submitTopic} disabled={!draftTopic.trim()}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAddTopic(false);
                setDraftTopic("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {subject.topics.length === 0 && !showAddTopic ? (
          <div
            style={{
              padding: "20px 12px",
              textAlign: "center",
              color: "var(--color-ink-muted)",
              fontSize: 13,
            }}
          >
            No topics yet. Add one to organize lessons.
          </div>
        ) : (
          subject.topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              onRename={(name) => onRenameTopic(topic.id, name)}
              onRemove={() => onRemoveTopic(topic.id)}
              onAddSubtopic={(name) => onAddSubtopic(topic.id, name)}
              onRemoveSubtopic={(subtopicId) => onRemoveSubtopic(topic.id, subtopicId)}
              onRenameSubtopic={(subtopicId, name) =>
                onRenameSubtopic(topic.id, subtopicId, name)
              }
            />
          ))
        )}
      </div>
    </section>
  );
}

function TopicCard({
  topic,
  onRename,
  onRemove,
  onAddSubtopic,
  onRemoveSubtopic,
  onRenameSubtopic,
}: {
  topic: AdminTopic;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddSubtopic: (name: string) => void;
  onRemoveSubtopic: (subtopicId: string) => void;
  onRenameSubtopic: (subtopicId: string, name: string) => void;
}) {
  const [draftSubtopic, setDraftSubtopic] = React.useState("");

  const submitSubtopic = () => {
    if (!draftSubtopic.trim()) return;
    onAddSubtopic(draftSubtopic);
    setDraftSubtopic("");
  };

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
        <InlineEditableText
          value={topic.name}
          onCommit={onRename}
          textStyle={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}
        />
        <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {topic.subtopics.length} lesson{topic.subtopics.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove topic"
          className="tap"
          style={{
            border: 0,
            background: "transparent",
            padding: 6,
            borderRadius: 8,
            color: "var(--color-ink-muted)",
            cursor: "pointer",
          }}
          title="Remove topic"
        >
          <Trash2 size={15} strokeWidth={1.6} />
        </button>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {topic.subtopics.map((subtopic, index) => (
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
            <InlineEditableText
              value={subtopic.name}
              onCommit={(name) => onRenameSubtopic(subtopic.id, name)}
              textStyle={{ fontSize: 13, color: "var(--color-ink)" }}
            />
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => onRemoveSubtopic(subtopic.id)}
              aria-label="Remove lesson"
              className="tap"
              style={{
                border: 0,
                background: "transparent",
                padding: 6,
                borderRadius: 8,
                color: "var(--color-ink-muted)",
                cursor: "pointer",
              }}
              title="Remove lesson"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <div
        style={{
          padding: "9px 12px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "var(--color-surface)",
        }}
      >
        <Input
          value={draftSubtopic}
          onChange={(event) => setDraftSubtopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitSubtopic();
          }}
          placeholder="+ Add lesson"
          className="h-9 bg-canvas"
        />
        <Button type="button" size="sm" onClick={submitSubtopic} disabled={!draftSubtopic.trim()}>
          Add
        </Button>
      </div>
    </section>
  );
}

function InlineEditableText({
  value,
  onCommit,
  textStyle,
}: {
  value: string;
  onCommit: (next: string) => void;
  textStyle?: React.CSSProperties;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => setDraft(value), [value]);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-8 max-w-md bg-canvas"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="tap"
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        textAlign: "left",
        cursor: "text",
        ...textStyle,
      }}
      title="Click to edit"
    >
      {value}
    </button>
  );
}

function CreateCurriculumDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; ageRange?: string }) => void;
}) {
  const [name, setName] = React.useState("");
  const [ageRange, setAgeRange] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setName("");
      setAgeRange("");
    }
  }, [open]);

  const canSubmit = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">Add curriculum</DialogTitle>
          <p className="text-sm text-ink-secondary">
            Give it a name. You can fill in subjects, topics, and lessons next.
          </p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <div className="label-cap mb-1" style={{ color: "var(--color-ink-muted)" }}>
              Curriculum name
            </div>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Custom Track"
              className="h-10 bg-canvas"
              autoFocus
            />
          </label>

          <label className="block">
            <div className="label-cap mb-1" style={{ color: "var(--color-ink-muted)" }}>
              Age range (optional)
            </div>
            <Input
              value={ageRange}
              onChange={(event) => setAgeRange(event.target.value)}
              placeholder="e.g. 6–9 years"
              className="h-10 bg-canvas"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onCreate({ name, ageRange: ageRange || undefined });
              onOpenChange(false);
            }}
          >
            Add curriculum
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
