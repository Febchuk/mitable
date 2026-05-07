"use client";

import * as React from "react";
import Link from "next/link";
import { type ProgressMark } from "@/components/montessori/data";
import { FilterChips, PageHeader } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import type {
  ClassroomProgressStudent,
  ClassroomProgressSubtopic,
  ClassroomProgressTopic,
  ClassroomProgressSubject,
} from "@/lib/queries/classroom-progress";
import { BulkBar } from "./bulk-bar";
import { BulkSheet } from "./bulk-sheet";
import { LeftRail } from "./left-rail";
import { ProgressMatrix, type SelectionApi } from "./progress-matrix";
import "./progress.css";
import styles from "./progress.module.css";
import { RecentUpdatesPanel } from "./recent-updates-panel";
import { SelectionCapsule } from "./selection-capsule";
import { SubtopicPopover } from "./subtopic-popover";

const ALL_SUBJECTS = "__all__";

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
    clear,
    draftStatus,
    setDraftStatus,
    draftNote,
    setDraftNote,
    count: selected.size,
  };
}

function TodaysFocusCard({
  topicName,
  subtopicCount,
  inProgressChildren,
}: {
  topicName: string;
  subtopicCount: number;
  inProgressChildren: number;
}) {
  return (
    <div
      style={{
        background: "var(--color-butter-soft)",
        border: "1px solid color-mix(in srgb, var(--color-butter) 40%, transparent)",
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-butter-deep)" }}>
          Today&rsquo;s focus · {topicName}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-secondary)" }}>
          {inProgressChildren} {inProgressChildren === 1 ? "child" : "children"} with work in
          progress
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-butter-deep)",
          fontWeight: 500,
        }}
      >
        {subtopicCount} subtopics
      </div>
    </div>
  );
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
      subjects={cp.subjects}
      topics={cp.topics}
      subtopics={cp.subtopics}
      students={cp.students}
    />
  );
}

