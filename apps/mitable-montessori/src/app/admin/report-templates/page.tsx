"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, LayoutTemplate, Pencil, Trash2 } from "lucide-react";
import type { AdminReportTemplateDto } from "@/lib/report-templates/admin-dto";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToastBus } from "@/components/montessori/primitives";

export default function AdminReportTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<AdminReportTemplateDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AdminReportTemplateDto | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/templates", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        templates?: AdminReportTemplateDto[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Couldn't load templates");
      }
      setTemplates(data.templates ?? []);
    } catch (e) {
      ToastBus.push({ message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const duplicateTemplate = React.useCallback(
    async (id: string) => {
      setDuplicatingId(id);
      try {
        const res = await fetch(`/api/admin/templates/${id}/duplicate`, {
          method: "POST",
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          ToastBus.push({ message: data.error || "Couldn't duplicate template" });
          return;
        }
        ToastBus.push({ message: "Duplicated — opening the copy to edit." });
        router.push(`/admin/report-templates/${data.id}`);
      } finally {
        setDuplicatingId(null);
      }
    },
    [router]
  );

  const confirmDeleteTemplate = React.useCallback(async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/templates/${pendingDelete.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        ToastBus.push({ message: data.error || "Couldn't delete template" });
        return;
      }
      ToastBus.push({ message: "Template deleted" });
      setPendingDelete(null);
      await refresh();
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }, [pendingDelete, refresh, router]);

  return (
    <div>
      <PageHeader
        overline={
          <span className="inline-flex items-center gap-2">
            <LayoutTemplate size={14} strokeWidth={1.6} />
            Admin
          </span>
        }
        title="Report templates"
        subtitle="Define section structure, assistant guidance, tone, and an optional school logo. Duplicate a row to start from an existing template."
        actions={
          <Button asChild>
            <Link href="/admin/report-templates/new">New template</Link>
          </Button>
        }
      />

      <div style={{ padding: "24px" }}>
        {loading ? (
          <p style={{ color: "var(--color-ink-muted)", fontSize: 14 }}>Loading…</p>
        ) : templates.length === 0 ? (
          <p style={{ color: "var(--color-ink-secondary)", fontSize: 14 }}>
            No templates yet. Create one so teachers can start reports from your school structure.
          </p>
        ) : (
          <div style={{ ...cardStyle }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    Sections
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    Active
                  </th>
                  <th style={{ padding: "12px 16px", width: 240 }} />
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 500 }}>{t.name}</td>
                    <td style={{ padding: "12px 16px", color: "var(--color-ink-secondary)" }}>
                      {t.kind}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--color-ink-secondary)" }}>
                      {t.sections.length}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--color-ink-secondary)" }}>
                      {t.isActive ? "Yes" : "No"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/admin/report-templates/${t.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[var(--color-terracotta)] hover:bg-[var(--color-terracotta-soft)]"
                          onClick={() => router.prefetch(`/admin/report-templates/${t.id}`)}
                        >
                          <Pencil size={14} strokeWidth={1.6} />
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="tap inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-[var(--color-ink-secondary)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-50"
                          disabled={duplicatingId === t.id}
                          onClick={() => void duplicateTemplate(t.id)}
                        >
                          <Copy size={14} strokeWidth={1.6} aria-hidden />
                          {duplicatingId === t.id ? "Duplicating…" : "Duplicate"}
                        </button>
                        <button
                          type="button"
                          className="tap inline-flex items-center justify-center rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--status-error)] disabled:opacity-50"
                          aria-label={`Delete template ${t.name}`}
                          title="Delete template"
                          disabled={deleteBusy || duplicatingId === t.id}
                          onClick={() => setPendingDelete(t)}
                        >
                          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
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

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Delete this template?</DialogTitle>
            <DialogDescription>
              This removes{" "}
              <span className="font-medium text-ink">
                {pendingDelete?.name.trim() || "this template"}
              </span>{" "}
              for your school. Reports already created from it are unchanged. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-ink/15 bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas-muted"
              disabled={deleteBusy}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{
                borderColor: "rgba(232, 116, 116, 0.45)",
                color: "var(--status-error, #e87474)",
              }}
              disabled={deleteBusy}
              onClick={() => void confirmDeleteTemplate()}
            >
              {deleteBusy ? "Deleting…" : "Delete template"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
