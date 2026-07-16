"use client";

import * as React from "react";
import { BookOpen, ListTree, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/montessori/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  adminSplitDetailHeaderStyle,
  adminSplitDetailMetaStyle,
  adminSplitDetailScrollStyle,
  adminSplitDetailStyle,
  adminSplitDetailTitleStyle,
  adminSplitGridStyle,
  adminSplitPageStyle,
  adminSplitRailScrollStyle,
  adminSplitRailStyle,
  adminSplitSubnavStyle,
  adminSplitTabPanelStyle,
} from "@/components/admin/split-pane-layout";
import type { CurriculumTree } from "@/lib/queries/curriculum-tree";
import { classroomProgramsEnabled } from "@/lib/feature-flags";
import type { MarkingSchema } from "@/lib/progress/marking-schemas";
import { IepAdminTab } from "./iep-tab";
import { SpeechAdminTab } from "./speech-tab";

type AdminSubtopic = { id: string; name: string };

type AdminTopic = {
  id: string;
  name: string;
  markingSchema: MarkingSchema;
  persisted: boolean;
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

function mapTreeToAdmin(tree: CurriculumTree): AdminCurriculum {
  return {
    id: tree.id,
    name: tree.name,
    ageRange: tree.framework,
    subjects: tree.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      topics: subject.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        markingSchema: topic.markingSchema,
        persisted: true,
        subtopics: topic.subtopics.map((subtopic) => ({
          id: subtopic.id,
          name: subtopic.name,
        })),
      })),
    })),
  };
}

function topicCount(curriculum: AdminCurriculum): number {
  return curriculum.subjects.reduce((sum, subject) => sum + subject.topics.length, 0);
}

function subtopicCount(curriculum: AdminCurriculum): number {
  return curriculum.subjects.reduce(
    (sum, subject) => sum + subject.topics.reduce((s, topic) => s + topic.subtopics.length, 0),
    0
  );
}

type AdminCurriculumTab = "curricula" | "iep" | "speech";

type DbSchoolCurriculum = {
  id: string;
  name: string;
  framework: string;
  is_active: boolean;
};

const PROGRAM_CURRICULUM_TABS = [
  { id: "curricula", label: "Curricula" },
  { id: "iep", label: "IEP" },
  { id: "speech", label: "Speech" },
] as const satisfies ReadonlyArray<{ id: AdminCurriculumTab; label: string }>;

