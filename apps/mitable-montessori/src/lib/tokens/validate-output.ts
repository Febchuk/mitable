import { TOKEN_RE } from "./format";
import { STOPWORD_FRAGMENTS } from "./stopwords";
import type { TokenMap } from "./types";

/**
 * Hallucination + leak guard for model output. Two failure modes:
 *
 *   - Unknown UUID: model emits `{{student:UUID}}` whose UUID is not in
 *     `tokenMap.reverse`. This is a hallucination — the model invented a
 *     student. The route should regenerate once with a strong reminder, then
 *     fail closed (synthetic clarify message rather than a 500).
 *
 *   - Leaked name: model emits a known display string verbatim instead of the
 *     token (e.g. "Amelia is doing great" rather than "{{student:UUID}} is
 *     doing great"). Same recovery path.
 *
 * Stop-word filtering: a multi-word display like "Sunshine Room" is matched
 * verbatim (so "Sunshine Room" in output trips), but per-word splits like
 * "Room" are skipped because they would false-positive on benign prose.
 */

export interface ValidationResult {
  ok: boolean;
  /** Display strings from the token map that appeared verbatim in output. */
  leakedNames: string[];
  /** Tokens whose UUID isn't in the token map. */
  unknownTokens: string[];
}

const RX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

export function validateAgentOutput(text: string, map: TokenMap): ValidationResult {
  const lower = text.toLowerCase();

  // Leak check ----------------------------------------------------------------
  const leaked = new Set<string>();
  for (const ref of map.reverse.values()) {
    const display = ref.display.trim();
    if (display.length < 2) continue;
    const lowerDisplay = display.toLowerCase();
    const words = display.split(/\s+/);
    const fragments = new Set<string>();
    const isSingleStopword = words.length === 1 && STOPWORD_FRAGMENTS.has(lowerDisplay);
    if (!isSingleStopword) {
      fragments.add(lowerDisplay);
    }
    for (const word of words) {
      if (word.length < 3) continue;
      const lc = word.toLowerCase();
      if (STOPWORD_FRAGMENTS.has(lc)) continue;
      fragments.add(lc);
    }
    for (const fragment of fragments) {
      const escaped = fragment.replace(RX_ESCAPE, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(lower)) {
        leaked.add(display);
        break;
      }
    }
  }

  // Unknown-token check -------------------------------------------------------
  const re = new RegExp(TOKEN_RE.source, "gi");
  const unknown = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!map.reverse.has(m[0].toLowerCase())) {
      unknown.add(m[0]);
    }
  }

  return {
    ok: leaked.size === 0 && unknown.size === 0,
    leakedNames: Array.from(leaked),
    unknownTokens: Array.from(unknown),
  };
}
