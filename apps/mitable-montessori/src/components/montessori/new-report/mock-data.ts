/* Type-only module (the consts moved to the server: see
   src/lib/queries/templates.ts and src/lib/queries/captured-today.ts). */

export type ReportTemplate = {
  id: string;
  name: string;
  description: string;
  /** What kind of report this template is meant for. */
  kind: "Daily" | "Major" | "Incident";
  sections: string[];
  iconTone: "clay" | "butter" | "blue" | "sage";
};

export type ReportKind = "Daily" | "Major" | "Incident";

/** Submitted to /api/v1/reports. Audio + handwritten notes are no longer part
 *  of the new-report flow — the assistant drafts from the empty template. The
 *  backend still accepts `transcripts/notes/tokenMap`, so the trigger sends
 *  empty arrays for those fields. */
export type NewReportPayload = {
  childId: string;
  /** Mirrors the chosen template's kind. */
  kind: ReportKind;
  templateId: string;
};

/** Legacy — kept alive because `use-audio-recorder.ts` (consumed by the
 *  not-rendered-but-typechecked report chat-pane) still references it. The
 *  new-report flow itself no longer captures audio. */
export type AudioMemo = {
  /** Object URL of the recorded blob. */
  url: string;
  /** Duration in seconds. */
  durationSec: number;
};

/** Legacy — same story as AudioMemo. */
export type CapturedNote = {
  id: string;
  url: string;
  name: string;
};

/** Legacy formatter — used by the not-rendered chat-pane only. */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
