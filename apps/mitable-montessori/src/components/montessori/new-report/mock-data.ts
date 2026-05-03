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

export type CapturedNote = {
  id: string;
  /** Object URL of the selected image — local-only until backend lands. */
  url: string;
  /** Original file name; falls back to "Note 1" etc. for camera captures. */
  name: string;
};

export type AudioMemo = {
  /** Object URL of the recorded blob. */
  url: string;
  /** Duration in seconds. */
  durationSec: number;
};

export type NewReportPayload = {
  childId: string;
  kind: ReportKind;
  audio: AudioMemo | null;
  notes: CapturedNote[];
  templateId: string | null;
};

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
