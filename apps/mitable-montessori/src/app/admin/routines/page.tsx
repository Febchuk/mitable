"use client";

import * as React from "react";
import { Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TODDLER_ROUTINE_CATEGORIES,
  TODDLER_ROUTINE_CATEGORY_LABELS,
  type ToddlerRoutineCategory,
  type ToddlerRoutineOption,
} from "@/lib/toddler-routines";

export default function AdminRoutinesPage() {
  const [options, setOptions] = React.useState<ToddlerRoutineOption[]>([]);
  const [category, setCategory] = React.useState<ToddlerRoutineCategory>("activity");
  const [newLabel, setNewLabel] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingLabel, setEditingLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch("/api/admin/toddler-routines", { cache: "no-store" });
      const data = (await response.json()) as { options?: ToddlerRoutineOption[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn't load routines");
      setOptions(data.options ?? []);
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addOption() {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/toddler-routines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, label }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn't add option");
      setNewLabel("");
      ToastBus.push({ message: "Option added" });
      await refresh();
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function updateOption(id: string, update: { label?: string; isActive?: boolean }) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/toddler-routines", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...update }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Couldn't update option");
      setEditingId(null);
      await refresh();
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const visible = options.filter((option) => option.category === category);

  return (
    <div>
      <PageHeader
        title="Routines"
        subtitle="Choose the options teachers use when completing toddler Daily Logs."
      />
      <div style={{ padding: 24, display: "grid", gap: 18, maxWidth: 900 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TODDLER_ROUTINE_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              style={{
                border: "1px solid var(--color-border)",
                background: category === item ? "var(--color-accent-soft)" : "var(--color-surface)",
                color: "var(--color-ink)",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: category === item ? 650 : 500,
              }}
            >
              {TODDLER_ROUTINE_CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>

        <section style={{ ...cardStyle, padding: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{TODDLER_ROUTINE_CATEGORY_LABELS[category]}</h2>
          <p style={{ margin: "5px 0 16px", fontSize: 13, color: "var(--color-ink-muted)" }}>
            Active options appear in the teacher&apos;s Daily Log. Turn one off to keep past logs
            intact.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addOption();
              }}
              placeholder={`Add ${TODDLER_ROUTINE_CATEGORY_LABELS[category].toLowerCase()} option`}
            />
            <Button
              type="button"
              disabled={busy || !newLabel.trim()}
              onClick={() => void addOption()}
            >
              <Plus size={15} /> Add
            </Button>
          </div>
          {loading ? (
            <p style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>Loading…</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {visible.map((option) => (
                <div
                  key={option.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--color-border)",
                    opacity: option.isActive ? 1 : 0.62,
                  }}
                >
                  {editingId === option.id ? (
                    <Input
                      autoFocus
                      value={editingLabel}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontSize: 14 }}>
                      {option.label}
                      {!option.isActive ? " (off)" : ""}
                    </span>
                  )}
                  {editingId === option.id ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busy || !editingLabel.trim()}
                        onClick={() => void updateOption(option.id, { label: editingLabel.trim() })}
                      >
                        <Check size={14} /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X size={14} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(option.id);
                          setEditingLabel(option.label);
                        }}
                      >
                        <Pencil size={14} /> Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void updateOption(option.id, { isActive: !option.isActive })}
                      >
                        {option.isActive ? <X size={14} /> : <RotateCcw size={14} />}
                        {option.isActive ? "Turn off" : "Restore"}
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
