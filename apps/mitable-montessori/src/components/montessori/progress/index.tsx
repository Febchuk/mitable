"use client";

import * as React from "react";
import {
  CHILDREN,
  SUBTOPICS_BY_TOPIC,
  TOPICS,
  type ProgressMark,
  type Topic,
} from "@/components/montessori/data";
import { FilterChips, PageHeader } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import { BulkBar } from "./bulk-bar";
import { BulkSheet } from "./bulk-sheet";
import { LeftRail } from "./left-rail";
import { ProgressMatrix, type SelectionApi } from "./progress-matrix";
import "./progress.css";
import styles from "./progress.module.css";
import { RecentUpdatesPanel } from "./recent-updates-panel";
import { SelectionCapsule } from "./selection-capsule";
import { SubtopicPopover } from "./subtopic-popover";

function useSelection() {
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [draftStatus, setDraftStatus] = React.useState<ProgressMark | null>(null);
  const [draftNote, setDraftNote] = React.useState("");

  const isSelected = React.useCallback(
    (cid: string, idx: number) => selected.has(`${cid}:${idx}`),
    [selected]
  );

  const toggle = React.useCallback((cid: string, idx: number) => {
    setSelected((prev) => {
      const k = `${cid}:${idx}`;
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const selectRow = React.useCallback((idx: number) => {
    const presentChildren = CHILDREN.filter((c) => c.present);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = presentChildren.every((c) => next.has(`${c.id}:${idx}`));
      if (allOn) presentChildren.forEach((c) => next.delete(`${c.id}:${idx}`));
      else presentChildren.forEach((c) => next.add(`${c.id}:${idx}`));
      return next;
    });
  }, []);

  const selectColumn = React.useCallback((cid: string, subs: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = subs.every((_, i) => next.has(`${cid}:${i}`));
      if (allOn) subs.forEach((_, i) => next.delete(`${cid}:${i}`));
      else subs.forEach((_, i) => next.add(`${cid}:${i}`));
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
  topic,
  progressByTopic,
}: {
  topic: Topic;
  progressByTopic: Record<Topic, Record<string, ProgressMark[]>>;
}) {
  const data = progressByTopic[topic] || {};
  const dueCount = CHILDREN.filter((c) => c.present).filter((c) =>
    (data[c.id] || []).some((s) => s === "p" || s === "i")
  ).length;
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
          Today&rsquo;s focus · {topic}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-ink-secondary)" }}>
          {dueCount} {dueCount === 1 ? "child" : "children"} with work in progress
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-butter-deep)",
          fontWeight: 500,
        }}
      >
        {SUBTOPICS_BY_TOPIC[topic].length} subtopics
      </div>
    </div>
  );
}

export function ProgressFeature() {
  const store = useMontessori();
  const sel = useSelection();
  const [topic, setTopic] = React.useState<Topic>("Sensorial");
  const [info, setInfo] = React.useState<{ idx: number; rect: DOMRect } | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

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

  // Switching topics invalidates selection (subtopic indices don't carry across).
  const switchTopic = React.useCallback(
    (t: Topic) => {
      if (t === topic) return;
      sel.clear();
      setInfo(null);
      setTopic(t);
    },
    [sel, topic]
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
    if (!sel.draftStatus || sel.count === 0) return;
    const cells = Array.from(sel.selected);
    const trimmed = sel.draftNote.trim();
    store.applyBulkProgress({
      topic,
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

  const presentCount = CHILDREN.filter((c) => c.present).length;
  const subCount = SUBTOPICS_BY_TOPIC[topic].length;
  const subtopicAtInfo = info ? SUBTOPICS_BY_TOPIC[topic][info.idx] : null;

  return (
    // Outer wrapper carries the literal `progress-root` class so the
    // route-scoped overrides in progress.css can target it via :has().
    // On desktop those rules clamp the layout chain to 100vh and zero the
    // /app layout's mobile-bottom-nav padding so the matrix fills the page.
    // On mobile the class has no effect — natural page scroll resumes and
    // the layout's 96px bottom padding keeps content above the bottom nav.
    <div className="progress-root">
      <PageHeader
        overline={`Lesson planner · ${topic.toLowerCase()}`}
        title="Progress"
        subtitle={`${presentCount} children present · ${subCount} subtopics in ${topic}`}
      />

      {/* Desktop layout: left rail · matrix · recent updates.
          NB: keep inline style off this wrapper — `hidden lg:grid` controls
          display, and inline `display` would beat it in specificity, leaving
          both layouts visible on desktop. Layout sizing lives on the inner
          grid via styles.desktopGrid. */}
      <div className={`hidden lg:grid ${styles.desktopGrid}`}>
        <LeftRail
          topic={topic}
          onTopicChange={switchTopic}
          progressByTopic={store.progressByTopic}
        />
        <div className={styles.matrixPane}>
          <ProgressMatrix
            topic={topic}
            progressByTopic={store.progressByTopic}
            sel={matrixSel}
            presentOnly
            openInfoIdx={info?.idx ?? null}
            onInfoOpen={(idx, rect) =>
              setInfo((cur) => (cur && cur.idx === idx ? null : { idx, rect }))
            }
          />
        </div>
        <div className={styles.recentPanel}>
          <RecentUpdatesPanel entries={store.recentUpdates} />
        </div>
      </div>

      {/* Mobile layout: Today's focus → topic chips → matrix → updates.
          Same caveat as above: `lg:hidden` owns display; inner sections own
          their own flex layout. */}
      <div className={`lg:hidden ${styles.mobileColumn}`}>
        <div style={{ padding: "12px 16px 8px" }}>
          <TodaysFocusCard topic={topic} progressByTopic={store.progressByTopic} />
        </div>
        <div
          style={{
            padding: "4px 16px 8px",
            display: "flex",
            gap: 6,
            overflowX: "auto",
          }}
        >
          <FilterChips
            options={TOPICS as unknown as string[]}
            value={topic}
            onChange={(v) => switchTopic(v as Topic)}
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
          <ProgressMatrix
            topic={topic}
            progressByTopic={store.progressByTopic}
            sel={matrixSel}
            presentOnly
            mobile
            openInfoIdx={info?.idx ?? null}
            onInfoOpen={(idx, rect) =>
              setInfo((cur) => (cur && cur.idx === idx ? null : { idx, rect }))
            }
          />
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
            <RecentUpdatesPanel entries={store.recentUpdates} />
          </div>
        </div>
      </div>

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
        {sheetOpen && (
          <BulkSheet
            topic={topic}
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
          subtopic={subtopicAtInfo}
          anchorRect={info.rect}
          onClose={() => setInfo(null)}
        />
      )}
    </div>
  );
}