export default function AdminCurriculumPage() {
  const programsEnabled = classroomProgramsEnabled();
  const [activeTab, setActiveTab] = React.useState<AdminCurriculumTab>("curricula");
  const [selectedDbId, setSelectedDbId] = React.useState("");
  const [selectedTree, setSelectedTree] = React.useState<AdminCurriculum | null>(null);
  const [treeLoading, setTreeLoading] = React.useState(false);
  const [treeError, setTreeError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const [dbCurricula, setDbCurricula] = React.useState<DbSchoolCurriculum[] | null>(null);
  const [dbLoadError, setDbLoadError] = React.useState<string | null>(null);
  const [dbActionError, setDbActionError] = React.useState<string | null>(null);
  const [patchBusyId, setPatchBusyId] = React.useState<string | null>(null);
  const [topicMarkingBusyId, setTopicMarkingBusyId] = React.useState<string | null>(null);
  const [topicMarkingErrors, setTopicMarkingErrors] = React.useState<Record<string, string>>({});
  const [seedBusy, setSeedBusy] = React.useState(false);
  const detailScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!programsEnabled && activeTab !== "curricula") {
      setActiveTab("curricula");
    }
  }, [programsEnabled, activeTab]);

  const reloadDbCurricula = React.useCallback(async () => {
    setDbLoadError(null);
    setDbActionError(null);
    try {
      const res = await fetch("/api/admin/curricula", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        curricula?: DbSchoolCurriculum[];
      };
      if (!res.ok) {
        setDbLoadError(data.error ?? "Could not load");
        setDbCurricula(null);
        return;
      }
      const rows = data.curricula ?? [];
      setDbCurricula(rows);
      setSelectedDbId((prev) =>
        prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? "")
      );
    } catch {
      setDbLoadError("Could not load");
      setDbCurricula(null);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedDbId) {
      setSelectedTree(null);
      return;
    }
    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);
    setTopicMarkingErrors({});
    void fetch(`/api/admin/curricula/${selectedDbId}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data: { error?: string; curriculum?: CurriculumTree }) => {
        if (cancelled) return;
        if (!data.curriculum) throw new Error(data.error ?? "Could not load curriculum");
        setSelectedTree(mapTreeToAdmin(data.curriculum));
      })
      .catch((e) => {
        if (cancelled) return;
        setSelectedTree(null);
        setTreeError(e instanceof Error ? e.message : "Could not load curriculum");
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDbId]);

  React.useEffect(() => {
    if (activeTab === "curricula") void reloadDbCurricula();
  }, [activeTab, reloadDbCurricula]);

  const runStandardSeed = async () => {
    setSeedBusy(true);
    setDbActionError(null);
    try {
      const res = await fetch("/api/admin/curricula/seed-defaults", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add programs");
      await reloadDbCurricula();
    } catch (e) {
      setDbActionError(e instanceof Error ? e.message : "Could not add programs");
    } finally {
      setSeedBusy(false);
    }
  };

  const setDbCurriculumActive = async (row: DbSchoolCurriculum, nextActive: boolean) => {
    setPatchBusyId(row.id);
    setDbActionError(null);
    try {
      const res = await fetch("/api/admin/curricula", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ curriculum_id: row.id, is_active: nextActive }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update");
      await reloadDbCurricula();
    } catch (e) {
      setDbActionError(e instanceof Error ? e.message : "Could not update");
    } finally {
      setPatchBusyId(null);
    }
  };

  const selected = selectedTree;

  const updateCurriculum = (
    id: string,
    update: (curriculum: AdminCurriculum) => AdminCurriculum
  ) => {
    setSelectedTree((prev) => {
      if (!prev || prev.id !== id) return prev;
      return update(prev);
    });
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

  const setTopicMarkingSchema = async (
    curriculumId: string,
    subjectId: string,
    topicId: string,
    markingSchema: MarkingSchema
  ) => {
    setTopicMarkingBusyId(topicId);
    setTopicMarkingErrors((prev) => {
      const next = { ...prev };
      delete next[topicId];
      return next;
    });
    try {
      const res = await fetch("/api/admin/curriculum-topics", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic_id: topicId, marking_schema: markingSchema }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        const message =
          data.code === "conflict"
            ? `${data.error ?? "This marking scale is locked."} Existing marks must keep the scale they were recorded with.`
            : (data.error ?? "Could not update the marking scale.");
        setTopicMarkingErrors((prev) => ({ ...prev, [topicId]: message }));
        return;
      }
      updateTopic(curriculumId, subjectId, topicId, (topic) => ({
        ...topic,
        markingSchema,
      }));
    } catch {
      setTopicMarkingErrors((prev) => ({
        ...prev,
        [topicId]: "Could not update the marking scale. Check your connection and try again.",
      }));
    } finally {
      setTopicMarkingBusyId((current) => (current === topicId ? null : current));
    }
  };

  const addCurriculum = async (input: { name: string; ageRange?: string }) => {
    setDbActionError(null);
    try {
      const res = await fetch("/api/admin/curricula", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: input.name.trim(),
          framework: "montessori",
          description: input.ageRange?.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Could not create curriculum");
      await reloadDbCurricula();
      setSelectedDbId(data.id);
    } catch (e) {
      setDbActionError(e instanceof Error ? e.message : "Could not create curriculum");
    }
  };

  const removeCurriculum = (_id: string) => {
    setDbActionError("Removing curricula from the database is not supported here yet.");
  };

  const createTreeRow = async (
    path: string,
    body: Record<string, unknown>,
    fallbackError: string
  ): Promise<string | null> => {
    setDbActionError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? fallbackError);
      return data.id;
    } catch (error) {
      setDbActionError(error instanceof Error ? error.message : fallbackError);
      return null;
    }
  };

  const addSubject = async (curriculumId: string, name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const curriculum = selectedTree?.id === curriculumId ? selectedTree : null;
    if (!curriculum) return false;
    const sortOrder = curriculum.subjects.length;
    const id = await createTreeRow(
      "/api/admin/curriculum-subjects",
      { curriculum_id: curriculumId, name: trimmed, sort_order: sortOrder },
      "Could not create subject"
    );
    if (!id) return false;
    updateCurriculum(curriculumId, (curriculum) => ({
      ...curriculum,
      subjects: [...curriculum.subjects, { id, name: trimmed, topics: [] }],
    }));
    return true;
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

  const addTopic = async (
    curriculumId: string,
    subjectId: string,
    name: string
  ): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const subject = selectedTree?.subjects.find((item) => item.id === subjectId);
    if (!subject) return false;
    const sortOrder = subject.topics.length;
    const id = await createTreeRow(
      "/api/admin/curriculum-topics",
      {
        curriculum_id: curriculumId,
        subject_id: subjectId,
        name: trimmed,
        sort_order: sortOrder,
      },
      "Could not create topic"
    );
    if (!id) return false;
    updateSubject(curriculumId, subjectId, (subject) => ({
      ...subject,
      topics: [
        ...subject.topics,
        {
          id,
          name: trimmed,
          markingSchema: "ipm",
          persisted: true,
          subtopics: [],
        },
      ],
    }));
    return true;
  };

  const removeTopic = (curriculumId: string, subjectId: string, topicId: string) => {
    updateSubject(curriculumId, subjectId, (subject) => ({
      ...subject,
      topics: subject.topics.filter((topic) => topic.id !== topicId),
    }));
  };

  const renameTopic = (curriculumId: string, subjectId: string, topicId: string, name: string) => {
    updateTopic(curriculumId, subjectId, topicId, (topic) => ({
      ...topic,
      name: name.trim() || topic.name,
    }));
  };

  const addSubtopic = async (
    curriculumId: string,
    subjectId: string,
    topicId: string,
    name: string
  ): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const topic = selectedTree?.subjects
      .find((subject) => subject.id === subjectId)
      ?.topics.find((item) => item.id === topicId);
    if (!topic) return false;
    const id = await createTreeRow(
      "/api/admin/curriculum-subtopics",
      {
        topic_id: topicId,
        name: trimmed,
        sort_order: topic.subtopics.length,
        aliases: [],
      },
      "Could not create lesson"
    );
    if (!id) return false;
    updateTopic(curriculumId, subjectId, topicId, (topic) => ({
      ...topic,
      subtopics: [...topic.subtopics, { id, name: trimmed }],
    }));
    return true;
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
        subtopic.id === subtopicId ? { ...subtopic, name: name.trim() || subtopic.name } : subtopic
      ),
    }));
  };

  const showCurriculaPane = !programsEnabled || activeTab === "curricula";

  return (
    <div style={adminSplitPageStyle}>
      <div style={{ flexShrink: 0 }}>
        <PageHeader
          title="Curriculum"
          subtitle="View and modify curricula."
          actions={
            showCurriculaPane ? (
              <Button variant="default" onClick={() => setCreateOpen(true)}>
                <Plus size={16} strokeWidth={1.7} /> Add curriculum
              </Button>
            ) : null
          }
        />

        {(dbLoadError || dbActionError) && showCurriculaPane ? (
          <div
            style={{
              margin: "0 24px 12px",
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(180, 35, 24, 0.08)",
              color: "var(--color-status-error, #b42318)",
              fontSize: 13,
            }}
          >
            {dbLoadError ?? dbActionError}
          </div>
        ) : null}

        {programsEnabled ? (
          <div style={adminSplitSubnavStyle}>
            {PROGRAM_CURRICULUM_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "10px 14px",
                    border: 0,
                    background: "transparent",
                    color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    borderBottom: `2px solid ${active ? "var(--color-ink)" : "transparent"}`,
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {programsEnabled && activeTab === "iep" ? (
        <div className="scroll-quiet" style={adminSplitTabPanelStyle}>
          <IepAdminTab />
        </div>
      ) : null}
      {programsEnabled && activeTab === "speech" ? (
        <div className="scroll-quiet" style={adminSplitTabPanelStyle}>
          <SpeechAdminTab />
        </div>
      ) : null}

      {showCurriculaPane ? (
        <div style={adminSplitGridStyle}>
          <aside style={adminSplitRailStyle}>
            <div
              style={{
                flexShrink: 0,
                padding: "14px 16px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                Curricula
              </div>
            </div>
            <div className="scroll-quiet" style={adminSplitRailScrollStyle}>
              {dbCurricula === null && !dbLoadError ? (
                <div
                  style={{ padding: "18px 16px", fontSize: 13, color: "var(--color-ink-muted)" }}
                >
                  Loading…
                </div>
              ) : (dbCurricula ?? []).length === 0 ? (
                <div style={{ padding: "14px 16px" }}>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-ink-secondary)" }}>
                    No curricula in the database yet. Seed the standard programs or add one.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    disabled={seedBusy}
                    onClick={() => void runStandardSeed()}
                  >
                    {seedBusy ? "Adding…" : "Add standard programs"}
                  </Button>
                </div>
              ) : (
                (dbCurricula ?? []).map((row, index, rows) => {
                  const active = row.id === selectedDbId;
                  const sCount = active && selected ? selected.subjects.length : null;
                  const tCount = active && selected ? topicCount(selected) : null;
                  const isLast = index === rows.length - 1;
                  return (
                    <div
                      key={row.id}
                      style={{
                        display: "flex",
                        alignItems: "stretch",
                        borderTop: index ? "1px solid var(--color-border)" : 0,
                        borderBottom: isLast ? "1px solid var(--color-border)" : 0,
                        background: active ? "var(--color-terracotta-soft)" : "transparent",
                      }}
                    >
                      <button
                        type="button"
                        className="tap"
                        onClick={() => setSelectedDbId(row.id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "14px 10px 14px 16px",
                          border: 0,
                          background: "transparent",
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                            {row.name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--color-ink-secondary)",
                              marginTop: 2,
                            }}
                          >
                            {[
                              programsEnabled ? row.framework : null,
                              sCount != null && tCount != null
                                ? `${sCount} subjects · ${tCount} topics`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                      </button>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          paddingRight: 12,
                          flexShrink: 0,
                        }}
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant={row.is_active ? "secondary" : "outline"}
                          disabled={patchBusyId === row.id || seedBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void setDbCurriculumActive(row, !row.is_active);
                          }}
                          className="shrink-0"
                        >
                          {patchBusyId === row.id ? "…" : row.is_active ? "Active" : "Inactive"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          <section style={adminSplitDetailStyle}>
            <div ref={detailScrollRef} className="scroll-quiet" style={adminSplitDetailScrollStyle}>
              {treeLoading ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--color-ink-muted)" }}>
                  Loading curriculum…
                </div>
              ) : treeError ? (
                <div
                  style={{
                    padding: 28,
                    textAlign: "center",
                    color: "var(--status-error, #e87474)",
                    fontSize: 13,
                  }}
                >
                  {treeError}
                </div>
              ) : selected ? (
                <CurriculumDetail
                  curriculum={selected}
                  scrollRootRef={detailScrollRef}
                  showFramework={programsEnabled}
                  topicCount={topicCount(selected)}
                  subtopicCount={subtopicCount(selected)}
                  onAddSubject={(name) => addSubject(selected.id, name)}
                  onRemoveSubject={(subjectId) => removeSubject(selected.id, subjectId)}
                  onRenameSubject={(subjectId, name) => renameSubject(selected.id, subjectId, name)}
                  onAddTopic={(subjectId, name) => addTopic(selected.id, subjectId, name)}
                  onRemoveTopic={(subjectId, topicId) =>
                    removeTopic(selected.id, subjectId, topicId)
                  }
                  onRenameTopic={(subjectId, topicId, name) =>
                    renameTopic(selected.id, subjectId, topicId, name)
                  }
                  onSetTopicMarkingSchema={(subjectId, topicId, markingSchema) =>
                    setTopicMarkingSchema(selected.id, subjectId, topicId, markingSchema)
                  }
                  topicMarkingBusyId={topicMarkingBusyId}
                  topicMarkingErrors={topicMarkingErrors}
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
                  Select a curriculum to view and edit.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

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
  scrollRootRef,
  showFramework,
  topicCount,
  subtopicCount,
  onAddSubject,
  onRemoveSubject,
  onRenameSubject,
  onAddTopic,
  onRemoveTopic,
  onRenameTopic,
  onSetTopicMarkingSchema,
  topicMarkingBusyId,
  topicMarkingErrors,
  onAddSubtopic,
  onRemoveSubtopic,
  onRenameSubtopic,
  onRemoveCurriculum,
}: {
  curriculum: AdminCurriculum;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  showFramework: boolean;
  topicCount: number;
  subtopicCount: number;
  onAddSubject: (name: string) => Promise<boolean>;
  onRemoveSubject: (subjectId: string) => void;
  onRenameSubject: (subjectId: string, name: string) => void;
  onAddTopic: (subjectId: string, name: string) => Promise<boolean>;
  onRemoveTopic: (subjectId: string, topicId: string) => void;
  onRenameTopic: (subjectId: string, topicId: string, name: string) => void;
  onSetTopicMarkingSchema: (
    subjectId: string,
    topicId: string,
    markingSchema: MarkingSchema
  ) => void;
  topicMarkingBusyId: string | null;
  topicMarkingErrors: Record<string, string>;
  onAddSubtopic: (subjectId: string, topicId: string, name: string) => Promise<boolean>;
  onRemoveSubtopic: (subjectId: string, topicId: string, subtopicId: string) => void;
  onRenameSubtopic: (subjectId: string, topicId: string, subtopicId: string, name: string) => void;
  onRemoveCurriculum: () => void;
}) {
  const [showAddSubject, setShowAddSubject] = React.useState(false);
  const [newSubjectName, setNewSubjectName] = React.useState("");
  const [subjectSaving, setSubjectSaving] = React.useState(false);
  const firstSubjectId = curriculum.subjects[0]?.id ?? null;
  const [activeSubjectId, setActiveSubjectId] = React.useState<string | null>(firstSubjectId);
  const subjectRefs = React.useRef(new Map<string, HTMLDivElement>());
  const isEmpty = curriculum.subjects.length === 0;

  React.useEffect(() => {
    setActiveSubjectId(firstSubjectId);
  }, [curriculum.id, firstSubjectId]);

  React.useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || curriculum.subjects.length === 0) return;
    const updateActiveSubject = () => {
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        setActiveSubjectId(curriculum.subjects.at(-1)?.id ?? null);
        return;
      }
      const rootTop = root.getBoundingClientRect().top;
      let activeId = curriculum.subjects[0]?.id ?? null;
      for (const subject of curriculum.subjects) {
        const element = subjectRefs.current.get(subject.id);
        if (element && element.getBoundingClientRect().top - rootTop <= 96) {
          activeId = subject.id;
        } else {
          break;
        }
      }
      setActiveSubjectId(activeId);
    };
    updateActiveSubject();
    root.addEventListener("scroll", updateActiveSubject, { passive: true });
    return () => root.removeEventListener("scroll", updateActiveSubject);
  }, [curriculum.subjects, scrollRootRef]);

  const jumpToSubject = (subjectId: string) => {
    setActiveSubjectId(subjectId);
    subjectRefs.current.get(subjectId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitSubject = async () => {
    if (!newSubjectName.trim() || subjectSaving) return;
    setSubjectSaving(true);
    const saved = await onAddSubject(newSubjectName);
    setSubjectSaving(false);
    if (saved) {
      setNewSubjectName("");
      setShowAddSubject(false);
    }
  };

  return (
    <>
      <div style={adminSplitDetailHeaderStyle}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={adminSplitDetailTitleStyle}>{curriculum.name}</h2>
          <div style={adminSplitDetailMetaStyle}>
            {curriculum.subjects.length} subjects · {topicCount} topics · {subtopicCount} lessons
            {showFramework && curriculum.ageRange ? ` · ${curriculum.ageRange}` : ""}
          </div>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}
        >
          <Button variant="default" onClick={() => setShowAddSubject(true)}>
            <Plus size={16} strokeWidth={1.7} /> Add subject
          </Button>
          <Button variant="ghost" onClick={onRemoveCurriculum}>
            <Trash2 size={16} strokeWidth={1.6} /> Remove
          </Button>
        </div>
      </div>

      <div
        style={{
          padding: 18,
          display: "grid",
          gridTemplateColumns:
            curriculum.subjects.length > 1 ? "minmax(0, 1fr) minmax(160px, 190px)" : "1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
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
                  if (event.key === "Enter") void submitSubject();
                  if (event.key === "Escape") {
                    setShowAddSubject(false);
                    setNewSubjectName("");
                  }
                }}
                placeholder="New subject name (e.g. Mathematics)"
                className="h-10 bg-surface"
              />
              <Button
                type="button"
                onClick={() => void submitSubject()}
                disabled={!newSubjectName.trim() || subjectSaving}
              >
                {subjectSaving ? "Saving…" : "Add"}
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
              <div
                key={subject.id}
                ref={(element) => {
                  if (element) subjectRefs.current.set(subject.id, element);
                  else subjectRefs.current.delete(subject.id);
                }}
                style={{ scrollMarginTop: 18 }}
              >
                <SubjectCard
                  subject={subject}
                  onRename={(name) => onRenameSubject(subject.id, name)}
                  onRemove={() => onRemoveSubject(subject.id)}
                  onAddTopic={(name) => onAddTopic(subject.id, name)}
                  onRemoveTopic={(topicId) => onRemoveTopic(subject.id, topicId)}
                  onRenameTopic={(topicId, name) => onRenameTopic(subject.id, topicId, name)}
                  onSetTopicMarkingSchema={(topicId, markingSchema) =>
                    onSetTopicMarkingSchema(subject.id, topicId, markingSchema)
                  }
                  topicMarkingBusyId={topicMarkingBusyId}
                  topicMarkingErrors={topicMarkingErrors}
                  onAddSubtopic={(topicId, name) => onAddSubtopic(subject.id, topicId, name)}
                  onRemoveSubtopic={(topicId, subtopicId) =>
                    onRemoveSubtopic(subject.id, topicId, subtopicId)
                  }
                  onRenameSubtopic={(topicId, subtopicId, name) =>
                    onRenameSubtopic(subject.id, topicId, subtopicId, name)
                  }
                />
              </div>
            ))
          )}
        </div>
        {curriculum.subjects.length > 1 ? (
          <SubjectOutline
            subjects={curriculum.subjects}
            activeSubjectId={activeSubjectId}
            onSubjectClick={jumpToSubject}
          />
        ) : null}
      </div>
    </>
  );
}

function SubjectOutline({
  subjects,
  activeSubjectId,
  onSubjectClick,
}: {
  subjects: AdminSubject[];
  activeSubjectId: string | null;
  onSubjectClick: (subjectId: string) => void;
}) {
  return (
    <nav
      aria-label="Curriculum subjects"
      style={{
        position: "sticky",
        top: 16,
        maxHeight: "calc(100dvh - 210px)",
        overflowY: "auto",
        padding: "12px 10px",
        borderLeft: "1px solid var(--color-border)",
      }}
    >
      <div
        className="label-cap"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px 8px",
          color: "var(--color-ink-muted)",
        }}
      >
        <ListTree size={13} strokeWidth={1.7} />
        On this curriculum
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {subjects.map((subject, index) => {
          const active = subject.id === activeSubjectId;
          return (
            <button
              key={subject.id}
              type="button"
              onClick={() => onSubjectClick(subject.id)}
              aria-current={active ? "location" : undefined}
              className="tap"
              style={{
                width: "100%",
                minWidth: 0,
                display: "grid",
                gridTemplateColumns: "16px minmax(0, 1fr)",
                gap: 7,
                alignItems: "start",
                padding: "7px 8px",
                border: 0,
                borderRadius: 7,
                background: active ? "var(--color-muted)" : "transparent",
                color: active ? "var(--color-ink)" : "var(--color-ink-secondary)",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span
                aria-hidden
                style={{
                  fontSize: 10,
                  lineHeight: "18px",
                  color: active ? "var(--color-terracotta)" : "var(--color-ink-muted)",
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    fontWeight: active ? 650 : 500,
                  }}
                >
                  {subject.name}
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    fontSize: 10.5,
                    color: "var(--color-ink-muted)",
                  }}
                >
                  {subject.topics.length} topic{subject.topics.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
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
          Add a subject to get started — for example &quot;Practical Life&quot; or
          &quot;Mathematics&quot;.
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
  onSetTopicMarkingSchema,
  topicMarkingBusyId,
  topicMarkingErrors,
  onAddSubtopic,
  onRemoveSubtopic,
  onRenameSubtopic,
}: {
  subject: AdminSubject;
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddTopic: (name: string) => Promise<boolean>;
  onRemoveTopic: (topicId: string) => void;
  onRenameTopic: (topicId: string, name: string) => void;
  onSetTopicMarkingSchema: (topicId: string, markingSchema: MarkingSchema) => void;
  topicMarkingBusyId: string | null;
  topicMarkingErrors: Record<string, string>;
  onAddSubtopic: (topicId: string, name: string) => Promise<boolean>;
  onRemoveSubtopic: (topicId: string, subtopicId: string) => void;
  onRenameSubtopic: (topicId: string, subtopicId: string, name: string) => void;
}) {
  const [showAddTopic, setShowAddTopic] = React.useState(false);
  const [draftTopic, setDraftTopic] = React.useState("");
  const [topicSaving, setTopicSaving] = React.useState(false);
  const totalSubtopics = subject.topics.reduce((sum, topic) => sum + topic.subtopics.length, 0);

  const submitTopic = async () => {
    if (!draftTopic.trim() || topicSaving) return;
    setTopicSaving(true);
    const saved = await onAddTopic(draftTopic);
    setTopicSaving(false);
    if (saved) {
      setDraftTopic("");
      setShowAddTopic(false);
    }
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
          {subject.topics.length} topic{subject.topics.length === 1 ? "" : "s"} · {totalSubtopics}{" "}
          lesson{totalSubtopics === 1 ? "" : "s"}
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
                if (event.key === "Enter") void submitTopic();
                if (event.key === "Escape") {
                  setShowAddTopic(false);
                  setDraftTopic("");
                }
              }}
              placeholder="New topic name (e.g. Decimal System)"
              className="h-9 bg-canvas"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void submitTopic()}
              disabled={!draftTopic.trim() || topicSaving}
            >
              {topicSaving ? "Saving…" : "Add"}
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
              onSetMarkingSchema={(markingSchema) =>
                onSetTopicMarkingSchema(topic.id, markingSchema)
              }
              markingSchemaBusy={topicMarkingBusyId === topic.id}
              markingSchemaError={topicMarkingErrors[topic.id]}
              onAddSubtopic={(name) => onAddSubtopic(topic.id, name)}
              onRemoveSubtopic={(subtopicId) => onRemoveSubtopic(topic.id, subtopicId)}
              onRenameSubtopic={(subtopicId, name) => onRenameSubtopic(topic.id, subtopicId, name)}
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
  onSetMarkingSchema,
  markingSchemaBusy,
  markingSchemaError,
  onAddSubtopic,
  onRemoveSubtopic,
  onRenameSubtopic,
}: {
  topic: AdminTopic;
  onRename: (name: string) => void;
  onRemove: () => void;
  onSetMarkingSchema: (markingSchema: MarkingSchema) => void;
  markingSchemaBusy: boolean;
  markingSchemaError?: string;
  onAddSubtopic: (name: string) => Promise<boolean>;
  onRemoveSubtopic: (subtopicId: string) => void;
  onRenameSubtopic: (subtopicId: string, name: string) => void;
}) {
  const [draftSubtopic, setDraftSubtopic] = React.useState("");
  const [subtopicSaving, setSubtopicSaving] = React.useState(false);

  const submitSubtopic = async () => {
    if (!draftSubtopic.trim() || subtopicSaving) return;
    setSubtopicSaving(true);
    const saved = await onAddSubtopic(draftSubtopic);
    setSubtopicSaving(false);
    if (saved) setDraftSubtopic("");
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

      {topic.persisted ? (
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label
              htmlFor={`marking-schema-${topic.id}`}
              style={{ fontSize: 12, fontWeight: 600, color: "var(--color-ink-secondary)" }}
            >
              Progress marking
            </label>
            <select
              id={`marking-schema-${topic.id}`}
              value={topic.markingSchema}
              disabled={markingSchemaBusy}
              onChange={(event) => onSetMarkingSchema(event.target.value as MarkingSchema)}
              style={{
                height: 32,
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "var(--color-canvas)",
                color: "var(--color-ink)",
                padding: "0 28px 0 10px",
                fontFamily: "inherit",
                fontSize: 12,
                cursor: markingSchemaBusy ? "wait" : "pointer",
                opacity: markingSchemaBusy ? 0.65 : 1,
              }}
            >
              <option value="ipm">IPM — Introduced, Practicing, Mastered</option>
              <option value="five_level">Five-level — None to Excellent</option>
            </select>
            {markingSchemaBusy ? (
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>Saving…</span>
            ) : null}
          </div>
          {markingSchemaError ? (
            <div
              role="alert"
              style={{
                marginTop: 7,
                fontSize: 12,
                lineHeight: 1.4,
                color: "var(--color-status-error, #b42318)",
              }}
            >
              {markingSchemaError}
            </div>
          ) : null}
        </div>
      ) : null}

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
            if (event.key === "Enter") void submitSubtopic();
          }}
          placeholder="+ Add lesson"
          className="h-9 bg-canvas"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void submitSubtopic()}
          disabled={!draftSubtopic.trim() || subtopicSaving}
        >
          {subtopicSaving ? "Saving…" : "Add"}
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
  onCreate: (input: { name: string; ageRange?: string }) => void | Promise<void>;
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
              void Promise.resolve(onCreate({ name, ageRange: ageRange || undefined })).then(() =>
                onOpenChange(false)
              );
            }}
          >
            Add curriculum
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
