"use client";

import * as React from "react";
import Link from "next/link";
import { type ProgressMark } from "@/components/montessori/data";
import { FilterChips, PageHeader } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import type {
  ClassroomGroup,
  ClassroomProgressStudent,
  ClassroomProgressSubtopic,
  ClassroomProgressTopic,
  ClassroomProgressSubject,
} from "@/lib/queries/classroom-progress";
import { GROUP_COLOR_META } from "@/lib/classroom-groups";
import { BulkBar } from "./bulk-bar";
import { BulkSheet } from "./bulk-sheet";
import { LeftRail } from "./left-rail";
import { ProgressMatrix, type MatrixSection, type SelectionApi } from "./progress-matrix";
import "./progress.css";
import styles from "./progress.module.css";
import { RecentUpdatesPanel } from "./recent-updates-panel";
import { SelectionCapsule } from "./selection-capsule";
import { SubtopicPopover } from "./subtopic-popover";

const ALL_SUBJECTS = "__all__";

/** Horizontal group ("team") filter pills. Used in the mobile Progress layout;
 *  the desktop layout shows the same filter inside the LeftRail. */
function GroupFilterChips({
  groups,
  groupId,
  onChange,
}: {
  groups: ClassroomGroup[];
  groupId: string | null;
  onChange: (id: string | null) => void;
}) {
  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    background: active ? "var(--color-ink)" : "var(--color-surface)",
    color: active ? "var(--color-surface)" : "var(--color-ink-secondary)",
    border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-border)",
  });
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className="tap"
        onClick={() => onChange(null)}
        style={chip(groupId === null)}
      >
        All
      </button>
      {groups.map((g) => {
        const active = groupId === g.id;
        return (
          <button
            key={g.id}
            type="button"
            className="tap"
            onClick={() => onChange(g.id)}
            style={chip(active)}
          >
            <span
              aria-hidden
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                flexShrink: 0,
                background: GROUP_COLOR_META[g.color].cssVar,
              }}
            />
            {g.name}
          </button>
        );
      })}
    </div>
  );
}

function useSelection(presentStudents: ClassroomProgressStudent[]) {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [draftStatus, setDraftStatus] = React.useState<ProgressMark | null>(null);
  const [draftNote, setDraftNote] = React.useState("");

  const isSelected = React.useCallback(
    (studentId: string, subtopicId: string) => selected.has(`${studentId}:${subtopicId}`),
    [selected]
  );

  const toggle = React.useCallback((studentId: string, subtopicId: string) => {
    setSelected((prev) => {
      const k = `${studentId}:${subtopicId}`;
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const selectRow = React.useCallback(
    (subtopicId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const allOn = presentStudents.every((s) => next.has(`${s.id}:${subtopicId}`));
        if (allOn) presentStudents.forEach((s) => next.delete(`${s.id}:${subtopicId}`));
        else presentStudents.forEach((s) => next.add(`${s.id}:${subtopicId}`));
        return next;
      });
    },
    [presentStudents]
  );

  const selectColumn = React.useCallback((studentId: string, subtopicIds: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = subtopicIds.every((sid) => next.has(`${studentId}:${sid}`));
      if (allOn) subtopicIds.forEach((sid) => next.delete(`${studentId}:${sid}`));
      else subtopicIds.forEach((sid) => next.add(`${studentId}:${sid}`));
      return next;
    });
  }, []);

  // Toggle every present student across a set of subtopics (a whole topic
  // section in the grouped view).
  const selectSubtopics = React.useCallback(
    (subtopicIds: string[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const allOn = subtopicIds.every((sid) =>
          presentStudents.every((s) => next.has(`${s.id}:${sid}`))
        );
        for (const sid of subtopicIds) {
          for (const s of presentStudents) {
            const k = `${s.id}:${sid}`;
            if (allOn) next.delete(k);
            else next.add(k);
          }
        }
        return next;
      });
    },
    [presentStudents]
  );

  const clear = React.useCallback(() => {
    setSelected(new Set());
    setDraftStatus(null);
    setDraftNote("");
  }, []);

  return {
    selected,
    isSelected,
    toggle,
    selectRow,
    selectColumn,
    selectSubtopics,
    clear,
    draftStatus,
    setDraftStatus,
    draftNote,
    setDraftNote,
    count: selected.size,
  };
}

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div
      style={{
        margin: "32px 16px",
        padding: "32px 24px",
        textAlign: "center",
        border: "1px dashed var(--color-border)",
        borderRadius: 14,
        background: "var(--color-surface)",
      }}
    >
      <div className="font-display" style={{ fontSize: 22, color: "var(--color-ink)" }}>
        {title}
      </div>
      <div
        style={{
          marginTop: 8,
          color: "var(--color-ink-secondary)",
          fontSize: 13.5,
          maxWidth: 460,
          margin: "8px auto 0",
        }}
      >
        {body}
      </div>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 10,
            background: "var(--color-ink)",
            color: "var(--color-surface)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

