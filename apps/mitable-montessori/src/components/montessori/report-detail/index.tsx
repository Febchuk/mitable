"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import { ToastBus } from "../primitives";
import { ReportPane } from "./report-pane";
import { ReportTopBar } from "./top-bar";
import { ViewModeToggle, type ViewMode } from "./view-mode-toggle";
import { PdfPreviewPane } from "./pdf-preview-pane";
import { localDetailToPdfData } from "@/lib/pdf/local-detail-to-pdf-data";
import "./report-detail.css";
import {
  clearStoredDraftCapture,
  readStoredDraftCapture,
} from "@/lib/capture/draft-capture-storage";
import { useUiLocale } from "@/lib/hooks/use-ui-locale";
import type { SectionMeta } from "@/lib/report-templates/sections";
import {
  fieldPayloadToReadableText,
  paragraphCountsTowardDraftReadiness,
} from "@/lib/reports/template-field-payload";
import { firstOpenParagraphIndex } from "@/lib/reports/section-paragraph-slots";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePublishActiveReport } from "../active-report-context";
import { ChatPane, type ChatPaneHandle, type ChatPaneSection } from "./chat-pane";
import { ReportChatLauncher } from "./report-chat-drawer";

const DIRTY_LABEL = "Unsaved changes";
const SAVING_LABEL = "Saving…";

type LocalSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
  /** Phase 4: chat-driven ghost suggestion attached to this section.
   *  `messageId` ties this slot back to the originating chat row so
   *  Accept/Reject can record `applied`/`dismissed` server-side. */
  ghostEdit?: { id: string; html: string; sourceLabel: string; messageId?: string };
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
  templateLogoUrl?: string | null;
  templateSectionMeta: SectionMeta;
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

/** Strip ephemeral ghost slots before PATCH — ghosts live in chat + local UI until Accept. */
function sectionsForPersist(sections: LocalSection[]): Omit<LocalSection, "ghostEdit">[] {
  return sections.map(({ ghostEdit: _ghost, ...s }) => s);
}

/** Map agent target ids to report section ids (handles rare heading-only mismatches). */
function resolveSectionId(sections: LocalSection[], rawId: string): string | null {
  if (!rawId.trim()) return null;
  if (sections.some((s) => s.id === rawId)) return rawId;
  const norm = rawId.trim().toLowerCase();
  const byHeading = sections.find(
    (s) =>
      s.heading.toLowerCase() === norm ||
      s.heading
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") === norm
  );
  if (byHeading) return byHeading.id;
  const bySlug = sections.find(
    (s) => s.id.toLowerCase().endsWith(`-${norm}`) || s.id.toLowerCase() === norm
  );
  return bySlug?.id ?? null;
}

function sectionsToBody(sections: LocalSection[]): string {
  return sections
    .map((s) => {
      const heading = s.heading ? `# ${s.heading}\n\n` : "";
      const body = s.paragraphs
        .map((p) => fieldPayloadToReadableText(p.html).trim())
        .filter((p) => p.length > 0)
        .join("\n\n");
      return heading + body;
    })
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
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
    templateLogoUrl: report.templateLogoUrl ?? null,
    templateSectionMeta: report.templateSectionMeta ?? {},
  };
}