function ProgressFeatureLoaded({
  classroomName,
  subjects,
  topics,
  subtopics,
  students,
}: {
  classroomName: string;
  subjects: ClassroomProgressSubject[];
  topics: ClassroomProgressTopic[];
  subtopics: ClassroomProgressSubtopic[];
  students: ClassroomProgressStudent[];
}) {
  const store = useMontessori();
  const presentStudents = React.useMemo(() => students.filter((s) => s.present), [students]);
  const sel = useSelection(presentStudents);

  // Subject filter. ALL_SUBJECTS sentinel = no filter.
  const [subjectId, setSubjectId] = React.useState<string>(ALL_SUBJECTS);
  const visibleTopics = React.useMemo(
    () => (subjectId === ALL_SUBJECTS ? topics : topics.filter((t) => t.subjectId === subjectId)),
    [topics, subjectId]
  );

  const [topicId, setTopicId] = React.useState<string | null>(visibleTopics[0]?.id ?? null);
  // Keep topicId in sync with the visible-topics list when a subject filter
  // narrows it out from under us.
  React.useEffect(() => {
    if (visibleTopics.length === 0) {
      if (topicId !== null) setTopicId(null);
      return;
    }
    if (!topicId || !visibleTopics.some((t) => t.id === topicId)) {
      setTopicId(visibleTopics[0].id);
      sel.clear();
    }
  }, [visibleTopics, topicId, sel]);

  const [info, setInfo] = React.useState<{ subtopicId: string; rect: DOMRect } | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const currentTopic = visibleTopics.find((t) => t.id === topicId) ?? visibleTopics[0] ?? null;
  const currentSubtopics = React.useMemo(
    () =>
      currentTopic
        ? subtopics
            .filter((st) => st.topicId === currentTopic.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [subtopics, currentTopic]
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  const switchTopic = React.useCallback(
    (id: string) => {
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

  // Mobile: when selection clears, close the sheet too.
  React.useEffect(() => {
    if (sel.count === 0) setSheetOpen(false);
  }, [sel.count]);

  const matrixSel: SelectionApi = {
    isSelected: sel.isSelected,
    toggle: sel.toggle,
    selectRow: sel.selectRow,
    selectColumn: sel.selectColumn,
  };

  const onApply = () => {
    if (!sel.draftStatus || sel.count === 0 || !currentTopic) return;
    const subtopicNameById = new Map(currentSubtopics.map((st) => [st.id, st.name] as const));
    const cells = Array.from(sel.selected)
      .map((k) => {
        const [studentId, subtopicId] = k.split(":");
        const subtopicName = subtopicNameById.get(subtopicId) ?? "";
        return { studentId, subtopicId, subtopicName };
      })
      // Defensive: drop any selection key that no longer points at a current
      // subtopic (e.g. user changed topic mid-selection).
      .filter((c) => subtopicNameById.has(c.subtopicId));
    if (cells.length === 0) return;

    const trimmed = sel.draftNote.trim();
    void store.applyBulkProgress({
      topicId: currentTopic.id,
      topicName: currentTopic.name,
      cells,
      status: sel.draftStatus,
      note: trimmed || undefined,
    });
    ToastBus.push({
      message: `${cells.length} update${cells.length === 1 ? "" : "s"} saved${
        trimmed
          ? ` · note attached to ${cells.length} ${cells.length === 1 ? "child" : "children"}`
          : ""
      }`,
    });
    sel.clear();
  };

  const presentCount = presentStudents.length;
  const subCount = currentSubtopics.length;
  const subtopicAtInfo = info
    ? (currentSubtopics.find((s) => s.id === info.subtopicId) ?? null)
    : null;

  // Compute "in progress" count for Today's focus on mobile.
  const inProgress = currentTopic
    ? presentStudents.filter((s) => {
        const row = store.progressByTopic[currentTopic.id]?.[s.id] ?? {};
        return Object.values(row).some((m) => m === "p" || m === "i");
      }).length
    : 0;

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

  const topicChipOptions = visibleTopics.map((t) => t.name);
  const topicChipValue = currentTopic?.name ?? "";
  const onTopicChipChange = (label: string) => {
    const found = visibleTopics.find((t) => t.name === label);
    if (found) switchTopic(found.id);
  };

  const overline = currentTopic
    ? `Lesson planner · ${currentTopic.name.toLowerCase()}`
    : "Lesson planner";
  const subtitle = currentTopic
    ? currentSubject
      ? `${presentCount} children present · ${currentTopic.name} · ${currentSubject.name}`
      : `${presentCount} children present · ${subCount} subtopics in ${currentTopic.name}`
    : `${presentCount} children present`;

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
              subjects={subjects}
              subjectId={subjectId === ALL_SUBJECTS ? null : subjectId}
              onSubjectChange={(id) => switchSubject(id ?? ALL_SUBJECTS)}
              topics={visibleTopics}
              topicId={currentTopic?.id ?? null}
              onTopicChange={switchTopic}
              students={presentStudents}
              currentSubtopics={currentSubtopics}
              progressByTopic={store.progressByTopic}
            />
            <div className={styles.matrixPane}>
              {currentTopic && (
                <ProgressMatrix
                  topicId={currentTopic.id}
                  subtopics={currentSubtopics}
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
              <RecentUpdatesPanel entries={store.recentUpdates} students={students} />
            </div>
          </div>

          {/* Mobile layout */}
          <div className={`lg:hidden ${styles.mobileColumn}`}>
            <div style={{ padding: "12px 16px 8px" }}>
              {currentTopic && (
                <TodaysFocusCard
                  topicName={currentTopic.name}
                  subtopicCount={subCount}
                  inProgressChildren={inProgress}
                />
              )}
            </div>
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
              {currentTopic && (
                <ProgressMatrix
                  topicId={currentTopic.id}
                  subtopics={currentSubtopics}
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
                <RecentUpdatesPanel entries={store.recentUpdates} students={students} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Desktop bulk bar — fixed bottom-center, only when selection > 0 */}
      <div className="hidden lg:block">
        <BulkBar
          count={sel.count}
          draftStatus={sel.draftStatus}
          draftNote={sel.draftNote}
          onDraftStatus={sel.setDraftStatus}
          onDraftNote={sel.setDraftNote}
          onApply={onApply}
          onCancel={sel.clear}
        />
      </div>

      {/* Mobile selection capsule + bottom sheet */}
      <div className="lg:hidden">
        {sel.count > 0 && !sheetOpen && (
          <SelectionCapsule
            count={sel.count}
            onClear={sel.clear}
            onApply={() => setSheetOpen(true)}
          />
        )}
        {sheetOpen && currentTopic && (
          <BulkSheet
            topic={currentTopic.name}
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
