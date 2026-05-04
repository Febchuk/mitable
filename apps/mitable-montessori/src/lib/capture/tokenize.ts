import Fuse from "fuse.js";

export type RosterEntry = { id: string; name: string };

export type TokenMapEntry = {
  token: string;
  studentId: string;
  matchedText: string;
};

export type FuzzyResult = {
  /** Original text with student-name spans replaced by `[STUDENT_n]` markers. */
  tokenizedText: string;
  /** Map of `[STUDENT_n]` token → student id + the original matched span. */
  tokenMap: TokenMapEntry[];
};

/**
 * Replace student-name occurrences in `text` with `[STUDENT_n]` markers,
 * matching against `roster` first names + full names. Score threshold
 * of 0.4 is conservative — we'd rather miss a match than tokenize the
 * wrong child.
 */
export function fuzzyMatchRoster(text: string, roster: RosterEntry[]): FuzzyResult {
  if (!text.trim() || roster.length === 0) {
    return { tokenizedText: text, tokenMap: [] };
  }

  // Build a lookup with both first names and full names per student.
  const candidates: Array<{ phrase: string; studentId: string }> = [];
  for (const r of roster) {
    const parts = r.name.split(/\s+/).filter(Boolean);
    if (parts.length > 0) candidates.push({ phrase: parts[0], studentId: r.id });
    candidates.push({ phrase: r.name, studentId: r.id });
  }

  const fuse = new Fuse(candidates, {
    keys: ["phrase"],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 3,
  });

  // Walk word-by-word looking for matches. Keep a running counter so we
  // emit `[STUDENT_1]`, `[STUDENT_2]`, … in document order.
  const tokens: TokenMapEntry[] = [];
  const studentIdToToken = new Map<string, string>();
  let counter = 1;
  const out: string[] = [];

  // Split on whitespace but keep the delimiters so the rebuilt string preserves spacing.
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part.trim() || /^\s+$/.test(part)) {
      out.push(part);
      continue;
    }
    const cleaned = part.replace(/[.,!?;:]/g, "");
    const result = fuse.search(cleaned, { limit: 1 });
    const top = result[0];
    if (top && (top.score ?? 1) <= 0.3) {
      const studentId = top.item.studentId;
      let token = studentIdToToken.get(studentId);
      if (!token) {
        token = `[STUDENT_${counter++}]`;
        studentIdToToken.set(studentId, token);
        tokens.push({ token, studentId, matchedText: cleaned });
      }
      // Preserve trailing punctuation so the sentence reads naturally.
      const punct = part.match(/[.,!?;:]+$/)?.[0] ?? "";
      out.push(token + punct);
    } else {
      out.push(part);
    }
  }

  return { tokenizedText: out.join(""), tokenMap: tokens };
}
