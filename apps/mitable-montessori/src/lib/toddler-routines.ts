import type { SupabaseClient } from "@supabase/supabase-js";
import { plainTextToReportParagraphHtml } from "@/lib/reports/template-field-payload";

export const TODDLER_ROUTINE_CATEGORIES = [
  "mood",
  "nap",
  "participation",
  "toileting",
  "meal_response",
  "outdoor_response",
  "activity",
  "material",
] as const;

export type ToddlerRoutineCategory = (typeof TODDLER_ROUTINE_CATEGORIES)[number];

export const TODDLER_ROUTINE_CATEGORY_LABELS: Record<ToddlerRoutineCategory, string> = {
  mood: "Mood",
  nap: "Nap",
  participation: "Participation",
  toileting: "Toileting",
  meal_response: "Meal response",
  outdoor_response: "Outdoor play",
  activity: "Activities",
  material: "Montessori materials",
};

export const DEFAULT_TODDLER_ROUTINES: Record<ToddlerRoutineCategory, string[]> = {
  mood: ["Cheerful", "Settled", "Tired", "Upset"],
  nap: ["Slept", "Slept briefly", "Did not sleep"],
  participation: ["Interactive", "Engaged", "Quiet", "Needed support"],
  toileting: ["Wee", "Poo", "Dry", "Did not wee", "Did not poo"],
  meal_response: ["Ate well", "Ate some", "Did not eat"],
  outdoor_response: ["Enjoyed", "Indifferent", "Wanted out"],
  activity: [
    "Coloring",
    "Art & Craft",
    "Painting",
    "Storytime",
    "Music & Movement",
    "Manipulative",
  ],
  material: ["Roller Coaster", "Building Lego", "Stringing", "Stacking"],
};

export type ToddlerRoutineOption = {
  id: string;
  category: ToddlerRoutineCategory;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type ToddlerTimedEntry = {
  id: string;
  time: string;
  outcome: string;
  detail?: string;
};

export type ToddlerDailyLog = {
  id: string | null;
  studentId: string;
  classroomId: string;
  logDate: string;
  mood: string;
  nap: string;
  participation: string;
  toiletingEntries: ToddlerTimedEntry[];
  feedingEntries: ToddlerTimedEntry[];
  outdoorPlayEntries: ToddlerTimedEntry[];
  activityOptionIds: string[];
  activityLabels: string[];
  materialOptionIds: string[];
  materialLabels: string[];
  otherNotes: string;
  teacherComments: string;
};

export function dbToddlerDailyLogToDto(row: Record<string, unknown>): ToddlerDailyLog {
  return {
    id: (row.id as string | null) ?? null,
    studentId: row.student_id as string,
    classroomId: row.classroom_id as string,
    logDate: row.log_date as string,
    mood: (row.mood as string | null) ?? "",
    nap: (row.nap as string | null) ?? "",
    participation: (row.participation as string | null) ?? "",
    toiletingEntries: (row.toileting_entries as ToddlerTimedEntry[] | null) ?? [],
    feedingEntries: (row.feeding_entries as ToddlerTimedEntry[] | null) ?? [],
    outdoorPlayEntries: (row.outdoor_play_entries as ToddlerTimedEntry[] | null) ?? [],
    activityOptionIds: (row.activity_option_ids as string[] | null) ?? [],
    activityLabels: (row.activity_labels as string[] | null) ?? [],
    materialOptionIds: (row.material_option_ids as string[] | null) ?? [],
    materialLabels: (row.material_labels as string[] | null) ?? [],
    otherNotes: (row.other_notes as string | null) ?? "",
    teacherComments: (row.teacher_comments as string | null) ?? "",
  };
}

export function isToddlerRoutineCategory(value: unknown): value is ToddlerRoutineCategory {
  return TODDLER_ROUTINE_CATEGORIES.includes(value as ToddlerRoutineCategory);
}

export async function ensureDefaultToddlerRoutines(
  supabase: SupabaseClient,
  schoolId: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("toddler_routine_options")
    .select("category, label")
    .eq("school_id", schoolId);
  const keys = new Set(
    (existing ?? []).map((row) => `${row.category}:${String(row.label).trim().toLowerCase()}`)
  );
  const rows = TODDLER_ROUTINE_CATEGORIES.flatMap((category) =>
    DEFAULT_TODDLER_ROUTINES[category].map((label, index) => ({
      school_id: schoolId,
      category,
      label,
      sort_order: (index + 1) * 10,
    }))
  ).filter((row) => !keys.has(`${row.category}:${row.label.trim().toLowerCase()}`));
  if (rows.length) await supabase.from("toddler_routine_options").insert(rows);
}

function linesForEntries(title: string, entries: ToddlerTimedEntry[], includeDetail = false) {
  if (entries.length === 0) return [`${title}: Not recorded`];
  return [
    `${title}:`,
    ...entries.map((entry) => {
      const detail = includeDetail && entry.detail?.trim() ? ` — ${entry.detail.trim()}` : "";
      return `• ${entry.time || "Time not set"} — ${entry.outcome || "Not recorded"}${detail}`;
    }),
  ];
}

export function toddlerDailyLogReportHtml(log: ToddlerDailyLog, attendance: string | null): string {
  const lines = [
    `Attendance: ${attendance ?? "Not recorded"}`,
    `Mood: ${log.mood || "Not recorded"}`,
    `Nap: ${log.nap || "Not recorded"}`,
    `Class participation: ${log.participation || "Not recorded"}`,
    "",
    ...linesForEntries("Potty time / diapering", log.toiletingEntries),
    "",
    ...linesForEntries("Feeding", log.feedingEntries, true),
    "",
    ...linesForEntries("Outdoor play", log.outdoorPlayEntries),
    "",
    `Activities: ${log.activityLabels.length ? log.activityLabels.join(", ") : "Not recorded"}`,
    `Montessori materials: ${log.materialLabels.length ? log.materialLabels.join(", ") : "Not recorded"}`,
    `Other notes: ${log.otherNotes.trim() || "None"}`,
    `Teacher comments: ${log.teacherComments.trim() || "None"}`,
  ];
  return plainTextToReportParagraphHtml(lines.join("\n"));
}