export function ProgressFeature() {
  const store = useMontessori();
  const cp = store.classroomProgress;

  // No active classroom at all (admin or unseated teacher).
  if (!cp) {
    return (
      <div className="progress-root">
        <PageHeader
          overline="Lesson planner"
          title="Progress"
          subtitle="No active classroom assigned to your account."
        />
        <EmptyState
          title="No active classroom"
          body="Ask an admin to assign you to a classroom — once they do, your roster, curriculum, and progress will load here."
        />
      </div>
    );
  }

  // Classroom exists but no curriculum is attached yet.
  if (!cp.curriculumAssigned) {
    return (
      <div className="progress-root">
        <PageHeader
          overline="Lesson planner"
          title="Progress"
          subtitle={`${cp.students.length} children in ${cp.classroomName} · curriculum not assigned`}
        />
        <EmptyState
          title="No curriculum yet"
          body="Once an admin assigns a curriculum to this classroom, you'll see subjects, topics, and subtopics here so you can record progress for each child."
          ctaHref="/admin/curriculum"
          ctaLabel="Open curriculum admin"
        />
      </div>
    );
  }

  return (
    <ProgressFeatureLoaded
      classroomName={cp.classroomName}
      groups={cp.groups}
      subjects={cp.subjects}
      topics={cp.topics}
      subtopics={cp.subtopics}
      students={cp.students}
    />
  );
}