export function ReportDetail({
  report,
  backToReportsHref = "/app/reports",
  isAdmin: isAdminProp = false,
  hideBackLink = false,
  hideTopBarActions = false,
  hideTopBar = false,
  viewMode: viewModeProp,
  onViewModeChange,
  variant,
  onReportChanged,
  /**
   * `dock`       — floating "Ask Mitable" ChatDock on desktop; on mobile a
   *                bottom pill launches the `fullscreen` chat route.
   * `fullscreen` — chat owns the screen with a back link (the mobile `/chat` route).
   */
  chatMode = "dock",
}: {
  report: ReportDetailRow;
  /** Where "All reports" and post-delete navigation go (`/admin/reports` for admin). */
  backToReportsHref?: string;
  isAdmin?: boolean;
  /** When true (embedded in the rail view), suppresses the back-link and post-delete nav. */
  hideBackLink?: boolean;
  /** When true, suppresses the top-bar inline action buttons. The rail-view owns these via its action rail + modals — without this we get two Submit / Delete buttons stacked next to each other. */
  hideTopBarActions?: boolean;
  /** When true, removes the entire ReportTopBar (back link, avatar, title, status pill, meta row, view-mode toggle). The rail-view passes this so the list rail's selected row already communicates which report is open. PDF preview swaps in-place via the action-rail toggle in this mode. */
  hideTopBar?: boolean;
  /** Controlled view mode. When provided, the parent owns the editor/preview
   *  state (the rail-view does this so its action-rail toggle button drives
   *  what's rendered here). When omitted, ReportDetail manages it itself
   *  via the in-bar segmented toggle. */
  viewMode?: ViewMode;
  /** Paired with `viewMode` for controlled mode. */
  onViewModeChange?: (next: ViewMode) => void;
  /** String alias for isAdmin — "admin" ⇒ isAdmin. Existing callers can keep using isAdmin directly. */
  variant?: "teacher" | "admin";
  /** Called after server-side mutations so the parent can refresh without a full page reload. */
  onReportChanged?: () => void;
  chatMode?: "dock" | "fullscreen";
}) {
  const isAdmin = isAdminProp || variant === "admin";
  const router = useRouter();
  const locale = useUiLocale();
  const chatPaneRef = React.useRef<ChatPaneHandle | null>(null);
  const [detail, setDetail] = React.useState<LocalDetail>(() => buildLocalDetail(report, locale));
  const [isDirty, setIsDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDrafting, setIsDrafting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  /** href captured when the user attempted to navigate while dirty; consumed by the leave dialog. */
  const pendingNavRef = React.useRef<string | null>(null);
  const [leaveBusy, setLeaveBusy] = React.useState(false);
  const draftKickedRef = React.useRef(false);
  /** Set while a /draft request is in flight so the overlay can abort it. */
  const draftAbortRef = React.useRef<AbortController | null>(null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest LocalDetail queued for save. Lets `flushPendingSave` find it. */
  const pendingSaveRef = React.useRef<LocalDetail | null>(null);
  /** When a save is in flight, this resolves once it completes — so flush() can await it. */
  const inFlightSaveRef = React.useRef<Promise<void> | null>(null);

  const empty =
    !report.body?.trim() &&
    (!report.sections?.length ||
      !report.sections.some((s) => {
        const fieldMeta = report.templateSectionMeta?.[s.heading];
        return s.paragraphs.some((p, idx) =>
          paragraphCountsTowardDraftReadiness(p.html, idx === 0 ? fieldMeta : undefined)
        );
      }));

  const runAutofill = React.useCallback(async () => {
    if (isDrafting || report.status !== "draft") return;

    setIsDrafting(true);
    const ac = new AbortController();
    draftAbortRef.current = ac;
    const stash = readStoredDraftCapture(report.id);

    try {
      const res = await fetch(`/api/v1/reports/${report.id}/draft`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcripts: stash?.transcripts ?? [],
          notes: stash?.notes ?? [],
          tokenMap: stash?.tokenMap ?? [],
          captureOnly: stash?.captureOnly === true,
        }),
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        ToastBus.push({
          message: j.error || "Couldn't autofill the report. You can edit it manually.",
        });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        report?: ReportDetailRow;
      };
      clearStoredDraftCapture(report.id);
      if (json.report) {
        setDetail(buildLocalDetail(json.report, locale));
        setIsDirty(false);
      }
      router.refresh();
    } catch (err: unknown) {
      const name =
        err instanceof DOMException
          ? err.name
          : err && typeof err === "object" && "name" in err
            ? String((err as { name: unknown }).name)
            : "";
      if (name === "AbortError") return;
      console.warn("[report-detail] autofill fetch failed:", err);
    } finally {
      if (draftAbortRef.current === ac) draftAbortRef.current = null;
      setIsDrafting(false);
    }
  }, [isDrafting, report.id, report.status, router, locale]);

  const handleAutofill = React.useCallback(() => {
    if (report.status !== "draft") {
      ToastBus.push({ message: "Autofill is only available for draft reports." });
      return;
    }
    void runAutofill();
  }, [report.status, runAutofill]);

  const canAutofill = report.status === "draft";

  // Auto-trigger for fresh empty drafts. The new-report flow creates a row
  // with status='draft' and empty body; the editor opens here and immediately
  // fires /draft to fill it.
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
    void runAutofill();
  }, [empty, report.status, runAutofill]);

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

  // Inner save: actually fires the PATCH. Tracks in-flight so flush() can await.
  const performSave = React.useCallback(
    (next: LocalDetail): Promise<void> => {
      pendingSaveRef.current = null;
      const promise = (async () => {
        setIsSaving(true);
        try {
          const res = await fetch(`/api/v1/reports/${report.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: next.title,
              sections: sectionsForPersist(next.sections),
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
      })();
      inFlightSaveRef.current = promise;
      void promise.finally(() => {
        if (inFlightSaveRef.current === promise) inFlightSaveRef.current = null;
      });
      return promise;
    },
    [report.id]
  );

  // Debounced PATCH on edit.
  const queueSave = React.useCallback(
    (next: LocalDetail) => {
      pendingSaveRef.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const pending = pendingSaveRef.current;
        if (pending) void performSave(pending);
      }, 800);
    },
    [performSave]
  );

  /**
   * Flush any pending debounced PATCH and await the in-flight save (if any).
   * The chat agent calls this before each turn so its `read_report_sections`
   * sees the latest persisted state. Plan §7 calls this out as the single
   * most important integration concern.
   */
  const flushPendingSave = React.useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const pending = pendingSaveRef.current;
      if (pending) await performSave(pending);
    } else if (inFlightSaveRef.current) {
      await inFlightSaveRef.current;
    }
  }, [performSave]);

  const onChange = React.useCallback(
    (next: LocalDetail) => {
      setDetail(next);
      setIsDirty(true);
      queueSave(next);
    },
    [queueSave]
  );

  /** Local-only detail update (no autosave). Used for pending ghost slots. */
  const setDetailLocal = React.useCallback((next: LocalDetail) => {
    setDetail(next);
  }, []);

  // Latest detail snapshot for chat-driven mutations. Using a ref so the
  // handlers below don't recreate on every keystroke (would re-publish to
  // ActiveReportContext and remount ChatPane, losing local input state).
  const detailRef = React.useRef(detail);
  detailRef.current = detail;

  const applyProposalToDetail = React.useCallback(
    (args: { sectionId: string; paragraphId: string; newText: string }) => {
      const current = detailRef.current;
      const nextSections = current.sections.map((s) => {
        if (s.id !== args.sectionId) return s;
        return {
          ...s,
          paragraphs: s.paragraphs.map((p) =>
            p.id === args.paragraphId ? { ...p, html: args.newText } : p
          ),
        };
      });
      onChange({ ...current, sections: nextSections });
    },
    [onChange]
  );

  const applyGhostEditsToDetail = React.useCallback(
    (
      edits: Array<{
        sectionId: string;
        ghostEdit: { id: string; html: string; sourceLabel: string };
        messageId?: string;
      }>
    ) => {
      if (edits.length === 0) return;
      const current = detailRef.current;
      const bySectionId = new Map<
        string,
        { id: string; html: string; sourceLabel: string; messageId?: string }
      >();
      for (const e of edits) {
        const resolved = resolveSectionId(current.sections, e.sectionId);
        if (!resolved) continue;
        bySectionId.set(resolved, { ...e.ghostEdit, messageId: e.messageId });
      }
      if (bySectionId.size === 0) return;
      const nextSections = current.sections.map((s) => {
        const ghostEdit = bySectionId.get(s.id);
        return ghostEdit ? { ...s, ghostEdit } : s;
      });
      // Do not autosave — PATCH schema drops ghostEdit and a resync would wipe the pane.
      setDetailLocal({ ...current, sections: nextSections });
    },
    [setDetailLocal]
  );

  /** Append the ghost's html as a new paragraph in the section, clear the
   *  ghost slot, and record `applied` on the originating chat message. */
  const acceptGhostEditOnSection = React.useCallback(
    (sectionId: string) => {
      const current = detailRef.current;
      const section = current.sections.find((s) => s.id === sectionId);
      const ghost = section?.ghostEdit;
      if (!section || !ghost) return;
      const fieldMeta = current.templateSectionMeta?.[section.heading];
      const openIdx = firstOpenParagraphIndex(section.paragraphs, fieldMeta);
      let appliedParagraphId = "";
      const nextSections = current.sections.map((s) => {
        if (s.id !== sectionId) return s;
        if (openIdx !== null) {
          const target = s.paragraphs[openIdx];
          appliedParagraphId = target.id;
          return {
            ...s,
            paragraphs: s.paragraphs.map((p, i) =>
              i === openIdx ? { ...p, html: ghost.html } : p
            ),
            ghostEdit: undefined,
          };
        }
        appliedParagraphId = `p-ghost-${Math.random().toString(36).slice(2, 9)}`;
        return {
          ...s,
          paragraphs: [...s.paragraphs, { id: appliedParagraphId, html: ghost.html }],
          ghostEdit: undefined,
        };
      });
      onChange({ ...current, sections: nextSections });
      if (ghost.messageId) {
        chatPaneRef.current?.resolveGhostMessage(ghost.messageId, "applied");
        void fetch(`/api/v1/reports/${report.id}/chat/messages/${ghost.messageId}/applied`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "applied",
            appliedTo: {
              sectionId,
              paragraphId: appliedParagraphId,
              before: "",
              after: ghost.html,
            },
          }),
        }).catch(() => {
          // Editorial audit is best-effort; the local mutation is what the user sees.
        });
      }
    },
    [onChange, report.id]
  );

  /** Clear the ghost slot without appending; record `dismissed`. */
  const dismissGhostEditOnSection = React.useCallback(
    (sectionId: string) => {
      const current = detailRef.current;
      const section = current.sections.find((s) => s.id === sectionId);
      const ghost = section?.ghostEdit;
      if (!section || !ghost) return;
      const nextSections = current.sections.map((s) =>
        s.id === sectionId ? { ...s, ghostEdit: undefined } : s
      );
      onChange({ ...current, sections: nextSections });
      if (ghost.messageId) {
        chatPaneRef.current?.resolveGhostMessage(ghost.messageId, "dismissed");
        void fetch(`/api/v1/reports/${report.id}/chat/messages/${ghost.messageId}/applied`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "dismissed" }),
        }).catch(() => {
          // Best-effort.
        });
      }
    },
    [onChange, report.id]
  );

  const applyNewSectionToDetail = React.useCallback(
    (args: {
      sectionId: string;
      heading: string;
      paragraphs: { id: string; html: string }[];
      afterSectionId?: string;
    }) => {
      const current = detailRef.current;
      const newSection: LocalSection = {
        id: args.sectionId,
        heading: args.heading,
        paragraphs: args.paragraphs,
      };
      let nextSections: LocalSection[];
      if (args.afterSectionId) {
        const idx = current.sections.findIndex((s) => s.id === args.afterSectionId);
        if (idx === -1) {
          nextSections = [...current.sections, newSection];
        } else {
          nextSections = [
            ...current.sections.slice(0, idx + 1),
            newSection,
            ...current.sections.slice(idx + 1),
          ];
        }
      } else {
        nextSections = [...current.sections, newSection];
      }
      onChange({ ...current, sections: nextSections });
    },
    [onChange]
  );

  // Snapshot for the floating ChatDock. Sections must rebuild on each edit
  // so the chat agent's read_report_sections sees fresh content, but the
  // handler identities stay stable across keystrokes.
  const chatPaneSections: ChatPaneSection[] = React.useMemo(
    () =>
      detail.sections.map((s) => ({
        id: s.id,
        heading: s.heading,
        paragraphs: s.paragraphs.map((p) => ({ id: p.id, html: p.html })),
        ...(s.ghostEdit ? { ghostEdit: s.ghostEdit } : {}),
      })),
    [detail.sections]
  );

  const activeReportSnapshot = React.useMemo(
    () => ({
      reportId: report.id,
      title: detail.title,
      sections: chatPaneSections,
      handlers: {
        onApplyProposal: applyProposalToDetail,
        onApplyGhostEdits: (
          edits: Array<{
            sectionId: string;
            ghostEdit: { id: string; html: string; sourceLabel: string };
            messageId: string;
          }>
        ) => applyGhostEditsToDetail(edits),
        onApplyNewSection: ({
          sectionId,
          heading,
          paragraphs,
          afterSectionId,
        }: {
          sectionId: string;
          heading: string;
          paragraphs: { id: string; html: string }[];
          afterSectionId?: string;
          messageId: string;
        }) => applyNewSectionToDetail({ sectionId, heading, paragraphs, afterSectionId }),
        flushPendingSave,
      },
    }),
    [
      report.id,
      detail.title,
      chatPaneSections,
      applyProposalToDetail,
      applyGhostEditsToDetail,
      applyNewSectionToDetail,
      flushPendingSave,
    ]
  );

  usePublishActiveReport(chatMode === "dock" ? activeReportSnapshot : null);

  React.useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // beforeunload guard: warn the user if they try to close the tab, refresh,
  // or browser-back to a non-Next URL while there are pending edits the
  // 800ms autosave hasn't drained yet.
  React.useEffect(() => {
    if (!isDirty && !isSaving) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the returned string but require the assignment.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, isSaving]);

  // After draft (router.refresh) or navigation, merge server report into local editor
  // state when the user isn't mid-edit.
  //
  // IMPORTANT: `isDirty` is intentionally NOT in the dep list. When a save
  // completes (`setIsDirty(false)`), the effect would otherwise re-run with
  // a stale parent `report` prop and clobber the freshly-applied chat edit.
  // We only want this resync to fire when the server-side `report` actually
  // changes (route refresh, navigation). The early `isDirty` guard handles
  // the mid-edit case for renders where `report.*` does change.
  const isDirtyRef = React.useRef(isDirty);
  isDirtyRef.current = isDirty;
  React.useEffect(() => {
    if (isDirtyRef.current) return;
    // Keep pending ghost suggestions when the parent refetches after unrelated saves.
    if (detailRef.current.sections.some((s) => s.ghostEdit)) return;
    setDetail(buildLocalDetail(report, locale));
  }, [
    report.id,
    report.body,
    report.title,
    report.updatedAt,
    report.reportDate,
    report.studentName,
    report.sections,
    report.status,
    report.templateLogoUrl,
    JSON.stringify(report.templateSectionMeta ?? {}),
    locale,
  ]);

  const [actionBusy, setActionBusy] = React.useState(false);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [internalViewMode, setInternalViewMode] = React.useState<ViewMode>("editor");
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = React.useCallback(
    (next: ViewMode) => {
      if (onViewModeChange) onViewModeChange(next);
      if (viewModeProp === undefined) setInternalViewMode(next);
    },
    [onViewModeChange, viewModeProp]
  );

  const pdfData = React.useMemo(
    () => localDetailToPdfData({ title: detail.title, sections: detail.sections }, report),
    [detail.title, detail.sections, report]
  );

  const savedMeta = isSaving
    ? SAVING_LABEL
    : isDrafting
      ? "Drafting with assistant…"
      : isDirty
        ? DIRTY_LABEL
        : detail.savedMeta;

  const topbarStatus =
    report.status === "sent"
      ? "sent"
      : report.status === "approved"
        ? "approved"
        : report.status === "draft" || report.status === "changes_requested"
          ? "draft"
          : "review";

  const topbarKind =
    report.reportType === "daily" ? "Daily" : report.reportType === "major" ? "Major" : "Incident";

  const handleSubmitForReview = React.useCallback(async () => {
    setActionBusy(true);
    try {
      const res = await fetch("/api/v1/reports/submit", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't submit for review." });
        return;
      }
      ToastBus.push({ message: "Report submitted for review." });
      if (onReportChanged) onReportChanged();
      else router.refresh();
    } finally {
      setActionBusy(false);
    }
  }, [report.id, router, onReportChanged]);

  const handleApprove = React.useCallback(async () => {
    setActionBusy(true);
    try {
      const res = await fetch("/api/v1/reports/approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        ToastBus.push({ message: data.error || "Couldn't approve this report." });
        return;
      }
      ToastBus.push({ message: "Report approved." });
      if (onReportChanged) onReportChanged();
      else router.refresh();
    } finally {
      setActionBusy(false);
    }
  }, [report.id, router, onReportChanged]);

  const handleSendToParents = React.useCallback(() => {
    setSendDialogOpen(true);
  }, []);

  // Unsaved-changes guard for in-app navigation. When the user clicks the
  // back-to-reports link with dirty/in-flight edits, capture the intended
  // href and open the leave dialog. Clean nav (no dirty state) goes through
  // immediately.
  const guardedNavigate = React.useCallback(
    (href: string) => {
      if (isDirty || isSaving) {
        pendingNavRef.current = href;
        setLeaveDialogOpen(true);
      } else {
        router.push(href);
      }
    },
    [isDirty, isSaving, router]
  );

  const handleBackClick = React.useCallback(
    () => guardedNavigate(backToReportsHref),
    [guardedNavigate, backToReportsHref]
  );

  if (chatMode === "fullscreen") {
    return (
      <div className="rd-root rd-root--chat-fullscreen">
        <header className="rd-chat-fullscreen-head">
          <button
            type="button"
            className="rd-chat-fullscreen-back tap"
            onClick={() => guardedNavigate(`/app/reports/${report.id}`)}
            aria-label="Back to report"
          >
            <span aria-hidden>←</span>
            <span>Report</span>
          </button>
          <div className="rd-chat-fullscreen-title">
            <span className="rd-chat-fullscreen-title-name">{report.studentName}</span>
            <span className="rd-chat-fullscreen-title-sub">Edit with Mitable</span>
          </div>
        </header>
        <div className="rd-chat-fullscreen-body">
          <ChatPane
            ref={chatPaneRef}
            layout="drawer"
            messagesVisible
            reportId={report.id}
            sections={chatPaneSections}
            onApplyProposal={applyProposalToDetail}
            onApplyGhostEdits={applyGhostEditsToDetail}
            onApplyNewSection={applyNewSectionToDetail}
            flushPendingSave={flushPendingSave}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rd-root" data-no-topbar={hideTopBar ? "true" : "false"}>
        {hideTopBar ? null : (
          <ReportTopBar
            child={{ name: report.studentName, tone: "clay" }}
            status={topbarStatus}
            kind={topbarKind}
            dayLabel={detail.dayLabel}
            classroom={detail.classroom}
            savedMeta={savedMeta}
            savedMetaDirty={isDirty || isDrafting || isSaving}
            reportsListHref={hideBackLink ? undefined : backToReportsHref}
            isAdmin={isAdmin}
            actionBusy={actionBusy}
            hasBeenSubmitted={report.hasBeenSubmitted}
            viewModeSlot={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
            hideActions={hideTopBarActions}
            onBackClick={hideBackLink ? undefined : handleBackClick}
            onAutofill={canAutofill ? handleAutofill : undefined}
            autofillBusy={isDrafting}
            onSaveDraft={
              topbarStatus === "draft"
                ? () => {
                    const pending = pendingSaveRef.current;
                    if (pending) void performSave(pending);
                    else ToastBus.push({ message: "No changes to save." });
                  }
                : undefined
            }
            onSubmitForReview={
              topbarStatus === "draft" && !isAdmin ? () => void handleSubmitForReview() : undefined
            }
            onApprove={
              (topbarStatus === "draft" || topbarStatus === "review") && isAdmin
                ? () => void handleApprove()
                : undefined
            }
            onSendToParents={
              topbarStatus === "approved" && isAdmin ? handleSendToParents : undefined
            }
            onDeleteClick={() => setDeleteDialogOpen(true)}
          />
        )}
        <div className="rd-workspace">
          <div className="rd-split">
            <div className={viewMode === "editor" ? "rd-pane-wrap" : "rd-pane-wrap rd-pane-hidden"}>
              <ReportPane
                detail={detail}
                onChange={onChange}
                isDrafting={isDrafting}
                onAutofill={canAutofill ? handleAutofill : undefined}
                onCancelDrafting={cancelDraftGeneration}
                onAcceptGhostEdit={acceptGhostEditOnSection}
                onDismissGhostEdit={dismissGhostEditOnSection}
              />
            </div>
            {viewMode === "preview" && <PdfPreviewPane data={pdfData} />}
          </div>
        </div>

        {chatMode === "dock" ? <ReportChatLauncher reportId={report.id} /> : null}
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

      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          setLeaveDialogOpen(open);
          if (!open) pendingNavRef.current = null;
        }}
      >
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>You have unsaved changes</DialogTitle>
            <DialogDescription>
              Save your edits before leaving so the next person sees the latest version.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rd-btn rd-btn-secondary"
              disabled={leaveBusy}
              onClick={() => {
                pendingNavRef.current = null;
                setLeaveDialogOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rd-btn rd-btn-danger-ghost"
              disabled={leaveBusy}
              onClick={() => {
                const href = pendingNavRef.current;
                pendingNavRef.current = null;
                setLeaveDialogOpen(false);
                if (href) router.push(href);
              }}
            >
              Leave anyway
            </button>
            <button
              type="button"
              className="rd-btn rd-btn-primary"
              disabled={leaveBusy}
              onClick={async () => {
                setLeaveBusy(true);
                try {
                  await flushPendingSave();
                } finally {
                  setLeaveBusy(false);
                }
                const href = pendingNavRef.current;
                pendingNavRef.current = null;
                setLeaveDialogOpen(false);
                if (href) router.push(href);
              }}
            >
              {leaveBusy ? "Saving…" : "Save and leave"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {sendDialogOpen && (
        <SendToParentsDialog
          reportId={report.id}
          studentId={report.studentId}
          studentName={report.studentName}
          open={sendDialogOpen}
          onOpenChange={setSendDialogOpen}
          onSent={() => {
            setSendDialogOpen(false);
            if (onReportChanged) onReportChanged();
            else router.refresh();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Send-to-parents dialog (two-step: recipients → message)           */
/* ------------------------------------------------------------------ */

type GuardianRow = {
  guardianId: string;
  name: string;
  email: string | null;
  relationship: string | null;
};

type SendStep = "recipients" | "message";

function SendToParentsDialog({
  reportId,
  studentId,
  studentName,
  open,
  onOpenChange,
  onSent,
}: {
  reportId: string;
  studentId: string;
  studentName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent: () => void;
}) {
  const [step, setStep] = React.useState<SendStep>("recipients");
  const [guardians, setGuardians] = React.useState<GuardianRow[] | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [messageBody, setMessageBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep("recipients");
    setMessageBody("");
    setError(null);
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v1/students/${studentId}/guardians?receivesReports=true`, {
        credentials: "include",
      });
      if (cancelled) return;
      if (!res.ok) {
        setError("Couldn't load guardians.");
        return;
      }
      const data = (await res.json()) as { guardians: GuardianRow[] };
      setGuardians(data.guardians);
      setSelected(new Set(data.guardians.filter((g) => g.email).map((g) => g.guardianId)));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  const toggleGuardian = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const sendRes = await fetch("/api/v1/reports/send", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId,
          guardianRefs: [...selected],
          messageBody: messageBody.trim() || undefined,
        }),
      });
      const sendData = (await sendRes.json().catch(() => ({}))) as { error?: string };
      if (!sendRes.ok) {
        setError(sendData.error || "Couldn't mark report as sent.");
        return;
      }

      await fetch("/api/admin/reports/drain-emails", {
        method: "POST",
        credentials: "include",
      });

      ToastBus.push({ message: `Report sent to ${selected.size} guardian(s).` });
      onSent();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const eligible = guardians?.filter((g) => g.email) ?? [];
  const firstName = studentName.split(" ")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-ink/10 bg-canvas">
        {step === "recipients" ? (
          <>
            <DialogHeader>
              <DialogTitle>Send report to parents</DialogTitle>
              <DialogDescription>
                Choose which of {firstName}&apos;s guardians should receive this report by email.
              </DialogDescription>
            </DialogHeader>

            {guardians === null && !error && (
              <p className="py-4 text-center text-sm text-ink-secondary">Loading guardians…</p>
            )}

            {error && <p className="py-2 text-sm text-status-error">{error}</p>}

            {guardians !== null && eligible.length === 0 && (
              <p className="py-4 text-sm text-ink-secondary">
                No guardians with email addresses are linked to this student.
              </p>
            )}

            {eligible.length > 0 && (
              <div className="mt-2 space-y-2">
                {eligible.map((g) => (
                  <label
                    key={g.guardianId}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink/10 px-3 py-2.5 transition-colors hover:bg-ink/5"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(g.guardianId)}
                      onChange={() => toggleGuardian(g.guardianId)}
                      className="size-4 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{g.name}</div>
                      <div className="truncate text-xs text-ink-secondary">
                        {g.email}
                        {g.relationship && ` · ${g.relationship}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rd-btn rd-btn-secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rd-btn rd-btn-primary"
                disabled={selected.size === 0}
                onClick={() => setStep("message")}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a note for parents</DialogTitle>
              <DialogDescription>
                This message will appear in the email body alongside the report PDF attachment.
                Leave blank to send without a personal note.
              </DialogDescription>
            </DialogHeader>

            {error && <p className="py-2 text-sm text-status-error">{error}</p>}

            <div className="mt-2">
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={`Hi! Here is ${firstName}'s latest report. Please don't hesitate to reach out if you have any questions.`}
                rows={5}
                className="w-full resize-none rounded-lg border border-ink/10 bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-ink-tertiary focus:border-accent focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-ink-tertiary">
                Sending to {selected.size} guardian(s). The report will be attached as a PDF.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rd-btn rd-btn-secondary"
                disabled={busy}
                onClick={() => setStep("recipients")}
              >
                Back
              </button>
              <button
                type="button"
                className="rd-btn rd-btn-primary"
                disabled={busy}
                onClick={() => void handleSend()}
              >
                {busy ? "Sending…" : `Send to ${selected.size} guardian(s)`}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
