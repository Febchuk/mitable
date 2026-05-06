"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutTemplate, Pencil } from "lucide-react";
import type { AdminReportTemplateDto } from "@/lib/report-templates/admin-dto";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Button } from "@/components/ui/button";
import { ToastBus } from "@/components/montessori/primitives";

export default function AdminReportTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<AdminReportTemplateDto[]>([]);
  const [loading, setLoading] = React.useState(true);

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
        subtitle="Define section structure, assistant guidance, tone, and an optional school logo."
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
                  <th style={{ padding: "12px 16px", width: 96 }} />
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
                      <Link
                        href={`/admin/report-templates/${t.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[var(--color-terracotta)] hover:bg-[var(--color-terracotta-soft)]"
                        onClick={() => router.prefetch(`/admin/report-templates/${t.id}`)}
                      >
                        <Pencil size={14} strokeWidth={1.6} />
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
