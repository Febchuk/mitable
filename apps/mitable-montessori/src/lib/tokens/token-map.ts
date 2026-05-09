import type { DetokenizeResult, ResolvedEntity, TokenMap, TokenRef } from "./types";
import { TOKEN_RE } from "./format";

/**
 * Per-request `TokenMap` lifecycle:
 *
 *   1. The route layer (`/api/agent/chat`) calls `buildTokenMap(refs)` to
 *      build a fresh map from the teacher's resolved roster.
 *   2. `redact()` rewrites the user message + any tool outputs containing
 *      free-text by replacing display strings with `{{kind:UUID}}` tokens.
 *   3. The model reasons in tokens. Output is validated then `detokenize()`d.
 *   4. `detokenize()` returns the rendered text plus an `entities[]` array
 *      with offsets, so the UI can render chips/links over the right ranges.
 *
 * The map is in-memory only. Only the per-message `tokenMapSnapshot` (a JSON
 * serialization of `refs[]`) is persisted alongside `body_tokenized` so that
 * a row written today still renders correctly if a student is renamed
 * tomorrow.
 */

const RX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(RX_ESCAPE, "\\$&");
}

export function buildTokenMap(refs: TokenRef[]): TokenMap {
  const forward = new Map<string, string>();
  const reverse = new Map<string, TokenRef>();
  for (const r of refs) {
    if (r.display && r.display.trim().length >= 2) {
      // Lowercase the key so lookups are case-insensitive. The redactor
      // does its own case-insensitive replace via regex; this map is for
      // direct lookups (e.g. "did the user mention 'Amelia'?").
      forward.set(r.display.trim().toLowerCase(), r.token);
    }
    reverse.set(r.token.toLowerCase(), r);
  }
  return { forward, reverse };
}

/** Serializable snapshot of the refs that built a TokenMap. */
export function snapshotTokenMap(map: TokenMap): TokenRef[] {
  return Array.from(map.reverse.values());
}

export function tokenMapFromSnapshot(snapshot: TokenRef[]): TokenMap {
  return buildTokenMap(snapshot);
}

/**
 * Replace every display string in `text` with its corresponding token. Whole-
 * word match, case-insensitive. Longer displays are tried before shorter ones
 * so "Amelia Hart" wins over "Amelia" when both are present.
 *
 * Important: this does NOT detect *invented* names — only those known to the
 * tokenMap. The validator (`validate-output.ts`) catches the hallucination
 * direction (model emits unknown UUID).
 */
export function redact(text: string, map: TokenMap): string {
  if (!text) return text;
  const refs = Array.from(map.reverse.values())
    .filter((r) => r.display && r.display.trim().length >= 2)
    .sort((a, b) => b.display.length - a.display.length);
  let out = text;
  for (const r of refs) {
    const escaped = escapeRegex(r.display.trim());
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    out = out.replace(re, r.token);
  }
  return out;
}

/**
 * Replace tokens with display strings and report char offsets of every entity
 * occurrence in the rendered text. Offsets index the *output* text, not the
 * tokenized input — this is what the UI wants for chip rendering.
 *
 * Unknown tokens (not in the map) are kept verbatim. The validator should
 * have already rejected them; this is a last-line-of-defense behaviour so we
 * don't crash on bad data.
 */
export function detokenize(text: string, map: TokenMap): DetokenizeResult {
  if (!text) return { text: "", entities: [] };

  const re = new RegExp(TOKEN_RE.source, "gi");
  const entitiesById = new Map<string, ResolvedEntity>();
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    out += before;
    const ref = map.reverse.get(m[0].toLowerCase());
    if (ref) {
      const start = out.length;
      out += ref.display;
      const end = out.length;
      const key = `${ref.kind}:${ref.id}`;
      const existing = entitiesById.get(key);
      if (existing) {
        existing.offsets.push([start, end]);
      } else {
        entitiesById.set(key, {
          kind: ref.kind,
          id: ref.id,
          display: ref.display,
          offsets: [[start, end]],
        });
      }
    } else {
      // Unknown token — pass through verbatim.
      out += m[0];
    }
    lastIndex = m.index + m[0].length;
  }
  out += text.slice(lastIndex);

  return { text: out, entities: Array.from(entitiesById.values()) };
}
