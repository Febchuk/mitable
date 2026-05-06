"use client";

import * as React from "react";
import { CHILDREN } from "@/components/montessori/data";
import { PageHeader } from "@/components/montessori/page-header";
import { Avatar, ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import {
  IEP_DOMAINS,
  goalsByDomain,
  type IepEntry,
  type IepGoal,
  type PerformanceBand,
  type PromptingCode,
} from "./data";
import { IepEntryModal } from "./iep-entry-modal";
import { IepGoalRow } from "./iep-grid";

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

type ModalState =
  | { mode: "closed" }
  | { mode: "create"; goal: IepGoal }
  | { mode: "edit"; goal: IepGoal; entry: IepEntry };

export function IepProgressFeature() {
  const store = useMontessori();
  const presentChildren = React.useMemo(() => CHILDREN.filter((c) => c.present), []);
  const [studentId, setStudentId] = React.useState<string>(
    () => presentChildren[0]?.id ?? CHILDREN[0]?.id ?? ""
  );
  const [modal, setModal] = React.useState<ModalState>({ mode: "closed" });

  const student = React.useMemo(
    () => CHILDREN.find((c) => c.id === studentId) ?? CHILDREN[0],
    [studentId]
  );
  const studentEntries = store.iepByStudent[studentId] || {};
  const grouped = React.useMemo(() => goalsByDomain(), []);

  // Header counts: total entries logged for this student across all goals.
  const totalEntries = React.useMemo(() => {
    let n = 0;
    for (const list of Object.values(studentEntries)) n += list.length;
    return n;
  }, [studentEntries]);

  const onAdd = React.useCallback((goal: IepGoal) => {
    setModal({ mode: "create", goal });
  }, []);

  const onEdit = React.useCallback((goal: IepGoal, entry: IepEntry) => {
    setModal({ mode: "edit", goal, entry });
  }, []);

  const onSave = React.useCallback(
    (args: {
      entryId?: string;
      performanceBand: PerformanceBand;
      successCount: number;
      promptingCode: PromptingCode;
      note?: string;
    }) => {
      if (modal.mode === "closed") return;
      const goal = modal.goal;
      store.upsertIepEntry({
        entryId: args.entryId,
        studentId,
        goalId: goal.id,
        domain: goal.domain,
        performanceBand: args.performanceBand,
        successCount: args.successCount,
        promptingCode: args.promptingCode,
        note: args.note,
      });
      ToastBus.push({
        message: args.entryId
          ? `Entry updated for ${student.name.split(" ")[0]}`
          : `Logged for ${student.name.split(" ")[0]} · ${goal.name}`,
      });
      setModal({ mode: "closed" });
    },
    [modal, store, studentId, student]
  );

  const onDelete = React.useCallback(
    (entryId: string) => {
      if (modal.mode !== "edit") return;
      store.removeIepEntry({
        studentId,
        goalId: modal.goal.id,
        entryId,
      });
      ToastBus.push({ message: "Entry deleted" });
      setModal({ mode: "closed" });
    },
    [modal, store, studentId]
  );

  return (
    <div>
      <PageHeader
        overline={`IEP progress · ${student.name.split(" ")[0]}`}
        title="IEP progress"
        subtitle={`${student.name} · ${totalEntries} ${totalEntries === 1 ? "entry" : "entries"} logged`}
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

      {/* Domain sections */}
      <div style={{ padding: "12px 16px 96px", display: "flex", flexDirection: "column", gap: 14 }}>
        {IEP_DOMAINS.map((domain) => {
          const goals = grouped[domain] || [];
          if (goals.length === 0) return null;
          const domainEntryCount = goals.reduce(
            (n, goal) => n + (studentEntries[goal.id]?.length ?? 0),
            0
          );
          return (
            <section
              key={domain}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <header
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  background: "var(--color-canvas)",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-ink)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {domain}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                  {goals.length} {goals.length === 1 ? "goal" : "goals"}
                  {domainEntryCount > 0 ? ` · ${domainEntryCount} logged` : ""}
                </div>
              </header>
              <div>
                {goals.map((goal) => (
                  <IepGoalRow
                    key={goal.id}
                    goal={goal}
                    entries={studentEntries[goal.id] || []}
                    onAdd={onAdd}
                    onEdit={onEdit}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <IepEntryModal
        open={modal.mode !== "closed"}
        studentName={student.name}
        goal={modal.mode === "closed" ? FALLBACK_GOAL : modal.goal}
        entry={modal.mode === "edit" ? modal.entry : null}
        onClose={() => setModal({ mode: "closed" })}
        onSave={onSave}
        onDelete={modal.mode === "edit" ? onDelete : undefined}
      />
    </div>
  );
}

// Modal is gated by `open`, but the prop type wants a goal regardless. This
// stand-in goal never reaches the screen.
const FALLBACK_GOAL: IepGoal = {
  id: "fallback",
  domain: "Sensory integration",
  name: "",
};
