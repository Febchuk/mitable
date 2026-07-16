export const MARKING_SCHEMAS = ["ipm", "five_level"] as const;
export type MarkingSchema = (typeof MARKING_SCHEMAS)[number];

export const PROGRESS_STATUSES = [
  "introduced",
  "practicing",
  "mastered",
  "none",
  "minimum",
  "satisfactory",
  "good",
  "excellent",
  "na",
] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export const REPORTABLE_PROGRESS_STATUSES = [
  "introduced",
  "practicing",
  "mastered",
  "none",
  "minimum",
  "satisfactory",
  "good",
  "excellent",
] as const;
export type ReportableProgressStatus = (typeof REPORTABLE_PROGRESS_STATUSES)[number];

export type ProgressMark = "i" | "p" | "m" | "n" | "min" | "sat" | "g" | "e" | "-";

export type ProgressLevel = {
  mark: ProgressMark;
  status: ProgressStatus;
  label: string;
  color: string;
};

const CLEAR_LEVEL: ProgressLevel = {
  mark: "-",
  status: "na",
  label: "Not started",
  color: "var(--color-border)",
};

export const PROGRESS_LEVELS: Record<MarkingSchema, readonly ProgressLevel[]> = {
  ipm: [
    { mark: "m", status: "mastered", label: "Mastered", color: "var(--color-sage)" },
    { mark: "p", status: "practicing", label: "Practicing", color: "var(--color-butter)" },
    { mark: "i", status: "introduced", label: "Introduced", color: "var(--color-clay)" },
  ],
  five_level: [
    { mark: "e", status: "excellent", label: "Excellent", color: "var(--color-scale-excellent)" },
    { mark: "g", status: "good", label: "Good", color: "var(--color-scale-good)" },
    {
      mark: "sat",
      status: "satisfactory",
      label: "Satisfactory",
      color: "var(--color-scale-satisfactory)",
    },
    { mark: "min", status: "minimum", label: "Minimum", color: "var(--color-scale-minimum)" },
    { mark: "n", status: "none", label: "None", color: "var(--color-scale-none)" },
  ],
};

export const ALL_PROGRESS_LEVELS = [
  ...PROGRESS_LEVELS.ipm,
  ...PROGRESS_LEVELS.five_level,
  CLEAR_LEVEL,
] as const;

export const STATUS_LABEL = Object.fromEntries(
  ALL_PROGRESS_LEVELS.map((level) => [level.mark, level.label])
) as Record<ProgressMark, string>;

export const STATUS_COLOR = Object.fromEntries(
  ALL_PROGRESS_LEVELS.map((level) => [level.mark, level.color])
) as Record<ProgressMark, string>;

const STATUS_TO_MARK = new Map(ALL_PROGRESS_LEVELS.map((level) => [level.status, level.mark]));
const MARK_TO_STATUS = new Map(ALL_PROGRESS_LEVELS.map((level) => [level.mark, level.status]));

export function levelsForSchema(
  schema: MarkingSchema,
  includeClear = false
): readonly ProgressLevel[] {
  return includeClear ? [...PROGRESS_LEVELS[schema], CLEAR_LEVEL] : PROGRESS_LEVELS[schema];
}

export function marksForSchema(schema: MarkingSchema, includeClear = false): ProgressMark[] {
  return levelsForSchema(schema, includeClear).map((level) => level.mark);
}

export function markToStatus(mark: ProgressMark): ProgressStatus {
  return MARK_TO_STATUS.get(mark) ?? "na";
}

export function statusToMark(status: ProgressStatus): ProgressMark {
  return STATUS_TO_MARK.get(status) ?? "-";
}

export function schemaForStatus(status: ProgressStatus): MarkingSchema | null {
  if (PROGRESS_LEVELS.ipm.some((level) => level.status === status)) return "ipm";
  if (PROGRESS_LEVELS.five_level.some((level) => level.status === status)) return "five_level";
  return null;
}

export function statusAllowedForSchema(status: ProgressStatus, schema: MarkingSchema): boolean {
  return status === "na" || PROGRESS_LEVELS[schema].some((level) => level.status === status);
}

export function normalizeMarkingSchema(value: unknown): MarkingSchema {
  return value === "five_level" ? "five_level" : "ipm";
}
