"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ToastBus } from "../primitives";
import { useIsMobile } from "../child-detail/use-is-mobile";
import type { Tone } from "../data";
import { parseCaptureInputs } from "@/lib/capture/parse-on-submit";
import { writeStoredDraftCapture } from "@/lib/capture/draft-capture-storage";
import { NewReportSheet } from "./new-report-sheet";
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
  iconTone: ReportTemplate["iconTone"];
};

/** The Plus button on /app/reports — clicking opens the sheet (desktop)
   or the full-screen step flow (mobile). Lazy-loads templates + roster
   + captured-today on first open. */
export function NewReportTrigger() {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [roster, setRoster] = React.useState<PickerChild[]>([]);
  const [templates, setTemplates] = React.useState<ReportTemplate[]>([]);
  const [capturedToday, setCapturedToday] = React.useState<CapturedToday>({});
  const [loaded, setLoaded] = React.useState(false);

  const mobile = useIsMobile();
  const router = useRouter();

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
        // Pull recorded audio + note images into Blobs, run Whisper (worker)
        // + OCR, fuzzy-match roster → tokenized strings for the draft API.
        const audioBlob = payload.audio
          ? await fetch(payload.audio.url)
              .then((r) => r.blob())
              .catch(() => null)
          : null;
        const noteBlobs = await Promise.all(
          payload.notes.map((n) =>
            fetch(n.url)
              .then((r) => r.blob())
              .catch(() => null)
          )
        ).then((arr) => arr.filter((b): b is Blob => b != null));

        const parsed = await parseCaptureInputs({
          audio: audioBlob,
          noteImages: noteBlobs,
          roster: roster.map((r) => ({ id: r.id, name: r.name })),
        });

        const res = await fetch("/api/v1/reports", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            childId: payload.childId,
            kind: payload.kind,
            templateId: payload.templateId ?? null,
            transcripts: parsed.transcripts,
            notes: parsed.notes,
            tokenMap: parsed.tokenMap,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          ToastBus.push({ message: j.error || "Couldn't create the report." });
          return;
        }
        const json = (await res.json()) as { reportId: string };
        writeStoredDraftCapture(json.reportId, {
          transcripts: parsed.transcripts,
          notes: parsed.notes,
          tokenMap: parsed.tokenMap,
          captureOnly: payload.captureOnly,
        });
        const child = roster.find((c) => c.id === payload.childId);
        ToastBus.push({
          message: child
            ? `Drafting ${payload.kind.toLowerCase()} report for ${child.name.split(" ")[0]}…`
            : "Drafting new report…",
        });
        setOpen(false);
        router.push(`/app/reports?open=${encodeURIComponent(json.reportId)}`);
      } finally {
        setSubmitting(false);
      }
    },
    [router, roster, submitting]
  );

  return (
    <>
      <button
        type="button"
        className="tap nr-trigger"
        onClick={() => setOpen(true)}
        aria-label="New report"
      >
        <Plus size={14} strokeWidth={2} />
        <span>New report</span>
      </button>

      {!mobile && (
        <NewReportSheet
          open={open}
          onClose={() => setOpen(false)}
          onSubmit={onSubmit}
          roster={roster}
          capturedToday={capturedToday}
          templates={templates}
          submitting={submitting}
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
        />
      )}
    </>
  );
}
