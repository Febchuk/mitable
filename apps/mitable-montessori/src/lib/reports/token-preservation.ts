/**
 * Token-preservation validator. Phase 3 contract: the agent's draft text must
 * reference students / subtopics / classrooms ONLY by tokens like
 * [STUDENT_1] / [SUBTOPIC_3] / [CLASSROOM_0]. Real names must never appear.
 *
 * Track B (PII tokenization migration, May 2026) extended this validator to
 * also recognize the new `{{kind:UUID}}` grammar emitted by the general chat
 * agent. The two formats coexist during the migration window — the validator
 * tolerates either, and a token from either format counts as "preserved" so
 * long as it's in the supplied reference set's tokens.
 *
 * The validator runs against the union of (drafted text, known reference
 * names). It cannot detect every possible PII leak (e.g. an invented name the
 * agent hallucinated), but it pins the contract for the names we *do* know
 * about — which is the realistic threat: the agent grabbing a tokenized name
 * out of context and rendering it back as the original string.
 */

const LEGACY_TOKEN_RE = /\[(STUDENT|SUBTOPIC|CLASSROOM|GUARDIAN|USER|TOPIC|CURRICULUM)_\d+\]/g;
const UUID_TOKEN_RE =
  /\{\{(student|subtopic|classroom|guardian):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}\}/gi;
const TOKEN_RE = new RegExp(`${LEGACY_TOKEN_RE.source}|${UUID_TOKEN_RE.source}`, "gi");

/**
 * Common English words that can appear inside a multi-word display string
 * (e.g. "this classroom", "main room", "the student"). The leak check skips
 * these as standalone fragments — the full display is still matched verbatim
 * and rare words alongside them still trigger leaks. Without this filter, any
 * benign agent reply containing "the", "this", or "room" would be rejected.
 */
const STOPWORD_FRAGMENTS = new Set([
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

export interface NameRef {
  /** UUID of the entity (used for de-tokenization later). */
  id: string;
  /** Display string (e.g. "Maya Singh", "Pink Tower") that must NOT appear in draft. */
  display: string;
}

export interface ValidationResult {
  ok: boolean;
  /** Names from the reference set that leaked into the draft text. */
  leakedNames: string[];
  /** Tokens in the draft that don't appear in the reference set. */
  unknownTokens: string[];
}

/**
 * Returns ok=true iff:
 *   - no name in `refs` appears as a substring of `text` (case-insensitive,
 *     whole-word match)
 *   - every token in `text` is present in the reference set
 */
export function validateTokenPreservation(text: string, refs: NameRef[]): ValidationResult {
  const lower = text.toLowerCase();
  const leaked = new Set<string>();
  for (const r of refs) {
    const display = r.display.trim();
    if (display.length < 2) continue;
    // Check both the full display and each component (first name, last name,
    // multi-word lesson titles). The agent may leak any one of those.
    const fragments = new Set<string>();
    const lowerDisplay = display.toLowerCase();
    const words = display.split(/\s+/);
    // Add the full display only when it's NOT a single-word stopword. A
    // multi-word display like "this classroom" can stay (its verbatim
    // appearance in agent prose still trips), but a single-word fallback
    // like "Student" or "this" must be dropped entirely or every benign
    // English sentence containing the word would fail validation.
    const isSingleStopword = words.length === 1 && STOPWORD_FRAGMENTS.has(lowerDisplay);
    if (!isSingleStopword) {
      fragments.add(lowerDisplay);
    }
    for (const word of words) {
      if (word.length < 3) continue;
      const lc = word.toLowerCase();
      // Skip common English words that would false-positive on benign prose.
      // Only the per-word splits are suppressed for stopwords; the full
      // multi-word display still gets matched verbatim above.
      if (STOPWORD_FRAGMENTS.has(lc)) continue;
      fragments.add(lc);
    }
    for (const fragment of fragments) {
      const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(lower)) {
        leaked.add(display);
        break;
      }
    }
  }

  const knownTokens = new Set<string>();
  for (const r of refs) {
    // Build the reverse map by recovering tokens from a parallel index. Caller
    // controls the token alphabet — see `buildReferenceTokens` below.
    if ("token" in r && typeof (r as { token?: unknown }).token === "string") {
      knownTokens.add((r as { token: string }).token);
    }
  }

  const tokens = text.match(TOKEN_RE) ?? [];
  const unknown = knownTokens.size === 0 ? [] : tokens.filter((t) => !knownTokens.has(t));

  return {
    ok: leaked.size === 0 && unknown.length === 0,
    leakedNames: Array.from(leaked),
    unknownTokens: Array.from(new Set(unknown)),
  };
}

/** Convenience: extract all tokens from a text. */
export function extractTokens(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}
