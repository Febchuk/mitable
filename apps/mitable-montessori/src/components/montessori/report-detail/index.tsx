"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import { ToastBus } from "../primitives";
import { ChatPane } from "./chat-pane";
import { ReportPane } from "./report-pane";
import { ReportTopBar } from "./top-bar";
import "./report-detail.css";
import {
  clearStoredDraftCapture,
  readStoredDraftCapture,
} from "@/lib/capture/draft-capture-storage";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DIRTY_LABEL = "Unsaved changes";
const SAVING_LABEL = "Saving…";

type LocalSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
};

type LocalDetail = {
  title: string;
  observer: string;
  classroom: string;
  dayLabel: string;
  savedMeta: string;
  sources: { voiceNotes: number; photos: number; worksheets: number };
  visibleTo: string[];
  sections: LocalSection[];
};

/** Calendar line for the report — uses `locale` via `useUiLocale` for hydration-safe Intl. */
function fmtDay(d: string | null | undefined, locale: string): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
}

/** Relative saved-at label using the user's UI locale. */
function relSavedAt(updatedAt: string, locale: string): string {
  const dt = new Date(updatedAt);
  if (Number.isNaN(dt.getTime())) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "second");
  }
  const diffMs = Date.now() - dt.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (mins < 1) return rtf.format(0, "second");
  if (mins < 60) return rtf.format(-mins, "minute");
  if (hours < 24) return rtf.format(-hours, "hour");
  if (days < 7) return rtf.format(-days, "day");
  return dt.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function bodyToSections(body: string): LocalSection[] {
  if (!body.trim()) return [];
  return [
    {
      id: "s-body",
      heading: "Draft",
      paragraphs: body
        .split(/\n{2,}/)
        .filter((p) => p.trim().length > 0)
        .map((p, i) => ({ id: `p-body-${i}`, html: p })),
    },
  ];
}

