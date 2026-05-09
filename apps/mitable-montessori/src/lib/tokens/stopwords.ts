/**
 * Common English fragments that may appear inside a multi-word display string
 * (e.g. "this classroom", "main room", "the student"). Validators and redactors
 * skip these as standalone fragments — the full multi-word display is still
 * matched verbatim, but per-word splits like "the" or "room" don't become
 * forbidden tokens that would reject every benign sentence.
 *
 * Extracted from src/lib/reports/token-preservation.ts so both the new general
 * agent's validator and the migrated report-chat validator share the same set.
 */
export const STOPWORD_FRAGMENTS: ReadonlySet<string> = new Set([
  "this",
  "that",
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "student",
  "students",
  "teacher",
  "teachers",
  "child",
  "children",
  "kid",
  "kids",
  "room",
  "class",
  "classroom",
  "classrooms",
  "report",
  "reports",
  "note",
  "notes",
  "day",
  "days",
  "time",
  "times",
  "name",
  "names",
  "today",
  "morning",
  "afternoon",
  "evening",
]);
