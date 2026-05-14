"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import { ToastBus } from "../primitives";
import { ChatPane, type ChatPaneHandle } from "./chat-pane";
import { ReportPane } from "./report-pane";
import { ReportTopBar } from "./top-bar";
import { useMediaQuery } from "./use-media-query";
import "./report-detail.css";
import { MessageSquare, Sparkles, X } from "lucide-react";
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
  /** Phase 4: chat-driven ghost suggestion attached to this section. */
  ghostEdit?: { id: string; html: string; sourceLabel: string };
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
    templateLogoUrl: report.templateLogoUrl ?? null,
  };
}

export function ReportDetail({
  report,
  backToReportsHref = "/app/reports",
  isAdmin: isAdminProp = false,
  hideBackLink = false,
  variant,
  onReportChanged,
}: {
  report: ReportDetailRow;
  /** Where "All reports" and post-delete navigation go (`/admin/reports` for admin). */
  backToReportsHref?: string;
  isAdmin?: boolean;
  /** When true (embedded in the rail view), suppresses the back-link and post-delete nav. */
  hideBackLink?: boolean;
  /** String alias for isAdmin — "admin" ⇒ isAdmin. Existing callers can keep using isAdmin directly. */
  variant?: "teacher" | "admin";
  /** Called after server-side mutations so the parent can refresh without a full page reload. */
  onReportChanged?: () => void;
}) {
  const isAdmin = isAdminProp || variant === "admin";
  const router = useRouter();
  const locale = useUiLocale();
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
        captureOnly: stash?.captureOnly === true,
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

  // ----- Phase 3: chat-driven proposal apply + discuss-from-paragraph -----
  const chatPaneRef = React.useRef<ChatPaneHandle>(null);

  /** Mutate the report's local state when chat applies a proposal or undo. */
  const onApplyProposalFromChat = React.useCallback(
    (args: { sectionId: string; paragraphId: string; newText: string }) => {
      setDetail((prev) => {
        const sections = prev.sections.map((section) => {
          if (section.id !== args.sectionId) return section;
          const paragraphs = section.paragraphs.map((p) =>
            p.id === args.paragraphId ? { ...p, html: args.newText } : p
          );
          return { ...section, paragraphs };
        });
        const next = { ...prev, sections };
        setIsDirty(true);
        queueSave(next);
        return next;
      });
    },
    [queueSave]
  );

  /** Called when the user clicks "Discuss" on a paragraph. Seeds the chat scope. */
  const onDiscussParagraph = React.useCallback(
    (sectionId: string, paragraphId: string) => {
      const section = detail.sections.find((s) => s.id === sectionId);
      const heading = section?.heading;
      chatPaneRef.current?.seedTurn({
        targetRef: { sectionId, paragraphId },
        targetLabel: heading ? `${heading} paragraph` : "this paragraph",
      });
    },
    [detail.sections]
  );

  // ----- Phase 4: ghost edits + obs-ref pull-in -----

  /** Tracks which originating chat-message id seeded each section's ghost so
   *  Accept/Reject can post the editorial action to the right row. */
  const ghostMessageIdsRef = React.useRef(new Map<string, string>());

  /**
   * Chat agent emitted a new-section — splice into detail.sections at the
   * requested position (after `afterSectionId` if provided, otherwise
   * append). Auto-applies on receipt; dirties the report so the debounced
   * PATCH picks it up. Posts to /applied so the chat row records that the
   * change landed.
   */
  const onApplyNewSection = React.useCallback(
    ({
      sectionId,
      heading,
      paragraphs,
      afterSectionId,
      messageId,
    }: {
      sectionId: string;
      heading: string;
      paragraphs: { id: string; html: string }[];
      afterSectionId?: string;
      messageId: string;
    }) => {
      setDetail((prev) => {
        // Idempotent: skip if a section with this id already exists (the
        // auto-apply effect can fire twice in strict mode).
        if (prev.sections.some((s) => s.id === sectionId)) return prev;
        const newSection = { id: sectionId, heading, paragraphs };
        let sections: typeof prev.sections;
        if (afterSectionId) {
          const idx = prev.sections.findIndex((s) => s.id === afterSectionId);
          if (idx >= 0) {
            sections = [
              ...prev.sections.slice(0, idx + 1),
              newSection,
              ...prev.sections.slice(idx + 1),
            ];
          } else {
            sections = [...prev.sections, newSection];
          }
        } else {
          sections = [...prev.sections, newSection];
        }
        const next = { ...prev, sections };
        setIsDirty(true);
        queueSave(next);
        return next;
      });
      void fetch(`/api/v1/reports/${report.id}/chat/messages/${messageId}/applied`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "applied" }),
      }).catch(() => {
        // Non-fatal — the local mutation already happened.
      });
    },
    [queueSave, report.id]
  );

  /** Chat agent emitted a ghost-edit — merge into the section's slot. */
  const onApplyGhostEdit = React.useCallback(
    ({
      sectionId,
      ghostEdit,
      messageId,
    }: {
      sectionId: string;
      ghostEdit: { id: string; html: string; sourceLabel: string };
      messageId?: string;
    }) => {
      setDetail((prev) => {
        const sections = prev.sections.map((s) => (s.id === sectionId ? { ...s, ghostEdit } : s));
        return { ...prev, sections };
      });
      if (messageId) ghostMessageIdsRef.current.set(sectionId, messageId);
    },
    []
  );

  const recordGhostAction = React.useCallback(
    async (
      messageId: string,
      action: "applied" | "dismissed",
      appliedTo?: { sectionId: string; paragraphId: string; before: string; after: string }
    ) => {
      try {
        await fetch(`/api/v1/reports/${report.id}/chat/messages/${messageId}/applied`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, appliedTo }),
        });
      } catch {
        // Non-fatal — the local mutation already happened.
      }
    },
    [report.id]
  );

  /** Accept the ghost: append it as a new paragraph and clear the slot. */
  const onAcceptGhostEdit = React.useCallback(
    (sectionId: string) => {
      setDetail((prev) => {
        const section = prev.sections.find((s) => s.id === sectionId);
        const ghost = section?.ghostEdit;
        if (!section || !ghost) return prev;
        const paragraphId = `p-ghost-${Math.random().toString(36).slice(2, 9)}`;
        const sections = prev.sections.map((s) => {
          if (s.id !== sectionId) return s;
          const { ghostEdit: _drop, ...rest } = s;
          void _drop;
          return {
            ...rest,
            paragraphs: [...s.paragraphs, { id: paragraphId, html: ghost.html }],
          };
        });
        const next = { ...prev, sections };
        setIsDirty(true);
        queueSave(next);
        const messageId = ghostMessageIdsRef.current.get(sectionId);
        ghostMessageIdsRef.current.delete(sectionId);
        if (messageId) {
          void recordGhostAction(messageId, "applied", {
            sectionId,
            paragraphId,
            before: "",
            after: ghost.html,
          });
        }
        return next;
      });
    },
    [queueSave, recordGhostAction]
  );

  /** Dismiss the ghost: clear the slot. */
  const onDismissGhostEdit = React.useCallback(
    (sectionId: string) => {
      setDetail((prev) => {
        const sections = prev.sections.map((s) => {
          if (s.id !== sectionId) return s;
          const { ghostEdit: _drop, ...rest } = s;
          void _drop;
          return rest;
        });
        const next = { ...prev, sections };
        // No PATCH needed — ghostEdit lives only in client state, never persisted.
        return next;
      });
      const messageId = ghostMessageIdsRef.current.get(sectionId);
      ghostMessageIdsRef.current.delete(sectionId);
      if (messageId) void recordGhostAction(messageId, "dismissed");
    },
    [recordGhostAction]
  );

  /** Chat agent's obs-ref Pull in — append a paragraph with the captured text. */
  const onPullObservation = React.useCallback(
    ({
      text,
      suggestedTarget,
    }: {
      text: string;
      suggestedTarget?: { sectionId: string; position: "append" | "after" | "new-paragraph" };
    }) => {
      setDetail((prev) => {
        // If suggestedTarget points at an existing section, append there.
        // Otherwise put it in the last section so the teacher can move it.
        const targetSectionId =
          suggestedTarget?.sectionId &&
          prev.sections.some((s) => s.id === suggestedTarget.sectionId)
            ? suggestedTarget.sectionId
            : prev.sections[prev.sections.length - 1]?.id;
        if (!targetSectionId) {
          ToastBus.push({ message: "Add a section first, then pull observations into it." });
          return prev;
        }
        const paragraphId = `p-obs-${Math.random().toString(36).slice(2, 9)}`;
        const sections = prev.sections.map((s) =>
          s.id === targetSectionId
            ? { ...s, paragraphs: [...s.paragraphs, { id: paragraphId, html: text }] }
            : s
        );
        const next = { ...prev, sections };
        setIsDirty(true);
        queueSave(next);
        return next;
      });
    },
    [queueSave]
  );

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
    locale,
  ]);

  const [actionBusy, setActionBusy] = React.useState(false);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);

  // Mobile-only: ChatPane lives inside this bottom sheet on <lg. The desktop
  // split-view ChatPane and the mobile sheet ChatPane are mutually exclusive
  // (gated by useMediaQuery below) so the chat thread only ever has one mount.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [mobileChatOpen, setMobileChatOpen] = React.useState(false);

  // Esc closes the mobile chat sheet.
  React.useEffect(() => {
    if (!mobileChatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileChatOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileChatOpen]);

  // Lock body scroll while the mobile chat sheet is up.
  React.useEffect(() => {
    if (!mobileChatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileChatOpen]);

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
          reportsListHref={hideBackLink ? undefined : backToReportsHref}
          isAdmin={isAdmin}
          actionBusy={actionBusy}
          hasBeenSubmitted={report.hasBeenSubmitted}
          onBackClick={hideBackLink ? undefined : handleBackClick}
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
          onSendToParents={topbarStatus === "approved" && isAdmin ? handleSendToParents : undefined}
          onDeleteClick={() => setDeleteDialogOpen(true)}
        />
        <div className="rd-workspace">
          <div className="rd-split">
            {isDesktop ? (
              <ChatPane
                ref={chatPaneRef}
                reportId={report.id}
                sections={detail.sections}
                flushPendingSave={flushPendingSave}
                onApplyProposal={onApplyProposalFromChat}
                onPullObservation={onPullObservation}
                onApplyGhostEdit={onApplyGhostEdit}
                onApplyNewSection={onApplyNewSection}
              />
            ) : null}
            <ReportPane
              detail={detail}
              onChange={onChange}
              isDrafting={isDrafting}
              onCancelDrafting={cancelDraftGeneration}
              onDiscussParagraph={onDiscussParagraph}
              onAcceptGhostEdit={onAcceptGhostEdit}
              onDismissGhostEdit={onDismissGhostEdit}
            />
          </div>
        </div>
      </div>

      {/*
        Mobile (<lg): the report editor's report-scoped chat lives in a bottom
        sheet, opened by a terracotta FAB. The MontessoriMobileShell hides its
        own generic FAB on report-detail routes so there's only one FAB on screen.
        ChatPane is lazy-mounted only when the sheet is open the first time, so
        we don't load /api/v1/reports/{id}/chat on every report visit.
      */}
      {!isDesktop && (
        <>
          <button
            type="button"
            className="lg:hidden tap rd-mobile-fab"
            onClick={() => setMobileChatOpen(true)}
            aria-label="Open report chat"
            aria-hidden={mobileChatOpen}
            data-hidden={mobileChatOpen ? "true" : "false"}
          >
            <MessageSquare size={22} strokeWidth={1.8} />
          </button>

          <div
            className="lg:hidden rd-mobile-scrim"
            role="presentation"
            onClick={() => setMobileChatOpen(false)}
            aria-hidden={!mobileChatOpen}
            data-open={mobileChatOpen ? "true" : "false"}
          />

          <div
            className="lg:hidden rd-mobile-sheet"
            role="dialog"
            aria-label="Report chat"
            aria-hidden={!mobileChatOpen}
            data-open={mobileChatOpen ? "true" : "false"}
          >
            <div className="rd-mobile-sheet-grabber" aria-hidden />
            <div className="rd-mobile-sheet-head">
              <div className="rd-mobile-sheet-head-icon">
                <Sparkles size={16} strokeWidth={1.6} />
              </div>
              <div className="rd-mobile-sheet-head-text">
                <div className="rd-mobile-sheet-head-title">Report chat</div>
                <div className="rd-mobile-sheet-head-sub">{report.studentName}</div>
              </div>
              <button
                type="button"
                className="tap rd-mobile-sheet-close"
                onClick={() => setMobileChatOpen(false)}
                aria-label="Close report chat"
              >
                <X size={18} strokeWidth={1.6} />
              </button>
            </div>
            <div className="rd-mobile-sheet-body">
              {mobileChatOpen ? (
                <ChatPane
                  ref={chatPaneRef}
                  reportId={report.id}
                  sections={detail.sections}
                  flushPendingSave={flushPendingSave}
                  onApplyProposal={onApplyProposalFromChat}
                  onPullObservation={onPullObservation}
                  onApplyGhostEdit={onApplyGhostEdit}
                  onApplyNewSection={onApplyNewSection}
                />
              ) : null}
            </div>
          </div>
        </>
      )}

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