function sectionsToBody(sections: LocalSection[]): string {
  return sections
    .map((s) => {
      const heading = s.heading ? `# ${s.heading}\n\n` : "";
      const body = s.paragraphs
        .map((p) => p.html.replace(/<[^>]+>/g, "").trim())
        .filter((p) => p.length > 0)
        .join("\n\n");
      return heading + body;
    })
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

/** True if sections exist but every paragraph is still blank (template shell). */
function sectionsAreOnlyPlaceholders(sections: ReportDetailRow["sections"]): boolean {
  if (!sections?.length) return true;
  return !sections.some((s) =>
    s.paragraphs.some((p) => p.html.replace(/<[^>]+>/g, "").trim().length > 0)
  );
}

function buildLocalDetail(report: ReportDetailRow, locale: string): LocalDetail {
  const templateSections = report.sections as LocalSection[] | null | undefined;
  const hasBody = !!report.body?.trim();

  // Sections JSON is the source of truth — the agent now fills per-section
  // content directly. Body is only the fallback for legacy rows that pre-date
  // section-aware drafting.
  const sections: LocalSection[] = templateSections?.length
    ? (templateSections as LocalSection[])
    : hasBody
      ? bodyToSections(report.body!)
      : [];
  return {
    title: report.title || `${report.studentName} — ${fmtDay(report.reportDate, locale)}`,
    observer: "You",
    classroom: "Your classroom",
    dayLabel: fmtDay(report.reportDate, locale),
    savedMeta: relSavedAt(report.updatedAt, locale),
    sources: { voiceNotes: 0, photos: 0, worksheets: 0 },
    visibleTo: [`${report.studentName.split(" ")[0]}'s parents`, "Lead teacher"],
    sections,
  };
}

export function ReportDetail({
  report,
  backToReportsHref = "/app/reports",
}: {
  report: ReportDetailRow;
  /** Where "All reports" and post-delete navigation go (`/admin/reports` for admin). */
  backToReportsHref?: string;
}) {
  const router = useRouter();
  const locale = useUiLocale();
  const [detail, setDetail] = React.useState<LocalDetail>(() => buildLocalDetail(report, locale));
  const [isDirty, setIsDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDrafting, setIsDrafting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const draftKickedRef = React.useRef(false);
  /** Set while a /draft request is in flight so the overlay can abort it. */
  const draftAbortRef = React.useRef<AbortController | null>(null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const empty =
    !report.body?.trim() &&
    (!report.sections?.length || sectionsAreOnlyPlaceholders(report.sections));

  // Auto-trigger draft for fresh empty drafts. The new-report flow creates a
  // row with status='draft' and empty body; the editor opens here and
  // immediately fires /draft to fill it.
  //
  // We deliberately do NOT use a `cancelled` flag tied to effect cleanup. In
  // dev with React Strict Mode the cleanup runs synchronously after the first
  // mount, which would set the flag true and silently swallow the response
  // when it arrives 20+ seconds later — leaving the spinner stuck and the
  // editor blank. `draftKickedRef` already prevents a duplicate fetch from
  // strict mode's second invocation, which is the only reason a flag was
  // needed in the first place.
  React.useEffect(() => {
    if (!empty || draftKickedRef.current || report.status !== "draft") return;
    draftKickedRef.current = true;
    setIsDrafting(true);
    const ac = new AbortController();
    draftAbortRef.current = ac;
    const stash = readStoredDraftCapture(report.id);
    void fetch(`/api/v1/reports/${report.id}/draft`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcripts: stash?.transcripts ?? [],
        notes: stash?.notes ?? [],
        tokenMap: stash?.tokenMap ?? [],
      }),
      signal: ac.signal,
    })
      .then(async (res) => {
        if (ac.signal.aborted) return;
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          ToastBus.push({
            message: j.error || "Couldn't draft the report. You can edit it manually.",
          });
          return;
        }
        const json = (await res.json().catch(() => ({}))) as {
          report?: ReportDetailRow;
        };
        clearStoredDraftCapture(report.id);
        // Apply the freshly-drafted row to local state immediately so the
        // editor shows filled sections without waiting for an RSC refresh.
        if (json.report) {
          setDetail(buildLocalDetail(json.report, locale));
        }
        // Backup: still refresh so the server tree is in sync (e.g. status,
        // updatedAt) the next time we navigate.
        router.refresh();
      })
      .catch((err: unknown) => {
        const name =
          err instanceof DOMException
            ? err.name
            : err && typeof err === "object" && "name" in err
              ? String((err as { name: unknown }).name)
              : "";
        if (name === "AbortError") return;
        console.warn("[report-detail] draft fetch failed:", err);
      })
      .finally(() => {
        if (draftAbortRef.current === ac) draftAbortRef.current = null;
        setIsDrafting(false);
      });
  }, [empty, report.id, report.status, router, locale]);

  const cancelDraftGeneration = React.useCallback(() => {
    draftAbortRef.current?.abort();
    setIsDrafting(false);
    setIsDirty(false);
    setDetail(buildLocalDetail(report, locale));
    ToastBus.push({ message: "Drafting stopped. You can edit the report yourself." });
  }, [report, locale]);

  const confirmDeleteReport = React.useCallback(async () => {
    setDeleteBusy(true);
    try {
      draftAbortRef.current?.abort();
      const res = await fetch(`/api/v1/reports/${report.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't delete this report." });
        return;
      }
      setDeleteDialogOpen(false);
      router.push(backToReportsHref);
      router.refresh();
    } finally {
      setDeleteBusy(false);
    }
  }, [report.id, router, backToReportsHref]);

  // Debounced PATCH on edit.
  const queueSave = React.useCallback(
    (next: LocalDetail) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const res = await fetch(`/api/v1/reports/${report.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: next.title,
              sections: next.sections,
              body: sectionsToBody(next.sections),
            }),
          });
          if (!res.ok) {
            ToastBus.push({ message: "Couldn't save changes. Try again." });
          } else {
            setIsDirty(false);
          }
        } finally {
          setIsSaving(false);
        }
      }, 800);
    },
    [report.id]
  );

  const onChange = React.useCallback(
    (next: LocalDetail) => {
      setDetail(next);
      setIsDirty(true);
      queueSave(next);
    },
    [queueSave]
  );

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // After draft (router.refresh) or navigation, merge server report into local editor
  // state when the user isn't mid-edit.
  React.useEffect(() => {
    if (isDirty) return;
    setDetail(buildLocalDetail(report, locale));
  }, [
    report.id,
    report.body,
    report.title,
    report.updatedAt,
    report.reportDate,
    report.studentName,
    report.sections,
    locale,
    isDirty,
  ]);

  const savedMeta = isSaving
    ? SAVING_LABEL
    : isDrafting
      ? "Drafting with assistant…"
      : isDirty
        ? DIRTY_LABEL
        : detail.savedMeta;

  // Map DB status onto the topbar's narrower vocabulary.
  const topbarStatus =
    report.status === "sent" || report.status === "approved"
      ? "sent"
      : report.status === "draft"
        ? "draft"
        : "review";

  const topbarKind =
    report.reportType === "daily" ? "Daily" : report.reportType === "major" ? "Major" : "Incident";

  return (
    <>
      <div className="rd-root">
        <ReportTopBar
          child={{ name: report.studentName, tone: "clay" }}
          status={topbarStatus}
          kind={topbarKind}
          dayLabel={detail.dayLabel}
          classroom={detail.classroom}
          savedMeta={savedMeta}
          savedMetaDirty={isDirty || isDrafting || isSaving}
          reportsListHref={backToReportsHref}
          onDeleteClick={() => setDeleteDialogOpen(true)}
        />
        <div className="rd-workspace">
          <div className="rd-split">
            <ChatPane reportId={report.id} />
            <ReportPane
              detail={detail}
              onChange={onChange}
              isDrafting={isDrafting}
              onCancelDrafting={cancelDraftGeneration}
            />
          </div>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Delete this report?</DialogTitle>
            <DialogDescription>
              This removes the report for{" "}
              <span className="font-medium text-ink">{report.studentName}</span> from the database.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rd-btn rd-btn-secondary"
              disabled={deleteBusy}
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rd-btn rd-btn-danger-ghost"
              disabled={deleteBusy}
              onClick={() => void confirmDeleteReport()}
            >
              {deleteBusy ? "Deleting…" : "Delete report"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
