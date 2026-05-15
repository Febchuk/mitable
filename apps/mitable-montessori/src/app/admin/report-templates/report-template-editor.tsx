"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import type {
  AdminReportTemplateDto,
  ReportingPeriod,
  ContextModeDefault,
} from "@/lib/report-templates/admin-dto";
import { REPORTING_PERIOD_LABEL, REPORTING_PERIOD_VALUES } from "@/lib/report-templates/admin-dto";
import type { TemplateSectionRow } from "@/lib/report-templates/sections";
import { PageHeader, cardHeaderStyle, cardStyle } from "@/components/montessori/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HandDivider, ToastBus } from "@/components/montessori/primitives";

const KINDS = ["Daily", "Major", "Incident"] as const;
const ICON_TONES = ["clay", "butter", "blue", "sage"] as const;

function emptySection(): TemplateSectionRow {
  return { section: "", description: "", fieldType: "text", options: [] };
}

type RowBundle = { id: string; row: TemplateSectionRow };

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function bundlesFromRows(rows: TemplateSectionRow[]): RowBundle[] {
  return rows.map((row) => ({ id: newRowId(), row }));
}

export function ReportTemplateEditor({
  mode,
  templateId,
}: {
  mode: "create" | "edit";
  templateId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(mode === "edit");
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [kind, setKind] = React.useState<(typeof KINDS)[number]>("Daily");
  const [iconTone, setIconTone] = React.useState<(typeof ICON_TONES)[number]>("clay");
  const [writingStyle, setWritingStyle] = React.useState("");
  const [reportingPeriod, setReportingPeriod] = React.useState<ReportingPeriod | null>(null);
  const [contextMode, setContextMode] = React.useState<ContextModeDefault>("history");
  const [bundles, setBundles] = React.useState<RowBundle[]>(() =>
    bundlesFromRows([emptySection()])
  );
  const [dragState, setDragState] = React.useState<{ from: number; over: number } | null>(null);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [duplicating, setDuplicating] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (mode !== "edit" || !templateId) return;
    setLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/templates/${templateId}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          template?: AdminReportTemplateDto;
          error?: string;
        };
        if (!res.ok || !data.template) {
          ToastBus.push({ message: data.error || "Couldn't load template" });
          router.replace("/admin/report-templates");
          return;
        }
        if (cancelled) return;
        const t = data.template;
        setName(t.name);
        setDescription(t.description ?? "");
        setKind(t.kind as (typeof KINDS)[number]);
        setIconTone(t.iconTone as (typeof ICON_TONES)[number]);
        setWritingStyle(t.writingStyle ?? "");
        setReportingPeriod(t.reportingPeriod ?? null);
        setContextMode(t.contextModeDefault ?? "history");
        setBundles(
          bundlesFromRows(t.templateSections.length ? t.templateSections : [emptySection()])
        );
        setLogoUrl(t.logoUrl);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, templateId, router]);

  const reorderBundles = React.useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setBundles((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed!);
      return next;
    });
  }, []);

  const clearDragState = React.useCallback(() => setDragState(null), []);

  const validate = (): boolean => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      ToastBus.push({ message: "Add a template name." });
      return false;
    }
    const filled = bundles.map((b) => ({
      section: b.row.section.trim(),
      description: (b.row.description ?? "").trim(),
      fieldType: b.row.fieldType ?? "text",
      options: (b.row.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0),
      curriculumProgram: b.row.curriculumProgram,
    }));
    if (filled.some((r) => !r.section)) {
      ToastBus.push({ message: "Every section needs a title." });
      return false;
    }
    const titles = filled.map((r) => r.section);
    if (new Set(titles).size !== titles.length) {
      ToastBus.push({ message: "Section titles must be unique." });
      return false;
    }
    if (
      filled.some(
        (r) =>
          (r.fieldType === "checklist" || r.fieldType === "single_select") && r.options.length === 0
      )
    ) {
      ToastBus.push({ message: "Option lists need at least one option." });
      return false;
    }
    if (filled.some((r) => r.fieldType === "hardcoded" && !r.description.trim())) {
      ToastBus.push({ message: "Fixed-text sections need the exact wording filled in." });
      return false;
    }
    if (filled.some((r) => r.fieldType === "curriculum" && !r.curriculumProgram)) {
      ToastBus.push({ message: "Curriculum sections need a program selected." });
      return false;
    }
    return true;
  };

  const buildPayload = () => ({
    name: name.trim(),
    description: description.trim() || null,
    kind,
    iconTone,
    writingStyle: writingStyle.trim(),
    reportingPeriod: reportingPeriod ?? null,
    contextModeDefault: contextMode,
    templateSections: bundles.map((b) => {
      const ft = b.row.fieldType ?? "text";
      return {
        section: b.row.section.trim(),
        description: (b.row.description ?? "").trim(),
        fieldType: ft,
        options:
          ft === "checklist" || ft === "single_select"
            ? (b.row.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0)
            : [],
        ...(ft === "curriculum" && b.row.curriculumProgram
          ? { curriculumProgram: b.row.curriculumProgram }
          : {}),
      };
    }),
  });

  const onSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/admin/templates", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          ToastBus.push({ message: data.error || "Couldn't create template" });
          return;
        }
        ToastBus.push({ message: "Template saved" });
        router.replace(`/admin/report-templates/${data.id}`);
        router.refresh();
        return;
      }
      const res = await fetch(`/api/admin/templates/${templateId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't save" });
        return;
      }
      ToastBus.push({ message: "Saved" });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const onLogoSelected = async (f: File | null) => {
    if (!f || mode !== "edit" || !templateId) return;
    if (f.size > 5 * 1024 * 1024) {
      ToastBus.push({ message: "Logo must be 5MB or smaller." });
      return;
    }
    const fd = new FormData();
    fd.set("file", f);
    const res = await fetch(`/api/admin/templates/${templateId}/logo`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
    if (!res.ok || !data.logoUrl) {
      ToastBus.push({ message: data.error || "Upload failed" });
      return;
    }
    setLogoUrl(data.logoUrl);
    ToastBus.push({ message: "Logo updated" });
    router.refresh();
  };

  const onRemoveLogo = async () => {
    if (!templateId) return;
    const res = await fetch(`/api/admin/templates/${templateId}/logo`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      ToastBus.push({ message: "Couldn't remove logo" });
      return;
    }
    setLogoUrl(null);
    ToastBus.push({ message: "Logo removed" });
    router.refresh();
  };

  const confirmDeleteTemplate = async () => {
    if (!templateId || mode !== "edit") return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        ToastBus.push({ message: "Couldn't delete" });
        return;
      }
      setDeleteDialogOpen(false);
      router.replace("/admin/report-templates");
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  };

  const onDuplicateTemplate = async () => {
    if (!templateId || mode !== "edit") return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/duplicate`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        ToastBus.push({ message: data.error || "Couldn't duplicate template" });
        return;
      }
      ToastBus.push({ message: "Duplicated. You're now editing the copy." });
      router.replace(`/admin/report-templates/${data.id}`);
      router.refresh();
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 48, color: "var(--color-ink-muted)", fontSize: 14 }}>Loading…</div>
    );
  }

  return (
    <div>
      <PageHeader
        overline={
          <Link
            href="/admin/report-templates"
            className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <ArrowLeft size={14} strokeWidth={1.6} />
            Report templates
          </Link>
        }
        title={mode === "create" ? "New template" : "Edit template"}
        subtitle="Logo and layout stay here for teachers; tone and section notes go to the assistant."
        actions={
          mode === "edit" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-[var(--color-border)] text-[var(--color-ink-secondary)]"
                disabled={duplicating}
                onClick={() => void onDuplicateTemplate()}
              >
                <Copy size={14} strokeWidth={1.6} className="mr-1.5 inline" aria-hidden />
                {duplicating ? "Duplicating…" : "Duplicate"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[var(--color-border)] text-[var(--color-ink-secondary)]"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      />

      <div style={{ padding: "24px", maxWidth: 720 }}>
        <div style={{ ...cardStyle }}>
          <div style={{ ...cardHeaderStyle, borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Basics</span>
          </div>
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                Template name
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sunflower daily"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                Short description (teachers see this when picking)
              </span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One line · what this template is for"
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                  Report type
                </span>
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                  Accent
                </span>
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
                  value={iconTone}
                  onChange={(e) => setIconTone(e.target.value as (typeof ICON_TONES)[number])}
                >
                  {ICON_TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                  Reporting period
                </span>
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
                  value={reportingPeriod ?? ""}
                  onChange={(e) => setReportingPeriod((e.target.value as ReportingPeriod) || null)}
                >
                  <option value="">None</option>
                  {REPORTING_PERIOD_VALUES.map((p) => (
                    <option key={p} value={p}>
                      {REPORTING_PERIOD_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                  AI context
                </span>
                <select
                  className="flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
                  value={contextMode}
                  onChange={(e) => setContextMode(e.target.value as ContextModeDefault)}
                >
                  <option value="history">Child history</option>
                  <option value="input_only">Current input only</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <HandDivider />

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={{ ...cardHeaderStyle, borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>School logo</span>
          </div>
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--color-ink-secondary)",
                lineHeight: 1.45,
              }}
            >
              Shown at the top of the report for families. Not sent to the writing assistant.
            </p>
            {logoUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <img src={logoUrl} alt="" style={{ maxHeight: 48, objectFit: "contain" }} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void onRemoveLogo()}
                >
                  Remove logo
                </Button>
              </div>
            ) : null}
            {mode === "edit" ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(e) => void onLogoSelected(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload logo
                </Button>
              </>
            ) : (
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--color-ink-muted)",
                  fontStyle: "italic",
                }}
              >
                Save the template first, then you can upload a logo.
              </p>
            )}
          </div>
        </div>

        <HandDivider />

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={{ ...cardHeaderStyle, borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Writing style</span>
          </div>
          <div style={{ padding: 18 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                Tone and voice (assistant only)
              </span>
              <Textarea
                value={writingStyle}
                onChange={(e) => setWritingStyle(e.target.value)}
                placeholder="e.g. Warm and concise; lead with observations; avoid jargon; address parents as partners."
                rows={5}
                className="resize-y border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]"
              />
            </label>
          </div>
        </div>

        <HandDivider />

        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div
            style={{
              ...cardHeaderStyle,
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14 }}>Sections</span>
            {bundles.length > 1 ? (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-ink-muted)",
                  fontWeight: 400,
                  lineHeight: 1.35,
                }}
              >
                Drag the grip to reorder.
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 gap-1 text-[var(--color-terracotta)]"
              onClick={() => setBundles((b) => [...b, { id: newRowId(), row: emptySection() }])}
            >
              <Plus size={14} strokeWidth={2} />
              Add section
            </Button>
          </div>
          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            {bundles.map((bundle, i) => {
              const row = bundle.row;
              const isDragging = dragState?.from === i;
              const isDropOver = dragState !== null && dragState.over === i && dragState.from !== i;
              return (
                <div
                  key={bundle.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragState === null) return;
                    if (dragState.over !== i) {
                      setDragState({ from: dragState.from, over: i });
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("text/plain");
                    const from = parseInt(raw, 10);
                    if (Number.isNaN(from) || from < 0 || from >= bundles.length) {
                      clearDragState();
                      return;
                    }
                    reorderBundles(from, i);
                    clearDragState();
                  }}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "stretch",
                    padding: 14,
                    paddingLeft: 10,
                    borderRadius: 10,
                    border: `1px solid ${
                      isDropOver
                        ? "color-mix(in srgb, var(--color-terracotta-deep) 42%, var(--color-border))"
                        : "var(--color-border)"
                    }`,
                    background: isDropOver
                      ? "color-mix(in srgb, var(--color-terracotta-soft) 55%, var(--color-muted))"
                      : "var(--color-muted)",
                    opacity: isDragging ? 0.58 : 1,
                    boxShadow: isDropOver
                      ? "0 0 0 1px color-mix(in srgb, var(--color-terracotta-deep) 22%, transparent)"
                      : undefined,
                    transition:
                      "opacity 0.14s ease, border-color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease",
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Reorder section ${i + 1}`}
                    aria-grabbed={isDragging}
                    draggable={bundles.length > 1}
                    onDragStart={(e) => {
                      if (bundles.length <= 1) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(i));
                      setDragState({ from: i, over: i });
                    }}
                    onDragEnd={() => clearDragState()}
                    className="tap flex shrink-0 cursor-grab select-none flex-col items-center justify-center rounded-lg border border-transparent text-[var(--color-ink-muted)] outline-none hover:border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] active:cursor-grabbing aria-grabbed:border-[var(--color-border)] aria-grabbed:bg-[var(--color-surface)]"
                    style={{ width: 32, alignSelf: "stretch", minHeight: 44 }}
                    onKeyDown={(e) => {
                      if (bundles.length <= 1) return;
                      if (e.key === "ArrowUp" && i > 0) {
                        e.preventDefault();
                        reorderBundles(i, i - 1);
                      } else if (e.key === "ArrowDown" && i < bundles.length - 1) {
                        e.preventDefault();
                        reorderBundles(i, i + 1);
                      }
                    }}
                  >
                    <GripVertical size={18} strokeWidth={1.75} aria-hidden />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                        Section {i + 1}
                      </span>
                      <button
                        type="button"
                        className="tap rounded-md p-1.5 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-terracotta-deep)]"
                        aria-label="Remove section"
                        onClick={() =>
                          bundles.length > 1 && setBundles((b) => b.filter((_, j) => j !== i))
                        }
                        disabled={bundles.length <= 1}
                      >
                        <Trash2 size={16} strokeWidth={1.6} />
                      </button>
                    </div>
                    <Input
                      value={row.section}
                      onChange={(e) =>
                        setBundles((prev) =>
                          prev.map((p, j) =>
                            j === i ? { ...p, row: { ...p.row, section: e.target.value } } : p
                          )
                        )
                      }
                      placeholder="Section heading"
                      className="mb-2"
                    />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                        Field type
                      </span>
                      <select
                        className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)]"
                        value={row.fieldType ?? "text"}
                        onChange={(e) => {
                          const next = e.target.value as TemplateSectionRow["fieldType"];
                          setBundles((prev) =>
                            prev.map((p, j) =>
                              j === i
                                ? {
                                    ...p,
                                    row: {
                                      ...p.row,
                                      fieldType: next,
                                      options:
                                        next === "checklist" || next === "single_select"
                                          ? (p.row.options ?? [])
                                          : [],
                                      curriculumProgram:
                                        next === "curriculum" ? "speech" : undefined,
                                    },
                                  }
                                : p
                            )
                          );
                        }}
                      >
                        <option value="text">Text</option>
                        <option value="checklist">Checklist (multi-select)</option>
                        <option value="single_select">Single-select</option>
                        <option value="hardcoded">Fixed text (school boilerplate)</option>
                        <option value="curriculum">Curriculum (speech targets)</option>
                      </select>
                    </div>
                    {row.fieldType === "checklist" || row.fieldType === "single_select" ? (
                      <ChecklistOptionsEditor
                        options={row.options ?? []}
                        onChange={(next) =>
                          setBundles((prev) =>
                            prev.map((p, j) =>
                              j === i ? { ...p, row: { ...p.row, options: next } } : p
                            )
                          )
                        }
                      />
                    ) : row.fieldType === "hardcoded" ? (
                      <Textarea
                        value={row.description}
                        onChange={(e) =>
                          setBundles((prev) =>
                            prev.map((p, j) =>
                              j === i ? { ...p, row: { ...p.row, description: e.target.value } } : p
                            )
                          )
                        }
                        placeholder="Exact wording for every report — teachers do not edit this in the report editor."
                        rows={5}
                        className="resize-y border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]"
                      />
                    ) : row.fieldType === "curriculum" ? (
                      <Textarea
                        value={row.description}
                        onChange={(e) =>
                          setBundles((prev) =>
                            prev.map((p, j) =>
                              j === i ? { ...p, row: { ...p.row, description: e.target.value } } : p
                            )
                          )
                        }
                        placeholder="Optional: extra instructions for the assistant. Section body is auto-filled from the child’s speech targets (Curriculum → Speech)."
                        rows={3}
                        className="resize-y border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]"
                      />
                    ) : (
                      <Textarea
                        value={row.description}
                        onChange={(e) =>
                          setBundles((prev) =>
                            prev.map((p, j) =>
                              j === i ? { ...p, row: { ...p.row, description: e.target.value } } : p
                            )
                          )
                        }
                        placeholder="What should the assistant write here? Facts to include, length, tone for this block."
                        rows={4}
                        className="resize-y border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)]"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save template"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/admin/report-templates">Cancel</Link>
          </Button>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Delete this template?</DialogTitle>
            <DialogDescription>
              This removes{" "}
              <span className="font-medium text-ink">{name.trim() || "this template"}</span> for
              your school. Reports already created from it are unchanged. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-ink/15 bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas-muted"
              disabled={deleteBusy}
              onClick={() => setDeleteDialogOpen(false)}
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

function ChecklistOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const addOption = () => {
    const v = draft.trim();
    if (!v) return;
    if (options.includes(v)) {
      ToastBus.push({ message: "That option is already on the list." });
      return;
    }
    onChange([...options, v]);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
        Checklist options
      </span>
      {options.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {options.map((opt, idx) => (
            <span
              key={`${opt}-${idx}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 8px 5px 10px",
                borderRadius: 999,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                fontSize: 12.5,
                color: "var(--color-ink)",
              }}
            >
              {opt}
              <button
                type="button"
                aria-label={`Remove ${opt}`}
                onClick={() => onChange(options.filter((_, j) => j !== idx))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: 0,
                  background: "transparent",
                  color: "var(--color-ink-muted)",
                  cursor: "pointer",
                }}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOption();
            }
          }}
          placeholder="Add an option (e.g. Modeling, Visual schedule)"
          className="h-9 bg-surface"
        />
        <Button type="button" size="sm" onClick={addOption} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
