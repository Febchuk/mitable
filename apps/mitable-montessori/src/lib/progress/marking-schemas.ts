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
  "not_applicable",
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

export type ProgressMark = "i" | "p" | "m" | "n" | "min" | "sat" | "g" | "e" | "-" | "na";

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

// Distinct from CLEAR_LEVEL ("Not started"): a subtopic a teacher has
// deliberately marked as not applicable, so it no longer reads as "missed".
// Universal (offered for every schema), like clearing.
const NOT_APPLICABLE_LEVEL: ProgressLevel = {
  mark: "na",
  status: "not_applicable",
  label: "N/A",
  color: "var(--color-scale-na)",
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
  NOT_APPLICABLE_LEVEL,
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
  if (!includeClear) return PROGRESS_LEVELS[schema];
  // N/A is offered only on the IPM scheme (the school's request). Five-level
  // grades keep their existing ratings plus the clear action.
  const clearActions = schema === "ipm" ? [NOT_APPLICABLE_LEVEL, CLEAR_LEVEL] : [CLEAR_LEVEL];
  return [...PROGRESS_LEVELS[schema], ...clearActions];
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
  return (
    status === "na" ||
    (status === "not_applicable" && schema === "ipm") ||
    PROGRESS_LEVELS[schema].some((level) => level.status === status)
  );
}

export function normalizeMarkingSchema(value: unknown): MarkingSchema {
  return value === "five_level" ? "five_level" : "ipm";
}
