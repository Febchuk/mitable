"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ToastBus } from "../primitives";
import { useMontessori } from "../store";
import { useIsMobile } from "../child-detail/use-is-mobile";
import type { Tone } from "../data";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { NewReportModal } from "./new-report-modal";
import { NewReportMobile } from "./new-report-mobile";
import type { PickerChild } from "./child-picker";
import { type NewReportPayload, type ReportTemplate } from "./mock-data";
import "./new-report.css";

const TONE_CYCLE: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONE_CYCLE[Math.abs(h) % TONE_CYCLE.length];
}

type CapturedToday = Record<string, { voice: number; photos: number }>;

type ApiTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  kind: ReportTemplate["kind"];
  sections: string[];
  sectionMeta: SectionMeta | null;
  logoUrl: string | null;
  iconTone: ReportTemplate["iconTone"];
};

type NewReportTriggerProps = {
  /** Controlled open state (e.g. hero CTA on reports landing). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, only the sheet/mobile flow renders — no "+ New report" chip. */
  hideButton?: boolean;
  /** After create, navigate here (`{id}` replaced). Default report-first path. */
  createdReportHref?: (reportId: string) => string;
};

/** Opens new-report flow — desktop modal or mobile full-screen steps. */
export function NewReportTrigger({
  open: openProp,
  onOpenChange,
  hideButton = false,
  createdReportHref = (id) => `/app/reports/${id}`,
}: NewReportTriggerProps = {}) {
  const [openInternal, setOpenInternal] = React.useState(false);
  const open = openProp ?? openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;
  const [submitting, setSubmitting] = React.useState(false);
  const [roster, setRoster] = React.useState<PickerChild[]>([]);
  const [templates, setTemplates] = React.useState<ReportTemplate[]>([]);
  const [capturedToday, setCapturedToday] = React.useState<CapturedToday>({});
  const [loaded, setLoaded] = React.useState(false);

  const mobile = useIsMobile();
  const router = useRouter();
  const classroomName = useMontessori().classroomProgress?.classroomName?.trim() || "Classroom";

  // Lazy-load on first open.
  React.useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    void Promise.all([
      fetch("/api/v1/templates", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/roster", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/v1/captured-today", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([tpls, rost, capt]) => {
        if (cancelled) return;
        const tplRows = ((tpls?.templates ?? []) as ApiTemplateRow[]).map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description ?? "",
          kind: t.kind,
          sections: t.sections,
          sectionMeta: t.sectionMeta ?? {},
          logoUrl: t.logoUrl ?? null,
          iconTone: t.iconTone,
        }));
        setTemplates(tplRows);
        const rosterRows = (
          (rost?.rows ?? []) as Array<{ id: string; fullName: string; age: string | null }>
        ).map((r) => ({
          id: r.id,
          name: r.fullName,
          age: r.age,
          tone: toneFor(r.id),
        }));
        setRoster(rosterRows);
        setCapturedToday(capt?.counts ?? {});
        setLoaded(true);
      })
      .catch((err) => {
        console.error("new-report data fetch failed", err);
        ToastBus.push({ message: "Couldn't load roster/templates. Try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const onSubmit = React.useCallback(
    async (payload: NewReportPayload) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        // No audio / handwritten notes any more — the assistant drafts the
        // empty template. The backend still accepts the legacy capture
        // fields; we send them as empty so the "from scratch" code path
        // runs server-side.
        const res = await fetch("/api/v1/reports", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            childId: payload.childId,
            kind: payload.kind,
            templateId: payload.templateId,
            transcripts: [],
            notes: [],
            tokenMap: [],
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          ToastBus.push({ message: j.error || "Couldn't create the report." });
          return;
        }
        const json = (await res.json()) as { reportId: string };
        const child = roster.find((c) => c.id === payload.childId);
        ToastBus.push({
          message: child
            ? `Drafting ${payload.kind.toLowerCase()} report for ${child.name.split(" ")[0]}…`
            : "Drafting new report…",
        });
        setOpen(false);
        router.push(createdReportHref(json.reportId));
      } finally {
        setSubmitting(false);
      }
    },
    [router, roster, submitting, createdReportHref, setOpen]
  );

  return (
    <>
      {!hideButton ? (
        <button
          type="button"
          className="tap nr-trigger"
          onClick={() => setOpen(true)}
          aria-label="New report"
        >
          <Plus size={14} strokeWidth={2} />
          <span>New report</span>
        </button>
      ) : null}

      {!mobile && (
        <NewReportModal
          open={open}
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
          roster={roster}
          capturedToday={capturedToday}
          templates={templates}
          submitting={submitting}
          classroomName={classroomName}
        />
      )}
      {mobile && (
        <NewReportMobile
          open={open}
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
          roster={roster}
          capturedToday={capturedToday}
          templates={templates}
          submitting={submitting}
          classroomName={classroomName}
        />
      )}
    </>
  );
}
