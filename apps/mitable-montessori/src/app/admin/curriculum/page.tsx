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

type AdminTopic = {
  id: string;
  name: string;
  subtopics: Array<{ id: string; name: string }>;
};

type AdminCurriculum = {
  id: string;
  name: string;
  ageRange: string;
  topics: AdminTopic[];
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fromDefault(curriculum: DefaultCurriculum): AdminCurriculum {
  return {
    id: curriculum.id,
    name: curriculum.name,
    ageRange: curriculum.ageRange,
    topics: curriculum.topics.map((topic) => ({
      id: uid("topic"),
      name: topic.name,
      subtopics: topic.subtopics.map((name) => ({ id: uid("sub"), name })),
    })),
  };
}

function initialCurricula(): AdminCurriculum[] {
  return DEFAULT_CURRICULA.map(fromDefault);
}

export default function AdminCurriculumPage() {
  const [curricula, setCurricula] = React.useState<AdminCurriculum[]>(() =>
    initialCurricula()
  );
  const [selectedId, setSelectedId] = React.useState(curricula[0]?.id ?? "");
  const [createOpen, setCreateOpen] = React.useState(false);

  const selected =
    curricula.find((curriculum) => curriculum.id === selectedId) ?? curricula[0];

  const subtopicCount = (curriculum: AdminCurriculum) =>
    curriculum.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0);

  const updateCurriculum = (
    id: string,
    update: (curriculum: AdminCurriculum) => AdminCurriculum
  ) => {
    setCurricula((prev) =>
      prev.map((curriculum) => (curriculum.id === id ? update(curriculum) : curriculum))
    );
  };

  const addCurriculum = (input: { name: string; ageRange?: string }) => {
    const id = uid("curriculum");
    const next: AdminCurriculum = {
      id,
      name: input.name.trim(),
      ageRange: input.ageRange?.trim() ?? "",
      topics: [],
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

  const addTopic = (curriculumId: string, name: string) => {
    if (!name.trim()) return;
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      topics: [
        ...curriculum.topics,
        { id: uid("topic"), name: name.trim(), subtopics: [] },
      ],
    }));
  };

  const removeTopic = (curriculumId: string, topicId: string) => {
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      topics: curriculum.topics.filter((topic) => topic.id !== topicId),
    }));
  };

  const renameTopic = (curriculumId: string, topicId: string, name: string) => {
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      topics: curriculum.topics.map((topic) =>
        topic.id === topicId ? { ...topic, name: name.trim() || topic.name } : topic
      ),
    }));
  };

  const addSubtopic = (curriculumId: string, topicId: string, name: string) => {
    if (!name.trim()) return;
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      topics: curriculum.topics.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              subtopics: [...topic.subtopics, { id: uid("sub"), name: name.trim() }],
            }
          : topic
      ),
    }));
  };

  const removeSubtopic = (
    curriculumId: string,
    topicId: string,
    subtopicId: string
  ) => {
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      topics: curriculum.topics.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              subtopics: topic.subtopics.filter((subtopic) => subtopic.id !== subtopicId),
            }
          : topic
      ),
    }));
  };

  const renameSubtopic = (
    curriculumId: string,
    topicId: string,
    subtopicId: string,
    name: string
  ) => {
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      topics: curriculum.topics.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              subtopics: topic.subtopics.map((subtopic) =>
                subtopic.id === subtopicId
                  ? { ...subtopic, name: name.trim() || subtopic.name }
                  : subtopic
              ),
            }
          : topic
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
                      ? `${curriculum.ageRange} · ${curriculum.topics.length} topics`
                      : `${curriculum.topics.length} topics`}
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
              subtopicCount={subtopicCount(selected)}
              onAddTopic={(name) => addTopic(selected.id, name)}
              onRemoveTopic={(topicId) => removeTopic(selected.id, topicId)}
              onRenameTopic={(topicId, name) => renameTopic(selected.id, topicId, name)}
              onAddSubtopic={(topicId, name) => addSubtopic(selected.id, topicId, name)}
              onRemoveSubtopic={(topicId, subtopicId) =>
                removeSubtopic(selected.id, topicId, subtopicId)
              }
              onRenameSubtopic={(topicId, subtopicId, name) =>
                renameSubtopic(selected.id, topicId, subtopicId, name)
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
  subtopicCount,
  onAddTopic,
  onRemoveTopic,
  onRenameTopic,
  onAddSubtopic,
  onRemoveSubtopic,
  onRenameSubtopic,
  onRemoveCurriculum,
}: {
  curriculum: AdminCurriculum;
  subtopicCount: number;
  onAddTopic: (name: string) => void;
  onRemoveTopic: (topicId: string) => void;
  onRenameTopic: (topicId: string, name: string) => void;
  onAddSubtopic: (topicId: string, name: string) => void;
  onRemoveSubtopic: (topicId: string, subtopicId: string) => void;
  onRenameSubtopic: (topicId: string, subtopicId: string, name: string) => void;
  onRemoveCurriculum: () => void;
}) {
  const [showAddTopic, setShowAddTopic] = React.useState(false);
  const [newTopicName, setNewTopicName] = React.useState("");
  const isEmpty = curriculum.topics.length === 0;

  const submitTopic = () => {
    if (!newTopicName.trim()) return;
    onAddTopic(newTopicName);
    setNewTopicName("");
    setShowAddTopic(false);
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
            {curriculum.topics.length} topics · {subtopicCount} subtopics
            {curriculum.ageRange ? ` · ${curriculum.ageRange}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Button variant="default" onClick={() => setShowAddTopic(true)}>
            <Plus size={16} strokeWidth={1.7} /> Add topic
          </Button>
          <Button variant="ghost" onClick={onRemoveCurriculum}>
            <Trash2 size={16} strokeWidth={1.6} /> Remove
          </Button>
        </div>
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {showAddTopic && (
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
              value={newTopicName}
              onChange={(event) => setNewTopicName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitTopic();
                if (event.key === "Escape") {
                  setShowAddTopic(false);
                  setNewTopicName("");
                }
              }}
              placeholder="New topic name (e.g. Sensorial)"
              className="h-10 bg-surface"
            />
            <Button type="button" onClick={submitTopic} disabled={!newTopicName.trim()}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowAddTopic(false);
                setNewTopicName("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {isEmpty && !showAddTopic ? (
          <EmptyCurriculumState onAddTopic={() => setShowAddTopic(true)} />
        ) : (
          curriculum.topics.map((topic) => (
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
    </>
  );
}

function EmptyCurriculumState({ onAddTopic }: { onAddTopic: () => void }) {
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
          Add a topic to get started — for example "Practical Life" or "Mathematics".
        </div>
      </div>
      <Button onClick={onAddTopic}>
        <Plus size={16} strokeWidth={1.7} /> Add first topic
      </Button>
    </div>
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
        borderRadius: 14,
        background: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
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
          textStyle={{ fontSize: 15, fontWeight: 700, color: "var(--color-ink)" }}
        />
        <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {topic.subtopics.length} subtopic{topic.subtopics.length === 1 ? "" : "s"}
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
          <Trash2 size={16} strokeWidth={1.6} />
        </button>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {topic.subtopics.map((subtopic, index) => (
          <li
            key={subtopic.id}
            style={{
              padding: "10px 14px",
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
              aria-label="Remove subtopic"
              className="tap"
              style={{
                border: 0,
                background: "transparent",
                padding: 6,
                borderRadius: 8,
                color: "var(--color-ink-muted)",
                cursor: "pointer",
              }}
              title="Remove subtopic"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <div
        style={{
          padding: "10px 14px",
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
          placeholder="+ Add subtopic"
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
            Give it a name. You can fill in topics and subtopics next.
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
