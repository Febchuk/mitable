"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/montessori/page-header";
import {
  adminSplitDetailScrollStyle,
  adminSplitDetailStyle,
  adminSplitGridStyle,
  adminSplitPageStyle,
  adminSplitRailScrollStyle,
  adminSplitRailStyle,
} from "@/components/admin/split-pane-layout";
import type { CurriculumTree } from "@/lib/queries/curriculum-tree";
import { classroomProgramsEnabled } from "@/lib/feature-flags";
import { ReadOnlySubjectCard } from "@/components/montessori/classroom-curriculum-reader";

type CurriculumListItem = {
  id: string;
  name: string;
  framework: string;
  isActive: boolean;
};

function counts(tree: CurriculumTree) {
  const topicCount = tree.subjects.reduce((sum, s) => sum + s.topics.length, 0);
  const subtopicCount = tree.subjects.reduce(
    (sum, s) => sum + s.topics.reduce((tSum, t) => tSum + t.subtopics.length, 0),
    0
  );
  return { topicCount, subtopicCount };
}

function toReaderShape(tree: CurriculumTree) {
  const subjects = tree.subjects.map((s) => ({
    id: s.id,
    name: s.name,
    sortOrder: s.sortOrder,
  }));
  const topics = tree.subjects.flatMap((s) =>
    s.topics.map((t) => ({
      id: t.id,
      name: t.name,
      subjectId: s.id,
      sortOrder: t.sortOrder,
    }))
  );
  const subtopics = tree.subjects.flatMap((s) =>
    s.topics.flatMap((t) =>
      t.subtopics.map((st) => ({
        id: st.id,
        name: st.name,
        topicId: t.id,
        sortOrder: st.sortOrder,
      }))
    )
  );
  return { subjects, topics, subtopics };
}

export function CurriculumBrowser({
  apiBase,
  readOnly = true,
  pageTitle = "Curriculum",
  pageSubtitle = "View scope and sequence for your school.",
}: {
  apiBase: "/api/admin/curricula" | "/api/v1/curricula";
  readOnly?: boolean;
  pageTitle?: string;
  pageSubtitle?: string;
}) {
  const [list, setList] = React.useState<CurriculumListItem[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [tree, setTree] = React.useState<CurriculumTree | null>(null);
  const [treeLoading, setTreeLoading] = React.useState(false);
  const [treeError, setTreeError] = React.useState<string | null>(null);

  const reloadList = React.useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch(apiBase, { cache: "no-store", credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        curricula?: Array<{
          id: string;
          name: string;
          framework: string;
          is_active?: boolean;
          isActive?: boolean;
        }>;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not load curricula");
      const rows = (data.curricula ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        framework: row.framework,
        isActive: row.isActive ?? row.is_active ?? true,
      }));
      setList(rows);
      setSelectedId((prev) =>
        prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? "")
      );
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load curricula");
      setList(null);
    }
  }, [apiBase]);

  React.useEffect(() => {
    void reloadList();
  }, [reloadList]);

  React.useEffect(() => {
    if (!selectedId) {
      setTree(null);
      return;
    }
    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);
    void fetch(`${apiBase}/${selectedId}`, { cache: "no-store", credentials: "include" })
      .then((res) => res.json())
      .then((data: { error?: string; curriculum?: CurriculumTree }) => {
        if (cancelled) return;
        if (!data.curriculum) throw new Error(data.error ?? "Could not load curriculum");
        setTree(data.curriculum);
      })
      .catch((e) => {
        if (cancelled) return;
        setTree(null);
        setTreeError(e instanceof Error ? e.message : "Could not load curriculum");
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, selectedId]);

  const showFramework = classroomProgramsEnabled();
  const selectedMeta = list?.find((c) => c.id === selectedId) ?? null;
  const readerShape = tree ? toReaderShape(tree) : null;
  const tally = tree ? counts(tree) : null;

  return (
    <div style={adminSplitPageStyle}>
      <div style={{ flexShrink: 0 }}>
        <PageHeader title={pageTitle} subtitle={pageSubtitle} />
      </div>

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
            {list === null && !listError ? (
              <div style={{ padding: "18px 16px", fontSize: 13, color: "var(--color-ink-muted)" }}>
                Loading…
              </div>
            ) : listError ? (
              <div
                style={{
                  padding: "18px 16px",
                  fontSize: 13,
                  color: "var(--status-error, #e87474)",
                }}
              >
                {listError}
              </div>
            ) : !list || list.length === 0 ? (
              <div
                style={{ padding: "18px 16px", fontSize: 13, color: "var(--color-ink-secondary)" }}
              >
                No curricula yet.
              </div>
            ) : (
              (list ?? []).map((row, index) => {
                const active = row.id === selectedId;
                const subjectCount = tree && row.id === selectedId ? tree.subjects.length : null;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="tap"
                    onClick={() => setSelectedId(row.id)}
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
                        {row.name}
                      </div>
                      <div
                        style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}
                      >
                        {[
                          showFramework ? row.framework : null,
                          subjectCount != null ? `${subjectCount} subjects` : null,
                          !row.isActive ? "Inactive" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section style={adminSplitDetailStyle}>
          <div className="scroll-quiet" style={adminSplitDetailScrollStyle}>
            {!selectedMeta ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--color-ink-muted)" }}>
                Select a curriculum.
              </div>
            ) : treeLoading ? (
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
            ) : tree && readerShape ? (
              <>
                <div
                  style={{
                    padding: "16px 18px",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <h2
                    style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-ink)" }}
                  >
                    {tree.name}
                  </h2>
                  <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}>
                    {readerShape.subjects.length} subjects · {tally?.topicCount ?? 0} topics ·{" "}
                    {tally?.subtopicCount ?? 0} lessons
                    {showFramework && tree.framework ? ` · ${tree.framework}` : ""}
                  </div>
                  {readOnly ? (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--color-ink-muted)" }}>
                      Read-only view of scope and sequence for your assigned classrooms.
                    </p>
                  ) : null}
                </div>
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                  {readerShape.subjects.length === 0 ? (
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
                      <p style={{ margin: 0, fontSize: 14, color: "var(--color-ink-secondary)" }}>
                        This curriculum has no subjects yet.
                      </p>
                    </div>
                  ) : (
                    readerShape.subjects.map((subject) => (
                      <ReadOnlySubjectCard
                        key={subject.id}
                        subject={subject}
                        topics={readerShape.topics}
                        subtopics={readerShape.subtopics}
                      />
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
