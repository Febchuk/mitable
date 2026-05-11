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
  domainCount: number;
  itemCount: number;
};

type PlanItem = { id: string; name: string; position: number };
type PlanDomain = { id: string; name: string; position: number; items: PlanItem[] };

export function IepAdminTab() {
  const [roster, setRoster] = React.useState<RosterRow[]>([]);
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [domains, setDomains] = React.useState<PlanDomain[]>([]);
  const [loadingPlan, setLoadingPlan] = React.useState(false);

  const refreshRoster = React.useCallback(async () => {
    const res = await fetch("/api/admin/iep/students", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as { students?: RosterRow[] };
    setRoster(data.students ?? []);
    setStudentId((current) => current ?? data.students?.[0]?.id ?? null);
  }, []);

  React.useEffect(() => {
    void refreshRoster();
  }, [refreshRoster]);

  const refreshPlan = React.useCallback(async (sid: string) => {
    setLoadingPlan(true);
    try {
      const res = await fetch(`/api/admin/iep/plan?studentId=${sid}`, { cache: "no-store" });
      if (!res.ok) {
        setDomains([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { domains?: PlanDomain[] };
      setDomains(data.domains ?? []);
    } finally {
      setLoadingPlan(false);
    }
  }, []);

  React.useEffect(() => {
    if (!studentId) {
      setDomains([]);
      return;
    }
    void refreshPlan(studentId);
  }, [studentId, refreshPlan]);

  const student = roster.find((s) => s.id === studentId) ?? null;

  const addDomain = async (name: string) => {
    if (!studentId || !name.trim()) return;
    const res = await fetch("/api/admin/iep/domains", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId, name: name.trim() }),
    });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't add domain." });
      return;
    }
    await refreshPlan(studentId);
    void refreshRoster();
  };

  const renameDomain = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/admin/iep/domains/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't rename." });
      return;
    }
    if (studentId) await refreshPlan(studentId);
  };

  const archiveDomain = async (id: string) => {
    if (
      !window.confirm("Remove this domain and all of its items? Existing comments stay attached.")
    ) {
      return;
    }
    const res = await fetch(`/api/admin/iep/domains/${id}`, { method: "DELETE" });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't remove." });
      return;
    }
    if (studentId) await refreshPlan(studentId);
    void refreshRoster();
  };

  const reorderDomain = async (id: string, dir: -1 | 1) => {
    const idx = domains.findIndex((d) => d.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= domains.length) return;
    const a = domains[idx]!;
    const b = domains[next]!;
    // Optimistic swap.
    setDomains((prev) => {
      const copy = [...prev];
      copy[idx] = b;
      copy[next] = a;
      return copy;
    });
    await Promise.all([
      fetch(`/api/admin/iep/domains/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: b.position }),
      }),
      fetch(`/api/admin/iep/domains/${b.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: a.position }),
      }),
    ]);
  };

  const addItem = async (domainId: string, name: string) => {
    if (!name.trim()) return;
    const res = await fetch("/api/admin/iep/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domainId, name: name.trim() }),
    });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't add item." });
      return;
    }
    if (studentId) await refreshPlan(studentId);
    void refreshRoster();
  };

  const renameItem = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/admin/iep/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't rename." });
      return;
    }
    if (studentId) await refreshPlan(studentId);
  };

  const archiveItem = async (id: string) => {
    const res = await fetch(`/api/admin/iep/items/${id}`, { method: "DELETE" });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't remove." });
      return;
    }
    if (studentId) await refreshPlan(studentId);
    void refreshRoster();
  };

  const reorderItem = async (domainId: string, id: string, dir: -1 | 1) => {
    const domain = domains.find((d) => d.id === domainId);
    if (!domain) return;
    const items = domain.items;
    const idx = items.findIndex((i) => i.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= items.length) return;
    const a = items[idx]!;
    const b = items[next]!;
    setDomains((prev) =>
      prev.map((d) => {
        if (d.id !== domainId) return d;
        const copy = [...d.items];
        copy[idx] = b;
        copy[next] = a;
        return { ...d, items: copy };
      })
    );
    await Promise.all([
      fetch(`/api/admin/iep/items/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: b.position }),
      }),
      fetch(`/api/admin/iep/items/${b.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ position: a.position }),
      }),
    ]);
  };

  return (
    <div style={{ padding: "20px 24px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Student chip row — same shape as the teacher view. */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          scrollbarWidth: "thin",
          paddingBottom: 4,
        }}
      >
        {roster.map((s) => {
          const active = s.id === studentId;
          const label = s.preferredName ?? s.firstName;
          const tone = toneFor(s.id);
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
                tone={tone}
                size={24}
              />
              <span>
                {label}
                {s.itemCount > 0 ? (
                  <span
                    style={{
                      marginLeft: 6,
                      opacity: 0.6,
                      fontSize: 11,
                      fontWeight: 400,
                    }}
                  >
                    {s.itemCount}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        {roster.length === 0 && (
          <span style={{ fontSize: 13, color: "var(--color-ink-muted)", padding: "6px 0" }}>
            No active students yet — add some on the Classrooms page.
          </span>
        )}
      </div>

      <section style={cardStyle}>
        {!student ? (
          <div style={{ padding: 28, textAlign: "center", color: "var(--color-ink-muted)" }}>
            Pick a child above to start their IEP plan.
          </div>
        ) : (
          <PlanEditor
            student={student}
            domains={domains}
            loading={loadingPlan}
            onAddDomain={addDomain}
            onRenameDomain={renameDomain}
            onArchiveDomain={archiveDomain}
            onReorderDomain={reorderDomain}
            onAddItem={addItem}
            onRenameItem={renameItem}
            onArchiveItem={archiveItem}
            onReorderItem={reorderItem}
          />
        )}
      </section>
    </div>
  );
}

function PlanEditor({
  student,
  domains,
  loading,
  onAddDomain,
  onRenameDomain,
  onArchiveDomain,
  onReorderDomain,
  onAddItem,
  onRenameItem,
  onArchiveItem,
  onReorderItem,
}: {
  student: RosterRow;
  domains: PlanDomain[];
  loading: boolean;
  onAddDomain: (name: string) => Promise<void>;
  onRenameDomain: (id: string, name: string) => Promise<void>;
  onArchiveDomain: (id: string) => Promise<void>;
  onReorderDomain: (id: string, dir: -1 | 1) => Promise<void>;
  onAddItem: (domainId: string, name: string) => Promise<void>;
  onRenameItem: (id: string, name: string) => Promise<void>;
  onArchiveItem: (id: string) => Promise<void>;
  onReorderItem: (domainId: string, id: string, dir: -1 | 1) => Promise<void>;
}) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const totalItems = domains.reduce((n, d) => n + d.items.length, 0);

  const submit = async () => {
    if (!draft.trim()) return;
    await onAddDomain(draft);
    setDraft("");
    setAdding(false);
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
            {student.firstName} {student.lastName}&rsquo;s IEP plan
          </h2>
          <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}>
            {domains.length} domain{domains.length === 1 ? "" : "s"} · {totalItems} item
            {totalItems === 1 ? "" : "s"} · graded against rating, completion, prompt
          </div>
        </div>
        <Button variant="default" onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={1.7} /> Add domain
        </Button>
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        {adding && (
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
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              placeholder="New domain (e.g. Sensory integration, Self-help skills)"
              className="h-10 bg-surface"
            />
            <Button type="button" onClick={() => void submit()} disabled={!draft.trim()}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {loading ? (
          <div style={{ color: "var(--color-ink-muted)", fontSize: 13 }}>Loading plan…</div>
        ) : domains.length === 0 && !adding ? (
          <div
            style={{
              padding: "32px 24px",
              textAlign: "center",
              border: "1px dashed var(--color-border)",
              borderRadius: 14,
              color: "var(--color-ink-secondary)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>
              {student.firstName} doesn&rsquo;t have an IEP plan yet
            </div>
            <div style={{ fontSize: 13, marginTop: 6, maxWidth: 420, marginInline: "auto" }}>
              Add a domain to start — for example &quot;Language and communication&quot; or
              &quot;Fine motor skills&quot;. Items inside each domain become the goals teachers
              grade against rating / completion / prompt.
            </div>
            <Button onClick={() => setAdding(true)} style={{ marginTop: 16 }}>
              <Plus size={16} strokeWidth={1.7} /> Add first domain
            </Button>
          </div>
        ) : (
          domains.map((d, idx) => (
            <DomainCard
              key={d.id}
              domain={d}
              isFirst={idx === 0}
              isLast={idx === domains.length - 1}
              onRenameDomain={(name) => onRenameDomain(d.id, name)}
              onArchiveDomain={() => onArchiveDomain(d.id)}
              onMoveUp={() => onReorderDomain(d.id, -1)}
              onMoveDown={() => onReorderDomain(d.id, 1)}
              onAddItem={(name) => onAddItem(d.id, name)}
              onRenameItem={(id, name) => onRenameItem(id, name)}
              onArchiveItem={(id) => onArchiveItem(id)}
              onReorderItem={(id, dir) => onReorderItem(d.id, id, dir)}
            />
          ))
        )}
      </div>
    </>
  );
}

function DomainCard({
  domain,
  isFirst,
  isLast,
  onRenameDomain,
  onArchiveDomain,
  onMoveUp,
  onMoveDown,
  onAddItem,
  onRenameItem,
  onArchiveItem,
  onReorderItem,
}: {
  domain: PlanDomain;
  isFirst: boolean;
  isLast: boolean;
  onRenameDomain: (name: string) => Promise<void>;
  onArchiveDomain: () => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onAddItem: (name: string) => Promise<void>;
  onRenameItem: (id: string, name: string) => Promise<void>;
  onArchiveItem: (id: string) => Promise<void>;
  onReorderItem: (id: string, dir: -1 | 1) => Promise<void>;
}) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const submit = async () => {
    if (!draft.trim()) return;
    await onAddItem(draft);
    setDraft("");
    setAdding(false);
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
          flexWrap: "wrap",
        }}
      >
        <InlineEditableText
          value={domain.name}
          onCommit={onRenameDomain}
          textStyle={{ fontSize: 16, fontWeight: 700, color: "var(--color-ink)" }}
        />
        <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {domain.items.length} item{domain.items.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={1.7} /> Add item
        </Button>
        <button
          type="button"
          className="tap rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] disabled:opacity-40"
          aria-label="Move domain up"
          onClick={() => void onMoveUp()}
          disabled={isFirst}
        >
          <ArrowUp size={16} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="tap rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] disabled:opacity-40"
          aria-label="Move domain down"
          onClick={() => void onMoveDown()}
          disabled={isLast}
        >
          <ArrowDown size={16} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="tap rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-terracotta-deep)]"
          aria-label="Remove domain"
          onClick={() => void onArchiveDomain()}
        >
          <Trash2 size={16} strokeWidth={1.6} />
        </button>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {adding && (
          <div
            style={{
              border: "1px dashed var(--color-border)",
              borderRadius: 10,
              padding: 10,
              display: "flex",
              gap: 8,
              alignItems: "center",
              background: "var(--color-canvas)",
            }}
          >
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              placeholder="New item (e.g. Requests preferred item using 3+ words)"
              className="h-9 bg-surface"
            />
            <Button type="button" size="sm" onClick={() => void submit()} disabled={!draft.trim()}>
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}

        {domain.items.length === 0 && !adding ? (
          <div style={{ padding: "8px 4px", color: "var(--color-ink-muted)", fontSize: 13 }}>
            No items yet.
          </div>
        ) : (
          domain.items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              isFirst={idx === 0}
              isLast={idx === domain.items.length - 1}
              onRename={(name) => onRenameItem(item.id, name)}
              onArchive={() => onArchiveItem(item.id)}
              onMoveUp={() => onReorderItem(item.id, -1)}
              onMoveDown={() => onReorderItem(item.id, 1)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ItemRow({
  item,
  isFirst,
  isLast,
  onRename,
  onArchive,
  onMoveUp,
  onMoveDown,
}: {
  item: PlanItem;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--color-canvas)",
        border: "1px solid var(--color-border)",
      }}
    >
      <InlineEditableText
        value={item.name}
        onCommit={onRename}
        textStyle={{ fontSize: 13.5, color: "var(--color-ink)" }}
      />
      <div style={{ flex: 1 }} />
      <button
        type="button"
        className="tap rounded-md p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-40"
        aria-label="Move item up"
        onClick={() => void onMoveUp()}
        disabled={isFirst}
      >
        <ArrowUp size={14} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        className="tap rounded-md p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-40"
        aria-label="Move item down"
        onClick={() => void onMoveDown()}
        disabled={isLast}
      >
        <ArrowDown size={14} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        className="tap rounded-md p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-terracotta-deep)]"
        aria-label="Remove item"
        onClick={() => void onArchive()}
      >
        <Trash2 size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}

function InlineEditableText({
  value,
  onCommit,
  textStyle,
}: {
  value: string;
  onCommit: (next: string) => Promise<void> | void;
  textStyle?: React.CSSProperties;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = async () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) {
      await onCommit(draft.trim());
    } else {
      setDraft(value);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        style={{
          ...textStyle,
          padding: "2px 6px",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          background: "var(--color-surface)",
          minWidth: 180,
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{
        ...textStyle,
        background: "transparent",
        border: 0,
        padding: 0,
        cursor: "text",
        textAlign: "left",
        font: "inherit",
      }}
    >
      {value}
    </button>
  );
}
