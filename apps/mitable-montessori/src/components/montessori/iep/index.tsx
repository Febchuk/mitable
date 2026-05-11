"use client";

import * as React from "react";
import { CHILDREN, type Tone } from "@/components/montessori/data";
import { PageHeader } from "@/components/montessori/page-header";
import { Avatar, ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import type { ClassroomProgressStudent } from "@/lib/queries/classroom-progress";
import {
  emptyIepItem,
  type IepGoal,
  type IepItemState,
  type IepRating,
  type PromptingCode,
} from "./data";
import { IepCommentBar, type IepCommentBarApply } from "./iep-comment-bar";
import { IepCommentsDrawer, type DrawerComment } from "./iep-comments-drawer";
import { IepItemRow } from "./iep-grid";
import styles from "./iep.module.css";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

type StudentLite = {
  id: string;
  name: string;
  preferredName: string | null;
  tone: Tone;
};

type LoadedComment = {
  id: string;
  itemId: string;
  body: string;
  authorId: string | null;
  createdAt: string;
};

type LoadedItem = {
  id: string;
  domainId: string;
  name: string;
  position: number;
  rating: IepRating | null;
  successCount: number | null;
  promptingCode: PromptingCode | null;
  updatedAt: string | null;
  comments: LoadedComment[];
};

type LoadedDomain = {
  id: string;
  name: string;
  position: number;
  items: LoadedItem[];
};

function rosterFromClassroom(students: ClassroomProgressStudent[]): StudentLite[] {
  return students
    .map((s) => ({
      id: s.id,
      name: s.fullName,
      preferredName: s.preferredName,
      tone: toneFor(s.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rosterFromMock(): StudentLite[] {
  return CHILDREN.filter((c) => c.present).map((c) => ({
    id: c.id,
    name: c.name,
    preferredName: null,
    tone: c.tone,
  }));
}

function itemToState(item: LoadedItem): IepItemState {
  return {
    rating: item.rating,
    successCount: item.successCount,
    promptingCode: item.promptingCode,
    comments: item.comments.map((c) => ({
      id: c.id,
      text: c.body,
      createdAt: c.createdAt,
      author: c.authorId ?? undefined,
    })),
    updatedAt: item.updatedAt,
  };
}

function itemToGoal(item: LoadedItem, domainName: string): IepGoal {
  return { id: item.id, domain: domainName, name: item.name };
}

export function IepProgressFeature() {
  const store = useMontessori();
  const cp = store.classroomProgress;
  const roster = React.useMemo<StudentLite[]>(
    () => (cp ? rosterFromClassroom(cp.students) : rosterFromMock()),
    [cp]
  );

  const [studentId, setStudentId] = React.useState<string | null>(roster[0]?.id ?? null);
  const [domains, setDomains] = React.useState<LoadedDomain[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!studentId && roster.length > 0) setStudentId(roster[0].id);
  }, [roster, studentId]);

  const refreshPlan = React.useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/iep/plan?studentId=${sid}`, { cache: "no-store" });
      if (!res.ok) {
        setDomains([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { domains?: LoadedDomain[] };
      setDomains(data.domains ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!studentId) {
      setDomains([]);
      return;
    }
    setSelectedItemId(null);
    void refreshPlan(studentId);
  }, [studentId, refreshPlan]);

  const student = roster.find((s) => s.id === studentId) ?? null;

  const allItems = React.useMemo(() => domains.flatMap((d) => d.items), [domains]);
  const itemsById = React.useMemo(() => {
    const m = new Map<string, { item: LoadedItem; domain: LoadedDomain }>();
    for (const d of domains) for (const it of d.items) m.set(it.id, { item: it, domain: d });
    return m;
  }, [domains]);

  const flatComments = React.useMemo<DrawerComment[]>(() => {
    const out: DrawerComment[] = [];
    for (const it of allItems) {
      for (const c of it.comments) {
        out.push({
          itemId: it.id,
          itemName: it.name,
          commentId: c.id,
          body: c.body,
          createdAt: c.createdAt,
          author: c.authorId,
        });
      }
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }, [allItems]);

  const totalComments = flatComments.length;

  const selectedRecord = selectedItemId ? (itemsById.get(selectedItemId) ?? null) : null;
  const selectedGoal = selectedRecord
    ? itemToGoal(selectedRecord.item, selectedRecord.domain.name)
    : null;
  const selectedItemState: IepItemState = selectedRecord
    ? itemToState(selectedRecord.item)
    : emptyIepItem();

  const onSelect = React.useCallback((itemId: string) => {
    setSelectedItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

  const persistState = React.useCallback(
    async (
      itemId: string,
      patch: {
        rating: IepRating | null;
        successCount: number | null;
        promptingCode: PromptingCode | null;
      }
    ): Promise<boolean> => {
      const res = await fetch(`/api/v1/iep/items/${itemId}/state`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      return res.ok;
    },
    []
  );

  const persistComment = React.useCallback(
    async (itemId: string, body: string): Promise<LoadedComment | null> => {
      const res = await fetch(`/api/v1/iep/items/${itemId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => ({}))) as { id?: string; createdAt?: string };
      if (!data.id) return null;
      return {
        id: data.id,
        itemId,
        body,
        authorId: null,
        createdAt: data.createdAt ?? new Date().toISOString(),
      };
    },
    []
  );

  const onApplyBar = React.useCallback(
    async (next: IepCommentBarApply) => {
      if (!selectedRecord || !student) return;
      const itemId = selectedRecord.item.id;
      const fieldsChanged =
        next.rating !== selectedRecord.item.rating ||
        next.successCount !== selectedRecord.item.successCount ||
        next.promptingCode !== selectedRecord.item.promptingCode;

      if (fieldsChanged) {
        const ok = await persistState(itemId, {
          rating: next.rating,
          successCount: next.successCount,
          promptingCode: next.promptingCode,
        });
        if (!ok) {
          ToastBus.push({ message: "Couldn't save fields." });
          return;
        }
        setDomains((prev) =>
          prev.map((d) =>
            d.id !== selectedRecord.domain.id
              ? d
              : {
                  ...d,
                  items: d.items.map((it) =>
                    it.id === itemId
                      ? {
                          ...it,
                          rating: next.rating,
                          successCount: next.successCount,
                          promptingCode: next.promptingCode,
                          updatedAt: new Date().toISOString(),
                        }
                      : it
                  ),
                }
          )
        );
      }

      const trimmed = next.comment.trim();
      if (trimmed) {
        const created = await persistComment(itemId, trimmed);
        if (!created) {
          ToastBus.push({ message: "Couldn't save comment." });
          return;
        }
        setDomains((prev) =>
          prev.map((d) =>
            d.id !== selectedRecord.domain.id
              ? d
              : {
                  ...d,
                  items: d.items.map((it) =>
                    it.id === itemId ? { ...it, comments: [created, ...it.comments] } : it
                  ),
                }
          )
        );
      }

      const firstName = student.name.split(" ")[0];
      ToastBus.push({
        message: trimmed
          ? `Updated · comment saved for ${firstName}`
          : fieldsChanged
            ? `Updated · ${firstName}`
            : "No changes",
      });
      setSelectedItemId(null);
    },
    [selectedRecord, student, persistState, persistComment]
  );

  const onRemoveComment = React.useCallback(async (commentId: string) => {
    const res = await fetch(`/api/v1/iep/comments/${commentId}`, { method: "DELETE" });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't delete." });
      return;
    }
    setDomains((prev) =>
      prev.map((d) => ({
        ...d,
        items: d.items.map((it) => ({
          ...it,
          comments: it.comments.filter((c) => c.id !== commentId),
        })),
      }))
    );
  }, []);

  return (
    <div className={styles.iepRoot}>
      <PageHeader
        overline={`IEP progress${student ? ` · ${student.name.split(" ")[0]}` : ""}`}
        title="Progress"
        subtitle={
          student
            ? `${student.name} · ${totalComments} ${totalComments === 1 ? "comment" : "comments"} on file`
            : "Pick a child to start"
        }
      />

      <div
        style={{
          padding: "12px 16px 4px",
          display: "flex",
          gap: 8,
          overflowX: "auto",
          scrollbarWidth: "thin",
        }}
      >
        {roster.map((s) => {
          const active = s.id === studentId;
          const label = s.preferredName ?? s.name.split(" ")[0];
          return (
            <button
              key={s.id}
              type="button"
              className="tap"
              onClick={() => setStudentId(s.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px 6px 6px",
                borderRadius: 999,
                border: `1px solid ${active ? "var(--color-ink)" : "var(--color-border)"}`,
                background: active ? "var(--color-ink)" : "var(--color-surface)",
                color: active ? "var(--color-surface)" : "var(--color-ink-secondary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <Avatar initials={initialsFor(s.name)} tone={s.tone} size={24} />
              {label}
            </button>
          );
        })}
      </div>

      <div className={styles.iepLayout}>
        <div className={styles.iepMain}>
          {loading ? (
            <div style={{ padding: 24, color: "var(--color-ink-muted)", fontSize: 13 }}>
              Loading plan…
            </div>
          ) : domains.length === 0 ? (
            <div
              style={{
                padding: 24,
                border: "1px dashed var(--color-border)",
                borderRadius: 14,
                color: "var(--color-ink-secondary)",
                fontSize: 13.5,
              }}
            >
              {student
                ? `No IEP plan yet for ${student.name.split(" ")[0]}. An admin can set one up under Curriculum → IEP.`
                : "Pick a child to start."}
            </div>
          ) : (
            domains.map((domain) => {
              if (domain.items.length === 0) return null;
              const domainCommentCount = domain.items.reduce((n, it) => n + it.comments.length, 0);
              return (
                <section key={domain.id} className={styles.iepDomain}>
                  <header className={styles.iepDomainHeader}>
                    <div className={styles.iepDomainName}>{domain.name}</div>
                    <div className={styles.iepDomainMeta}>
                      {domain.items.length} {domain.items.length === 1 ? "item" : "items"}
                      {domainCommentCount > 0 ? ` · ${domainCommentCount} comments` : ""}
                    </div>
                  </header>
                  <div>
                    {domain.items.map((item) => (
                      <IepItemRow
                        key={item.id}
                        goal={itemToGoal(item, domain.name)}
                        state={itemToState(item)}
                        selected={selectedItemId === item.id}
                        onSelect={() => onSelect(item.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>

        <aside className={styles.iepDrawer}>
          <IepCommentsDrawer
            studentName={student?.name ?? ""}
            comments={flatComments}
            selectedItemId={selectedItemId}
            selectedItemName={selectedRecord?.item.name ?? null}
            onClearFilter={() => setSelectedItemId(null)}
            onRemoveComment={onRemoveComment}
          />
        </aside>
      </div>

      {selectedGoal && (
        <IepCommentBar
          goal={selectedGoal}
          studentName={student?.name ?? ""}
          state={selectedItemState}
          onApply={onApplyBar}
          onCancel={() => setSelectedItemId(null)}
        />
      )}
    </div>
  );
}
