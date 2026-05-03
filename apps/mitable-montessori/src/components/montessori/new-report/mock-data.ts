/* Mock report templates. Admin-managed in the real product — for now,
   these are baked in. The chat agent will use the picked template's
   sections as the starting structure when drafting. */

export type ReportTemplate = {
  id: string;
  name: string;
  description: string;
  /** What kind of report this template is meant for. */
  kind: "Daily" | "Major" | "Incident";
  sections: string[];
  iconTone: "clay" | "butter" | "blue" | "sage";
};

export const TEMPLATES: ReportTemplate[] = [
  {
    id: "tpl-sunflower-daily",
    name: "Sunflower daily",
    description: "Morning · Language · Math · Afternoon · Social",
    kind: "Daily",
    sections: ["Morning", "Language", "Math", "Afternoon", "Social"],
    iconTone: "clay",
  },
  {
    id: "tpl-spring-milestone",
    name: "Spring milestone",
    description: "Term summary across areas",
    kind: "Major",
    sections: ["Overview", "Math", "Language", "Social", "Family note"],
    iconTone: "butter",
  },
  {
    id: "tpl-incident-minor",
    name: "Incident — minor",
    description: "What happened · Care given · Follow-up",
    kind: "Incident",
    sections: ["What happened", "Care given", "Follow-up"],
    iconTone: "blue",
  },
  {
    id: "tpl-first-week",
    name: "First-week intro",
    description: "Settling in · First works · Family questions",
    kind: "Major",
    sections: ["Settling in", "First works", "Family questions"],
    iconTone: "sage",
  },
  {
    id: "tpl-quick-checkin",
    name: "Quick check-in",
    description: "One paragraph · Family-only",
    kind: "Daily",
    sections: ["Today"],
    iconTone: "clay",
  },
];

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

/** Children captured today, by id. Drives the "Captured today" group at the
   top of the picker. Pure mock for now. */
export const CAPTURED_TODAY: Record<string, { voice: number; photos: number }> = {
  ada: { voice: 4, photos: 2 },
  dgo: { voice: 2, photos: 1 },
  bea: { voice: 1, photos: 0 },
};

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
