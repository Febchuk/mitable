"use client";

import * as React from "react";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type TermRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

function formatRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function AdminTermsPage() {
  const [terms, setTerms] = React.useState<TermRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TermRow | null>(null);
  const [name, setName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<TermRow | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/school-terms", { cache: "no-store" });
      const data = (await res.json()) as { terms?: TermRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't load terms");
      setTerms(data.terms ?? []);
    } catch (e) {
      ToastBus.push({ message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setStartDate("");
    setEndDate("");
    setDialogOpen(true);
  };

  const openEdit = (term: TermRow) => {
    setEditing(term);
    setName(term.name);
    setStartDate(term.startDate);
    setEndDate(term.endDate);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim() || !startDate || !endDate) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/school-terms", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editing
            ? { term_id: editing.id, name: name.trim(), start_date: startDate, end_date: endDate }
            : { name: name.trim(), start_date: startDate, end_date: endDate }
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save term");
      ToastBus.push({ message: editing ? "Term updated" : "Term added" });
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      ToastBus.push({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/school-terms", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term_id: pendingDelete.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't delete term");
      ToastBus.push({ message: "Term deleted" });
      setPendingDelete(null);
      await refresh();
    } catch (e) {
      ToastBus.push({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Terms"
        subtitle="Set start and end dates for each school term. End-of-term reports pull progress from the current term's start date."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus size={14} strokeWidth={2} />
            New term
          </Button>
        }
      />

      <div style={{ padding: 24 }}>
        {loading ? (
          <p style={{ color: "var(--color-ink-muted)", fontSize: 14 }}>Loading…</p>
        ) : terms.length === 0 ? (
          <div style={{ ...cardStyle, padding: 24, maxWidth: 480 }}>
            <CalendarRange
              size={20}
              strokeWidth={1.5}
              style={{ color: "var(--color-ink-muted)" }}
            />
            <p style={{ marginTop: 12, fontSize: 14, color: "var(--color-ink-secondary)" }}>
              No terms yet. Add your first term so end-of-term reports know which progress to
              include.
            </p>
            <Button type="button" style={{ marginTop: 16 }} onClick={openCreate}>
              Add a term
            </Button>
          </div>
        ) : (
          <div style={{ ...cardStyle }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600 }}>
                    Dates
                  </th>
                  <th style={{ width: 88, padding: "10px 14px" }} />
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 500 }}>{term.name}</td>
                    <td style={{ padding: "12px 14px", color: "var(--color-ink-secondary)" }}>
                      {formatRange(term.startDate, term.endDate)}
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="tap"
                          aria-label={`Edit ${term.name}`}
                          onClick={() => openEdit(term)}
                          style={iconBtnStyle}
                        >
                          <Pencil size={14} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="tap"
                          aria-label={`Delete ${term.name}`}
                          onClick={() => setPendingDelete(term)}
                          style={iconBtnStyle}
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit term" : "New term"}</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            <label style={labelStyle}>
              Name
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fall 2026"
              />
            </label>
            <label style={labelStyle}>
              Start date
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label style={labelStyle}>
              End date
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <Button
              type="button"
              disabled={busy || !name.trim() || !startDate || !endDate}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Add term"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
          </DialogHeader>
          <p style={{ fontSize: 14, color: "var(--color-ink-secondary)", marginTop: 8 }}>
            End-of-term reports won&apos;t be able to use this date range anymore.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-ink-secondary)",
};

const iconBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-ink-muted)",
  cursor: "pointer",
};
