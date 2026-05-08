"use client";

import * as React from "react";
import { CHILDREN } from "@/components/montessori/data";
import { PageHeader } from "@/components/montessori/page-header";
import { Avatar, ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import {
  IEP_DOMAINS,
  IEP_GOALS,
  emptyIepItem,
  goalsByDomain,
  type IepGoal,
  type IepItemState,
} from "./data";
import { IepCommentBar, type IepCommentBarApply } from "./iep-comment-bar";
import { IepCommentsDrawer } from "./iep-comments-drawer";
import { IepItemRow } from "./iep-grid";
import styles from "./iep.module.css";

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

export function IepProgressFeature() {
  const store = useMontessori();
  const presentChildren = React.useMemo(() => CHILDREN.filter((c) => c.present), []);
  const [studentId, setStudentId] = React.useState<string>(
    () => presentChildren[0]?.id ?? CHILDREN[0]?.id ?? ""
  );
  const [selectedGoalId, setSelectedGoalId] = React.useState<string | null>(null);

  const student = React.useMemo(
    () => CHILDREN.find((c) => c.id === studentId) ?? CHILDREN[0],
    [studentId]
  );
  const studentRow = store.iepState[studentId] ?? {};
  const grouped = React.useMemo(() => goalsByDomain(), []);
  const goalsById = React.useMemo(() => {
    const m = new Map<string, IepGoal>();
    for (const g of IEP_GOALS) m.set(g.id, g);
    return m;
  }, []);

  // Switching students closes any open item — comments would otherwise jump.
  React.useEffect(() => {
    setSelectedGoalId(null);
  }, [studentId]);

  const totalComments = React.useMemo(() => {
    let n = 0;
    for (const item of Object.values(studentRow)) n += item.comments.length;
    return n;
  }, [studentRow]);

  const selectedGoal = selectedGoalId ? (goalsById.get(selectedGoalId) ?? null) : null;
  const selectedItem: IepItemState =
    (selectedGoalId && studentRow[selectedGoalId]) || emptyIepItem();

  const onSelect = React.useCallback((goalId: string) => {
    setSelectedGoalId((prev) => (prev === goalId ? null : goalId));
  }, []);

  const onApplyBar = React.useCallback(
    (next: IepCommentBarApply) => {
      if (!selectedGoal) return;
      const fieldsChanged =
        next.rating !== selectedItem.rating ||
        next.successCount !== selectedItem.successCount ||
        next.promptingCode !== selectedItem.promptingCode;
      if (fieldsChanged) {
        store.setIepItemFields({
          studentId,
          goalId: selectedGoal.id,
          domain: selectedGoal.domain,
          rating: next.rating,
          successCount: next.successCount,
          promptingCode: next.promptingCode,
        });
      }
      const trimmed = next.comment.trim();
      if (trimmed) {
        store.addIepComment({
          studentId,
          goalId: selectedGoal.id,
          domain: selectedGoal.domain,
          text: trimmed,
        });
      }
      const firstName = student.name.split(" ")[0];
      ToastBus.push({
        message: trimmed
          ? `Updated · comment saved for ${firstName}`
          : fieldsChanged
            ? `Updated · ${firstName}`
            : "No changes",
      });
      setSelectedGoalId(null);
    },
    [selectedGoal, selectedItem, store, studentId, student]
  );

  const onRemoveComment = React.useCallback(
    (args: { goalId: string; commentId: string }) => {
      store.removeIepComment({ studentId, goalId: args.goalId, commentId: args.commentId });
    },
    [store, studentId]
  );

  return (
    <div className={styles.iepRoot}>
      <PageHeader
        overline={`IEP progress · ${student.name.split(" ")[0]}`}
        title="Progress"
        subtitle={`${student.name} · ${totalComments} ${totalComments === 1 ? "comment" : "comments"} on file`}
      />

      {/* Student picker — horizontal scroll of avatars/chips. */}
      <div
        style={{
          padding: "12px 16px 4px",
          display: "flex",
          gap: 8,
          overflowX: "auto",
          scrollbarWidth: "thin",
        }}
      >
        {presentChildren.map((c) => {
          const active = c.id === studentId;
          return (
            <button
              key={c.id}
              type="button"
              className="tap"
              onClick={() => setStudentId(c.id)}
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
              <Avatar initials={initialsFor(c.name)} tone={c.tone} size={24} />
              {c.name.split(" ")[0]}
            </button>
          );
        })}
      </div>

      <div className={styles.iepLayout}>
        <div className={styles.iepMain}>
          {IEP_DOMAINS.map((domain) => {
            const goals = grouped[domain] || [];
            if (goals.length === 0) return null;
            const domainCommentCount = goals.reduce(
              (n, goal) => n + (studentRow[goal.id]?.comments.length ?? 0),
              0
            );
            return (
              <section key={domain} className={styles.iepDomain}>
                <header className={styles.iepDomainHeader}>
                  <div className={styles.iepDomainName}>{domain}</div>
                  <div className={styles.iepDomainMeta}>
                    {goals.length} {goals.length === 1 ? "item" : "items"}
                    {domainCommentCount > 0 ? ` · ${domainCommentCount} comments` : ""}
                  </div>
                </header>
                <div>
                  {goals.map((goal) => {
                    const state = studentRow[goal.id] ?? emptyIepItem();
                    return (
                      <IepItemRow
                        key={goal.id}
                        goal={goal}
                        state={state}
                        selected={selectedGoalId === goal.id}
                        onSelect={() => onSelect(goal.id)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <aside className={styles.iepDrawer}>
          <IepCommentsDrawer
            studentId={studentId}
            studentName={student.name}
            goalsById={goalsById}
            iepState={store.iepState}
            selectedGoalId={selectedGoalId}
            onClearFilter={() => setSelectedGoalId(null)}
            onRemoveComment={onRemoveComment}
          />
        </aside>
      </div>

      {selectedGoal && (
        <IepCommentBar
          goal={selectedGoal}
          studentName={student.name}
          state={selectedItem}
          onApply={onApplyBar}
          onCancel={() => setSelectedGoalId(null)}
        />
      )}
    </div>
  );
}