function ProgressFeatureLoaded({
  classroomName,
  groups,
  subjects,
  topics,
  subtopics,
  students,
}: {
  classroomName: string;
  groups: ClassroomGroup[];
  subjects: ClassroomProgressSubject[];
  topics: ClassroomProgressTopic[];
  subtopics: ClassroomProgressSubtopic[];
  students: ClassroomProgressStudent[];
}) {
  const store = useMontessori();

  // Group ("team") filter. null = whole class. A group with no present children
  // still selectable; the grid simply shows an empty-roster message.
  const [groupId, setGroupId] = React.useState<string | null>(null);
  const activeGroup = groupId ? (groups.find((g) => g.id === groupId) ?? null) : null;
  // Fall back to whole class if the selected group was removed out from under us.
  React.useEffect(() => {
    if (groupId && !groups.some((g) => g.id === groupId)) setGroupId(null);
  }, [groups, groupId]);

  const visibleStudents = React.useMemo(
    () => (groupId ? students.filter((s) => s.groupId === groupId) : students),
    [students, groupId]
  );
  const presentStudents = React.useMemo(
    () => visibleStudents.filter((s) => s.present),
    [visibleStudents]
  );
  const sel = useSelection(presentStudents);

  // Subject filter. ALL_SUBJECTS sentinel = no filter.
  const [subjectId, setSubjectId] = React.useState<string>(ALL_SUBJECTS);
  const visibleTopics = React.useMemo(
    () => (subjectId === ALL_SUBJECTS ? topics : topics.filter((t) => t.subjectId === subjectId)),
    [topics, subjectId]
  );

  // null = "All topics" — the grouped full-curriculum (or full-subject) view.
  // A topic id drills into just that one topic (the original single-topic grid).
  const [topicId, setTopicId] = React.useState<string | null>(null);
  // If a subject change leaves the drilled-in topic out of view, fall back to
  // the grouped view rather than silently jumping to an unrelated topic.
  React.useEffect(() => {
    if (topicId && !visibleTopics.some((t) => t.id === topicId)) {
      setTopicId(null);
      sel.clear();
    }
  }, [visibleTopics, topicId, sel]);

  const [info, setInfo] = React.useState<{ subtopicId: string; rect: DOMRect } | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const currentTopic = topicId ? (visibleTopics.find((t) => t.id === topicId) ?? null) : null;

  // Subtopics grouped under their topic, in curriculum order.
  const subtopicsByTopic = React.useMemo(() => {
    const m = new Map<string, ClassroomProgressSubtopic[]>();
    for (const st of subtopics) {
      const arr = m.get(st.topicId) ?? [];
      arr.push(st);
      m.set(st.topicId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [subtopics]);

  // One section when drilled into a single topic; one per visible topic in the
  // grouped view. Topics with no subtopics are dropped.
  const sections = React.useMemo<MatrixSection[]>(() => {
    const topicsToShow = currentTopic ? [currentTopic] : visibleTopics;
    return topicsToShow
      .map((t) => ({
        topicId: t.id,
        topicName: t.name,
        subtopics: subtopicsByTopic.get(t.id) ?? [],
      }))
      .filter((s) => s.subtopics.length > 0);
  }, [currentTopic, visibleTopics, subtopicsByTopic]);

  const showSectionHeaders = currentTopic === null;

  // Flat list of every subtopic on screen, with topic context. Drives the
  // apply path (which groups by topic) and the mastery counts in the left rail.
  const visibleSubtopics = React.useMemo(
    () =>
      sections.flatMap((s) =>
        s.subtopics.map((st) => ({
          id: st.id,
          name: st.name,
          topicId: s.topicId,
          topicName: s.topicName,
        }))
      ),
    [sections]
  );

  const currentSubject =
    subjectId === ALL_SUBJECTS ? null : (subjects.find((s) => s.id === subjectId) ?? null);

  // ESC clears selection + closes any popover/sheet.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      sel.clear();
      setInfo(null);
      setSheetOpen(false);
      setComposerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const switchTopic = React.useCallback(
    (id: string | null) => {
      if (id === topicId) return;
      sel.clear();
      setInfo(null);
      setTopicId(id);
    },
    [sel, topicId]
  );

  const switchSubject = React.useCallback(
    (id: string) => {
      if (id === subjectId) return;
      sel.clear();
      setInfo(null);
      setSubjectId(id);
    },
    [sel, subjectId]
  );

  const switchGroup = React.useCallback(
    (id: string | null) => {
      if (id === groupId) return;
      sel.clear();
      setInfo(null);
      setGroupId(id);
    },
    [sel, groupId]
  );

  // Free-form comment composer (opened from the right-rail "New comment"
  // button). Shares the bottom bar/sheet with cell editing, but in a mode that
  // drops the IPM swatches and cell count — just a child picker + a note.
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [commentChildId, setCommentChildId] = React.useState<string | null>(null);
  const [commentText, setCommentText] = React.useState("");

  const openComposer = React.useCallback(() => {
    sel.clear();
    setInfo(null);
    setComposerOpen(true);
  }, [sel]);
  const closeComposer = React.useCallback(() => {
    setComposerOpen(false);
    setCommentChildId(null);
    setCommentText("");
  }, []);
  const submitComment = React.useCallback(() => {
    const text = commentText.trim();
    if (!commentChildId || !text) return;
    void store.addStudentComment({ studentId: commentChildId, comment: text });
    closeComposer();
  }, [commentChildId, commentText, store, closeComposer]);

  // Cell editing and the comment composer are mutually exclusive — starting a
  // selection dismisses the composer.
  React.useEffect(() => {
    if (sel.count > 0 && composerOpen) closeComposer();
  }, [sel.count, composerOpen, closeComposer]);

  // Mobile: when selection clears, close the sheet too.
  React.useEffect(() => {
    if (sel.count === 0) setSheetOpen(false);
  }, [sel.count]);

  const matrixSel: SelectionApi = {
    isSelected: sel.isSelected,
    toggle: sel.toggle,
    selectRow: sel.selectRow,
    selectColumn: sel.selectColumn,
    selectSubtopics: sel.selectSubtopics,
  };

  const onApply = () => {
    if (!sel.draftStatus || sel.count === 0) return;
    const metaById = new Map(visibleSubtopics.map((st) => [st.id, st] as const));
    // Group selected cells by their topic. applyBulkProgress writes one topic's
    // optimistic progress map per call; the bulk endpoint itself keys on
    // subtopic, so a grouped (multi-topic) selection just fans out into one
    // call per topic.
    const byTopic = new Map<
      string,
      {
        topicName: string;
        cells: Array<{ studentId: string; subtopicId: string; subtopicName: string }>;
      }
    >();
    for (const k of sel.selected) {
      const [studentId, subtopicId] = k.split(":");
      const meta = metaById.get(subtopicId);
      // Defensive: drop any key that no longer points at a visible subtopic
      // (e.g. the user changed subject/topic mid-selection).
      if (!meta) continue;
      const group = byTopic.get(meta.topicId) ?? { topicName: meta.topicName, cells: [] };
      group.cells.push({ studentId, subtopicId, subtopicName: meta.name });
      byTopic.set(meta.topicId, group);
    }
    const total = Array.from(byTopic.values()).reduce((n, g) => n + g.cells.length, 0);
    if (total === 0) return;

    const trimmed = sel.draftNote.trim();
    for (const [tId, group] of byTopic) {
      void store.applyBulkProgress({
        topicId: tId,
        topicName: group.topicName,
        cells: group.cells,
        status: sel.draftStatus,
        note: trimmed || undefined,
      });
    }
    ToastBus.push({
      message: `${total} update${total === 1 ? "" : "s"} saved${
        trimmed ? ` · note attached to ${total} ${total === 1 ? "child" : "children"}` : ""
      }`,
    });
    sel.clear();
  };

  const presentCount = presentStudents.length;
  const subtopicAtInfo = info ? (subtopics.find((s) => s.id === info.subtopicId) ?? null) : null;

  const subjectChipOptions = ["All", ...subjects.map((s) => s.name)];
  const subjectChipValue =
    subjectId === ALL_SUBJECTS ? "All" : (subjects.find((s) => s.id === subjectId)?.name ?? "All");
  const onSubjectChipChange = (label: string) => {
    if (label === "All") switchSubject(ALL_SUBJECTS);
    else {
      const found = subjects.find((s) => s.name === label);
      if (found) switchSubject(found.id);
    }
  };

  const ALL_TOPICS_LABEL = "All topics";
  const topicChipOptions = [ALL_TOPICS_LABEL, ...visibleTopics.map((t) => t.name)];
  const topicChipValue = currentTopic?.name ?? ALL_TOPICS_LABEL;
  const onTopicChipChange = (label: string) => {
    if (label === ALL_TOPICS_LABEL) {
      switchTopic(null);
      return;
    }
    const found = visibleTopics.find((t) => t.name === label);
    if (found) switchTopic(found.id);
  };

  const overline = currentTopic
    ? `Lesson planner · ${currentTopic.name.toLowerCase()}`
    : "Lesson planner";
  const presenceText = activeGroup
    ? `${presentCount} in ${activeGroup.name} present`
    : `${presentCount} children present`;
  const scopeText = currentSubject ? currentSubject.name : "Full curriculum";
  const subtitle = currentTopic
    ? `${presenceText} · ${currentTopic.name} · ${visibleSubtopics.length} subtopics`
    : `${presenceText} · ${scopeText} · ${sections.length} topic${sections.length === 1 ? "" : "s"}`;

  return (
    <div className="progress-root">
      <PageHeader
        overline={`${overline} · ${classroomName}`}
        title="Progress"
        subtitle={subtitle}
      />

      {visibleTopics.length === 0 ? (
        <EmptyState
          title="No topics in this subject yet"
          body="Add a topic in the curriculum admin to start recording progress here."
          ctaHref="/admin/curriculum"
          ctaLabel="Open curriculum admin"
        />
      ) : (
        <>
          {/* Desktop layout */}
          <div className={`hidden lg:grid ${styles.desktopGrid}`}>
            <LeftRail
              groups={groups}
              groupId={groupId}
              onGroupChange={switchGroup}
              subjects={subjects}
              subjectId={subjectId === ALL_SUBJECTS ? null : subjectId}
              onSubjectChange={(id) => switchSubject(id ?? ALL_SUBJECTS)}
              topics={visibleTopics}
              topicId={topicId}
              onTopicChange={switchTopic}
              students={presentStudents}
              visibleSubtopics={visibleSubtopics}
              progressByTopic={store.progressByTopic}
            />
            <div className={styles.matrixPane}>
              {sections.length > 0 && (
                <ProgressMatrix
                  sections={sections}
                  showSectionHeaders={showSectionHeaders}
                  students={presentStudents}
                  progressByTopic={store.progressByTopic}
                  sel={matrixSel}
                  openInfoId={info?.subtopicId ?? null}
                  onInfoOpen={(subtopicId, rect) =>
                    setInfo((cur) =>
                      cur && cur.subtopicId === subtopicId ? null : { subtopicId, rect }
                    )
                  }
                />
              )}
            </div>
            <div className={styles.recentPanel}>
              <RecentUpdatesPanel
                entries={store.recentUpdates}
                students={students}
                onNewComment={openComposer}
              />
            </div>
          </div>

          {/* Mobile layout */}
          <div className={`lg:hidden ${styles.mobileColumn}`}>
            {groups.length > 0 && (
              <div
                style={{
                  padding: "4px 16px 4px",
                  display: "flex",
                  gap: 6,
                  overflowX: "auto",
                }}
              >
                <GroupFilterChips groups={groups} groupId={groupId} onChange={switchGroup} />
              </div>
            )}
            {subjects.length > 1 && (
              <div
                style={{
                  padding: "4px 16px 4px",
                  display: "flex",
                  gap: 6,
                  overflowX: "auto",
                }}
              >
                <FilterChips
                  options={subjectChipOptions}
                  value={subjectChipValue}
                  onChange={onSubjectChipChange}
                />
              </div>
            )}
            <div
              style={{
                padding: "4px 16px 8px",
                display: "flex",
                gap: 6,
                overflowX: "auto",
              }}
            >
              <FilterChips
                options={topicChipOptions}
                value={topicChipValue}
                onChange={onTopicChipChange}
              />
            </div>
            <div
              style={{
                padding: "4px 16px 12px",
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
              }}
            >
              {sections.length > 0 && (
                <ProgressMatrix
                  sections={sections}
                  showSectionHeaders={showSectionHeaders}
                  students={presentStudents}
                  progressByTopic={store.progressByTopic}
                  sel={matrixSel}
                  mobile
                  openInfoId={info?.subtopicId ?? null}
                  onInfoOpen={(subtopicId, rect) =>
                    setInfo((cur) =>
                      cur && cur.subtopicId === subtopicId ? null : { subtopicId, rect }
                    )
                  }
                />
              )}
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <div
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <RecentUpdatesPanel
                  entries={store.recentUpdates}
                  students={students}
                  onNewComment={openComposer}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Desktop bottom bar — comment composer takes priority over cell editing
          (a selection can't be active while the composer is open). */}
      <div className="hidden lg:block">
        {composerOpen ? (
          <BulkBar
            mode="comment"
            students={presentStudents}
            commentChildId={commentChildId}
            onCommentChild={setCommentChildId}
            commentText={commentText}
            onCommentText={setCommentText}
            onSubmit={submitComment}
            onCancel={closeComposer}
          />
        ) : (
          <BulkBar
            mode="cells"
            count={sel.count}
            draftStatus={sel.draftStatus}
            draftNote={sel.draftNote}
            onDraftStatus={sel.setDraftStatus}
            onDraftNote={sel.setDraftNote}
            onApply={onApply}
            onCancel={sel.clear}
          />
        )}
      </div>

      {/* Mobile selection capsule + bottom sheet */}
      <div className="lg:hidden">
        {sel.count > 0 && !sheetOpen && !composerOpen && (
          <SelectionCapsule
            count={sel.count}
            onClear={sel.clear}
            onApply={() => setSheetOpen(true)}
          />
        )}
        {sheetOpen && !composerOpen && (
          <BulkSheet
            mode="cells"
            topic={currentTopic?.name ?? "Selected cells"}
            count={sel.count}
            draftStatus={sel.draftStatus}
            draftNote={sel.draftNote}
            onDraftStatus={sel.setDraftStatus}
            onDraftNote={sel.setDraftNote}
            onApply={() => {
              onApply();
              setSheetOpen(false);
            }}
            onClose={() => setSheetOpen(false)}
          />
        )}
        {composerOpen && (
          <BulkSheet
            mode="comment"
            students={presentStudents}
            commentChildId={commentChildId}
            onCommentChild={setCommentChildId}
            commentText={commentText}
            onCommentText={setCommentText}
            onSubmit={submitComment}
            onClose={closeComposer}
          />
        )}
      </div>

      {info && subtopicAtInfo && (
        <SubtopicPopover
          subtopic={subtopicAtInfo.name}
          anchorRect={info.rect}
          onClose={() => setInfo(null)}
        />
      )}
    </div>
  );
}
