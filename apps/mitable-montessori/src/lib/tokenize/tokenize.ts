"use client";

import { buildRosterIndex } from "@/lib/tokenize/roster-index";
import type { TokenizeResult, TokenReference } from "@/lib/tokenize/types";

/**
 * Greedy longest-match tokenizer. Walks word windows over the input text and
 * looks for matches in the cached Roster + Subtopic indexes. Replaces matches
 * with `[STUDENT_n]` / `[SUBTOPIC_n]` tokens.
 *
 * Ambiguity: if the top two candidates for a window score within 0.05 of each
 * other, we mark the result `ambiguous` so the LLM should reply with
 * `request_clarification` rather than guessing.
 */
export async function tokenizeText(raw: string): Promise<TokenizeResult> {
  const index = await buildRosterIndex();
  const refs: TokenReference[] = [];
  const seen = new Map<string, string>(); // id → token (so the same student gets the same token)
  let nextStudent = 1;
  let nextSubtopic = 1;
  let ambiguous = false;

  // Tokenize on word boundaries. We try windows of 4..1 words at each position,
  // longest first, so "pink tower" matches before "pink".
  const words = raw.split(/(\s+|[,.;!?])/); // keep separators
  const out: string[] = [];
  let i = 0;

  while (i < words.length) {
    const tok = words[i];
    if (!tok || /^\s+$/.test(tok) || /^[,.;!?]$/.test(tok)) {
      out.push(tok);
      i++;
      continue;
    }

    let matched = false;
    for (let win = 4; win >= 1; win--) {
      const slice = words.slice(i, i + win * 2 - 1);
      // Reject windows that don't end on a word.
      if (slice.length === 0) continue;
      const wordChunks = slice.filter((t, idx) => idx % 2 === 0 && t && !/^\s+$/.test(t));
      if (wordChunks.length !== win) continue;
      const phrase = wordChunks.join(" ").trim();
      if (!phrase || phrase.length < 2) continue;

      // Try students first, then subtopics.
      const studentResults = index.students.search(phrase, { limit: 3 });
      const subtopicResults = index.subtopics.search(phrase, { limit: 3 });

      const bestStudent = studentResults[0];
      const bestSubtopic = subtopicResults[0];
      const candidates: Array<{
        kind: "student" | "subtopic";
        score: number;
        id: string;
        display: string;
      }> = [];
      if (bestStudent && (bestStudent.score ?? 1) <= 0.4) {
        candidates.push({
          kind: "student",
          score: bestStudent.score ?? 1,
          id: bestStudent.item.id,
          display: bestStudent.item.display,
        });
      }
      if (bestSubtopic && (bestSubtopic.score ?? 1) <= 0.4) {
        candidates.push({
          kind: "subtopic",
          score: bestSubtopic.score ?? 1,
          id: bestSubtopic.item.id,
          display: bestSubtopic.item.display,
        });
      }
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => a.score - b.score);
      const best = candidates[0];
      const second = candidates[1];
      if (second && Math.abs(second.score - best.score) < 0.05) {
        ambiguous = true;
      }

      let token = seen.get(best.id);
      if (!token) {
        if (best.kind === "student") {
          token = `[STUDENT_${nextStudent++}]`;
        } else {
          token = `[SUBTOPIC_${nextSubtopic++}]`;
        }
        seen.set(best.id, token);
        refs.push({ token, id: best.id, display: best.display, kind: best.kind });
      }
      out.push(token);
      i += win * 2 - 1;
      matched = true;
      break;
    }

    if (!matched) {
      out.push(tok);
      i++;
    }
  }

  return {
    tokenizedText: out.join("").replace(/\s+/g, " ").trim(),
    references: refs,
    ambiguous,
  };
}
