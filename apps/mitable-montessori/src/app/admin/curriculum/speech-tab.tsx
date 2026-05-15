"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { cardStyle } from "@/components/montessori/page-header";
import { Avatar, ToastBus } from "@/components/montessori/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tone = "clay" | "sage" | "butter" | "blue" | "terracotta";

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

type RosterRow = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  targetCount: number;
};

type TargetRow = { id: string; label: string; position: number };

export function SpeechAdminTab() {
  const [roster, setRoster] = React.useState<RosterRow[]>([]);
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [targets, setTargets] = React.useState<TargetRow[]>([]);
  const [loadingTargets, setLoadingTargets] = React.useState(false);
  const [onlyWithTargets, setOnlyWithTargets] = React.useState(true);

  const displayRoster = React.useMemo(() => {
    if (!onlyWithTargets) return roster;
    return roster.filter((s) => s.targetCount > 0);
  }, [roster, onlyWithTargets]);

  const refreshRoster = React.useCallback(async () => {
    const res = await fetch("/api/admin/speech/students", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as { students?: RosterRow[] };
    setRoster(data.students ?? []);
  }, []);

  React.useEffect(() => {
    void refreshRoster();
  }, [refreshRoster]);

  React.useEffect(() => {
    if (displayRoster.length === 0) {
      setStudentId(null);
      return;
    }
    setStudentId((cur) => {
      if (cur && displayRoster.some((s) => s.id === cur)) return cur;
      return displayRoster[0]!.id;
    });
  }, [displayRoster]);

  const refreshTargets = React.useCallback(async (sid: string) => {
    setLoadingTargets(true);
    try {
      const res = await fetch(`/api/admin/speech/targets?studentId=${sid}`, { cache: "no-store" });
      if (!res.ok) {
        setTargets([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { targets?: TargetRow[] };
      setTargets(data.targets ?? []);
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  React.useEffect(() => {
    if (!studentId) {
      setTargets([]);
      return;
    }
    void refreshTargets(studentId);
  }, [studentId, refreshTargets]);

  const student = displayRoster.find((s) => s.id === studentId) ?? null;

  const addTarget = async (label: string) => {
    if (!studentId || !label.trim()) return;
    const res = await fetch("/api/admin/speech/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId, label: label.trim() }),
    });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't add target." });
      return;
    }
    await refreshTargets(studentId);
    void refreshRoster();
  };

  const renameTarget = async (id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/admin/speech/targets/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: trimmed }),
    });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't rename." });
      return;
    }
    if (studentId) await refreshTargets(studentId);
  };

  const archiveTarget = async (id: string) => {
    const res = await fetch(`/api/admin/speech/targets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't remove." });
      return;
    }
    if (studentId) await refreshTargets(studentId);
    void refreshRoster();
  };

  const reorderTarget = async (id: string, dir: -1 | 1) => {
    const idx = targets.findIndex((t) => t.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= targets.length) return;
    const a = targets[idx]!;
    const b = targets[next]!;
    setTargets((prev) => {
      const copy = [...prev];
      copy[idx] = b;
      copy[next] = a;
      return copy;
    });
    await Promise.all([
      fetch(`/api/admin/speech/targets/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: b.position }),
      }),
      fetch(`/api/admin/speech/targets/${b.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: a.position }),
      }),
    ]);
  };

  return (
    <div style={{ padding: "20px 24px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {roster.length > 0 ? (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: "var(--color-ink-secondary)",
              cursor: "pointer",
              userSelect: "none",
              width: "fit-content",
            }}
          >
            <input
              type="checkbox"
              checked={onlyWithTargets}
              onChange={(e) => setOnlyWithTargets(e.target.checked)}
            />
            Only show children with speech targets
          </label>
        ) : null}
        {displayRoster.length === 0 && roster.length > 0 && onlyWithTargets ? (
          <div style={{ fontSize: 12.5, color: "var(--color-ink-muted)" }}>
            No students have speech targets yet. Turn off the filter above to pick any child and add
            targets.
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "thin",
            paddingBottom: 4,
          }}
        >
          {displayRoster.map((s) => {
            const active = s.id === studentId;
            const label = s.preferredName ?? s.firstName;
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
                  padding: "6px 12px 6px 6px",
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
                <Avatar
                  initials={initialsFor(`${s.firstName} ${s.lastName}`)}
                  tone={toneFor(s.id)}
                  size={24}
                />
                <span>{label}</span>
              </button>
            );
          })}
          {roster.length === 0 && (
            <span style={{ fontSize: 13, color: "var(--color-ink-muted)", padding: "6px 0" }}>
              No active students yet — add some on the Classrooms page.
            </span>
          )}
        </div>
      </div>

      <section style={cardStyle}>
        {!student ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--color-ink-muted)" }}>
            {roster.length > 0 && onlyWithTargets && displayRoster.length === 0
              ? "Turn off “Only show children with speech targets” above, pick a child, then add targets."
              : "Pick a child above to edit speech targets."}
          </div>
        ) : (
          <TargetsEditor
            student={student}
            targets={targets}
            loading={loadingTargets}
            onAdd={addTarget}
            onRename={renameTarget}
            onArchive={archiveTarget}
            onReorder={reorderTarget}
          />
        )}
      </section>
    </div>
  );
}

function TargetsEditor({
  student,
  targets,
  loading,
  onAdd,
  onRename,
  onArchive,
  onReorder,
}: {
  student: RosterRow;
  targets: TargetRow[];
  loading: boolean;
  onAdd: (label: string) => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onReorder: (id: string, dir: -1 | 1) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  return (
    <div style={{ padding: "20px 20px 24px" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>
          {student.firstName} {student.lastName}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-ink-muted)", marginTop: 4 }}>
          Ordered list of speech therapy targets for reports and the teacher Speech view.
        </div>
      </div>

      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--color-ink-secondary)",
        }}
      >
        Targets
      </h2>

      {loading ? (
        <div style={{ color: "var(--color-ink-muted)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {targets.length === 0 && !adding ? (
            <div
              style={{
                padding: "28px 20px",
                textAlign: "center",
                border: "1px dashed var(--color-border)",
                borderRadius: 14,
                color: "var(--color-ink-secondary)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>
                No targets yet
              </div>
              <Button onClick={() => setAdding(true)} style={{ marginTop: 14 }} type="button">
                <Plus size={16} strokeWidth={1.7} /> Add first target
              </Button>
            </div>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {targets.map((t, idx) => (
                <li
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-canvas)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--color-ink-muted)", width: 22 }}>
                    {idx + 1}.
                  </span>
                  <Input
                    defaultValue={t.label}
                    key={`${t.id}-${t.label}`}
                    className="flex-1"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== t.label) void onRename(t.id, v);
                    }}
                  />
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="tap rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-30"
                      aria-label="Move up"
                      disabled={idx === 0}
                      onClick={() => void onReorder(t.id, -1)}
                    >
                      <ArrowUp size={16} strokeWidth={1.6} />
                    </button>
                    <button
                      type="button"
                      className="tap rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-30"
                      aria-label="Move down"
                      disabled={idx === targets.length - 1}
                      onClick={() => void onReorder(t.id, 1)}
                    >
                      <ArrowDown size={16} strokeWidth={1.6} />
                    </button>
                    <button
                      type="button"
                      className="tap rounded-md p-1.5 text-[var(--color-ink-muted)] hover:text-[var(--status-error)]"
                      aria-label="Remove target"
                      onClick={() => void onArchive(t.id)}
                    >
                      <Trash2 size={16} strokeWidth={1.6} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {(targets.length > 0 || adding) && (
            <form
              style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}
              onSubmit={(e) => {
                e.preventDefault();
                const v = draft.trim();
                if (!v) return;
                void onAdd(v).then(() => {
                  setDraft("");
                  setAdding(false);
                });
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="New target…"
                className="min-w-[200px] flex-1"
              />
              <Button type="submit">Add target</Button>
              {targets.length === 0 && adding ? (
                <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              ) : null}
            </form>
          )}
        </>
      )}
    </div>
  );
}
