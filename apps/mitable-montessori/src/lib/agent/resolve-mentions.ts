import Fuse from "fuse.js";
import { buildTokenMap, redact } from "@/lib/tokens/token-map";
import { formatStudentToken } from "@/lib/tokens/format";
import type { TokenMap, TokenRef } from "@/lib/tokens/types";
import type { RosterStudent } from "./roster";

/**
 * Mention resolver. Given a teacher's free-text message + their roster,
 * return:
 *
 *   - `tokenMap`: ready for `redact()` and `validateAgentOutput()` (covers
 *     the canonical display string for every resolved student — used to
 *     scrub tool outputs and validate model output).
 *   - `rewrittenMessage`: the original message with the actual matched word
 *     fragments replaced by `{{student:UUID}}` tokens. We replace the
 *     fragment-as-typed (e.g. "Amelia") rather than only the canonical
 *     display ("Amelia Hart") because the user may type either.
 *   - `ambiguities`: terms that fuzzy-matched multiple students within the
 *     ambiguity window. The route should bounce these back to the UI as a
 *     disambiguation prompt rather than guessing.
 *
 * UI-supplied `mentions[]` always wins. When the UI says "I mean Liam Singh"
 * we trust that even if fuzzy matching also finds Liam Garcia.
 *
 * Fuse options mirror `src/lib/tokenize/tokenize.ts:35-40` and
 * `roster-index.ts:35-40` so server-side fuzzy behavior matches the
 * browser-side capture flow's behavior.
 */

const FUSE_OPTS = {
  includeScore: true,
  threshold: 0.3,
  ignoreLocation: true,
  keys: ["needles"],
};

const AMBIGUITY_WINDOW = 0.05;

export interface InboundMention {
  kind: "student";
  id: string;
  display: string;
}

export interface AmbiguousMatch {
  /** The text fragment that matched. */
  fragment: string;
  /** Top candidates within the ambiguity window. */
  candidates: Array<{ id: string; display: string; score: number }>;
}

export interface ResolveResult {
  tokenMap: TokenMap;
  rewrittenMessage: string;
  ambiguities: AmbiguousMatch[];
  refs: TokenRef[];
}

const RX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(RX_ESCAPE, "\\$&");
}

interface PendingMatch {
  studentId: string;
  /** The literal substring of the original message that matched. */
  fragment: string;
}

export function resolveMentions(args: {
  message: string;
  roster: RosterStudent[];
  inboundMentions?: InboundMention[];
}): ResolveResult {
  const message = args.message ?? "";
  const matchedIds = new Set<string>();
  const inboundIds = new Set<string>((args.inboundMentions ?? []).map((m) => m.id));
  const pending: PendingMatch[] = [];

  // 1. Inbound mentions from the UI win. We still try to redact their
  // display string in the message body if it appears verbatim.
  for (const m of args.inboundMentions ?? []) {
    matchedIds.add(m.id);
  }

  // 2. Fuzzy-match every word window in the message against the roster.
  const ambiguities: AmbiguousMatch[] = [];
  if (args.roster.length > 0 && message.trim().length > 0) {
    const fuse = new Fuse(args.roster, FUSE_OPTS);
    const words = message.split(/(\s+|[,.;!?])/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!w || /^\s+$/.test(w) || /^[,.;!?]$/.test(w)) continue;
      let matched = false;
      for (let win = 4; win >= 1; win--) {
        const slice = words.slice(i, i + win * 2 - 1);
        const wordChunks = slice.filter((t, idx) => idx % 2 === 0 && t && !/^\s+$/.test(t));
        if (wordChunks.length !== win) continue;
        const phrase = wordChunks.join(" ").trim();
        // Min length 3: "me", "in", "is" etc. fuzz-match to first names
        // (Amelia, Liam, …) too eagerly. The browser-side tokenize.ts gets
        // away with shorter phrases because it weighs subtopics too.
        if (phrase.length < 3) continue;
        const results = fuse.search(phrase, { limit: 3 });
        const best = results[0];
        if (!best || (best.score ?? 1) > 0.4) continue;
        const second = results[1];
        // If any of the top candidates is an inbound (UI-resolved) mention,
        // collapse to that one. Otherwise, ambiguity is a real ambiguity.
        const inboundCandidate = results.find((r) => inboundIds.has(r.item.id));
        const ambiguous =
          !inboundCandidate &&
          second &&
          Math.abs((second.score ?? 1) - (best.score ?? 1)) < AMBIGUITY_WINDOW;
        if (ambiguous) {
          ambiguities.push({
            fragment: phrase,
            candidates: results.slice(0, 3).map((r) => ({
              id: r.item.id,
              display: r.item.display,
              score: r.score ?? 1,
            })),
          });
          matched = true;
          i += win * 2 - 2;
          break;
        }
        const chosenId = inboundCandidate ? inboundCandidate.item.id : best.item.id;
        matchedIds.add(chosenId);
        pending.push({ studentId: chosenId, fragment: phrase });
        matched = true;
        i += win * 2 - 2;
        break;
      }
      if (!matched) continue;
    }
  }

  // 3. Build refs. Each matched id appears once.
  const byId = new Map(args.roster.map((s) => [s.id, s]));
  const refs: TokenRef[] = [];
  for (const id of matchedIds) {
    const s = byId.get(id);
    if (!s) {
      const inbound = (args.inboundMentions ?? []).find((m) => m.id === id);
      if (!inbound) continue;
      refs.push({
        id: inbound.id,
        display: inbound.display,
        kind: "student",
        token: formatStudentToken(inbound.id),
      });
      continue;
    }
    refs.push({
      id: s.id,
      display: s.display,
      kind: "student",
      token: formatStudentToken(s.id),
    });
  }
  const tokenMap = buildTokenMap(refs);

  // 4. Rewrite the message. Two passes:
  //    a) replace the literal fragments fuzzy-matched, so "Amelia" -> token.
  //    b) run redact() on the rest so any canonical display string still in
  //       the message (e.g. "Amelia Hart") gets caught.
  let rewritten = message;
  // Sort fragments longest-first so "Amelia Hart" wins over "Amelia".
  const sortedPending = [...pending].sort((a, b) => b.fragment.length - a.fragment.length);
  for (const p of sortedPending) {
    const ref = refs.find((r) => r.id === p.studentId);
    if (!ref) continue;
    const re = new RegExp(`\\b${escapeRegex(p.fragment)}\\b`, "gi");
    rewritten = rewritten.replace(re, ref.token);
  }
  rewritten = redact(rewritten, tokenMap);

  return { tokenMap, rewrittenMessage: rewritten, ambiguities, refs };
}
