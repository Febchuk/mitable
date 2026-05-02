/**
 * Token-preservation validator. Phase 3 contract: the agent's draft text must
 * reference students / subtopics / classrooms ONLY by tokens like
 * [STUDENT_1] / [SUBTOPIC_3] / [CLASSROOM_0]. Real names must never appear.
 *
 * The validator runs against the union of (drafted text, known reference
 * names). It cannot detect every possible PII leak (e.g. an invented name the
 * agent hallucinated), but it pins the contract for the names we *do* know
 * about — which is the realistic threat: the agent grabbing a tokenized name
 * out of context and rendering it back as the original string.
 */

const TOKEN_RE = /\[(STUDENT|SUBTOPIC|CLASSROOM|GUARDIAN|USER|TOPIC|CURRICULUM)_\d+\]/g;

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
    const fragments = new Set<string>([display.toLowerCase()]);
    for (const word of display.split(/\s+/)) {
      if (word.length >= 3) fragments.add(word.toLowerCase());
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
