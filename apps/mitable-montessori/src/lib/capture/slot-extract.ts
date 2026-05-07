"use client";

/**
 * Pure regex slot extractors used by the on-device resolver. No model load,
 * no async — operates on tokenized text where student/subtopic spans have
 * already been replaced by `[STUDENT_n]` / `[SUBTOPIC_n]` tokens.
 *
 * Status priority: MASTERED → INTRODUCED → PRESENT/ABSENT → PRACTICING.
 * Verbs that read like both "introduced" and "practicing" (e.g. "started")
 * should fall to introduced.
 */

const ATTENDANCE_PRESENT =
  /\b(here|present|in|showed up|checked in|made it|arrived)\b/i;
const ATTENDANCE_ABSENT =
  /\b(out|absent|away|sick|home|missing|didn'?t come|didn'?t show|called (in )?(out|sick))\b/i;

const MASTERED =
  /\b(mastered|finished|got it|nailed|completed|can do( it)?( now)?|independently|on (his|her|their) own|without help|unprompted)\b/i;
const INTRODUCED =
  /\b(introduce[d]?|introducing|presented|first time|new to|started on|showed .* how)\b/i;
const PRACTICING =
  /\b(practic(ed|ing)|tried|working on|worked on|attempted|used|chose|picked|built|did|made|set up|laid out|poured|spilling)\b/i;

const STUDENT_TOKEN = /\[STUDENT_(\d+)\]/;
const SUBTOPIC_TOKEN = /\[SUBTOPIC_(\d+)\]/;

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

export function extractAttendanceStatus(text: string): "present" | "absent" | null {
  // Test absent first because "out sick" / "didn't come" should win over the
  // bare "in" present marker that often appears earlier in the same sentence.
  if (ATTENDANCE_ABSENT.test(text)) return "absent";
  if (ATTENDANCE_PRESENT.test(text)) return "present";
  return null;
}

export function extractMasteryStatus(
  text: string
): "introduced" | "practicing" | "mastered" | null {
  if (MASTERED.test(text)) return "mastered";
  if (INTRODUCED.test(text)) return "introduced";
  if (PRACTICING.test(text)) return "practicing";
  return null;
}

export function firstStudentToken(text: string): string | null {
  const m = text.match(STUDENT_TOKEN);
  return m ? m[0] : null;
}

export function firstSubtopicToken(text: string): string | null {
  const m = text.match(SUBTOPIC_TOKEN);
  return m ? m[0] : null;
}

export function hasStudentToken(text: string): boolean {
  return STUDENT_TOKEN.test(text);
}

export function hasSubtopicToken(text: string): boolean {
  return SUBTOPIC_TOKEN.test(text);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Resolve the date for an attendance/event call. Defaults to `todayIso`. If
 * the text contains an explicit `today` / `yesterday` / `tomorrow` / ISO date,
 * shift accordingly. Returns YYYY-MM-DD.
 */
export function extractDate(text: string, todayIso: string): string {
  const iso = text.match(ISO_DATE);
  if (iso) return iso[1];
  if (/\byesterday\b/i.test(text)) return shiftDate(todayIso, -1);
  if (/\btomorrow\b/i.test(text)) return shiftDate(todayIso, 1);
  return todayIso;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a comment from whatever's left after stripping the student / subtopic
 * tokens, the matched status verb spans, and any explicit date phrase. Caller
 * passes any additional spans they want stripped via `removed`.
 */
export function extractComment(text: string, removed: string[] = []): string {
  let working = text;

  for (const span of removed) {
    if (!span) continue;
    working = working.split(span).join(" ");
  }

  working = working
    .replace(STUDENT_TOKEN, " ")
    .replace(SUBTOPIC_TOKEN, " ")
    .replace(/\b(today|yesterday|tomorrow)\b/gi, " ")
    .replace(ISO_DATE, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?-]+|[\s.,;:!?-]+$/g, "")
    .trim();

  return working.slice(0, 500);
}

/**
 * Find the first matched span for the given status. Used by `extractComment`
 * callers that want to strip the verb that drove the classification.
 */
export function attendanceVerbSpan(text: string): string | null {
  const a = text.match(ATTENDANCE_PRESENT) ?? text.match(ATTENDANCE_ABSENT);
  return a ? a[0] : null;
}

export function masteryVerbSpan(text: string): string | null {
  const m = text.match(MASTERED) ?? text.match(INTRODUCED) ?? text.match(PRACTICING);
  return m ? m[0] : null;
}
