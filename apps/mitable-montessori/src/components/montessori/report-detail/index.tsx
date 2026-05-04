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

function fmtDay(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function relSavedAt(updatedAt: string): string {
  const dt = new Date(updatedAt);
  if (Number.isNaN(dt.getTime())) return "Saved";
  const mins = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (mins < 1) return "Saved just now";
  if (mins < 60) return `Saved ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Saved ${hours} hr ago`;
  return `Saved ${dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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

function buildLocalDetail(report: ReportDetailRow): LocalDetail {
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
    title: report.title || `${report.studentName} — ${fmtDay(report.reportDate)}`,
    observer: "You",
    classroom: "Your classroom",
    dayLabel: fmtDay(report.reportDate),
    savedMeta: relSavedAt(report.updatedAt),
    sources: { voiceNotes: 0, photos: 0, worksheets: 0 },
    visibleTo: [`${report.studentName.split(" ")[0]}'s parents`, "Lead teacher"],
    sections,
  };
}

export function ReportDetail({ report }: { report: ReportDetailRow }) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<LocalDetail>(() => buildLocalDetail(report));
  const [isDirty, setIsDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDrafting, setIsDrafting] = React.useState(false);
  const draftKickedRef = React.useRef(false);
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
    const stash = readStoredDraftCapture(report.id);
    void fetch(`/api/v1/reports/${report.id}/draft`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcripts: stash?.transcripts ?? [],
        notes: stash?.notes ?? [],
      }),
    })
      .then(async (res) => {
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
          setDetail(buildLocalDetail(json.report));
        }
        // Backup: still refresh so the server tree is in sync (e.g. status,
        // updatedAt) the next time we navigate.
        router.refresh();
      })
      .finally(() => {
        setIsDrafting(false);
      });
  }, [empty, report.id, report.status, router]);

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
    setDetail(buildLocalDetail(report));
  }, [
    report.id,
    report.body,
    report.title,
    report.updatedAt,
    report.reportDate,
    report.studentName,
    report.sections,
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
    <div className="rd-root">
      <ReportTopBar
        child={{ name: report.studentName, tone: "clay" }}
        status={topbarStatus}
        kind={topbarKind}
        dayLabel={detail.dayLabel}
        classroom={detail.classroom}
        savedMeta={savedMeta}
        savedMetaDirty={isDirty || isDrafting || isSaving}
      />
      <div className="rd-workspace">
        <div className="rd-split">
          <ChatPane />
          <ReportPane detail={detail} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}
