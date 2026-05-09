import type { TokenKind } from "./types";

/**
 * Token format primitives. The wire grammar is `{{kind:UUID}}` where UUID is a
 * standard v4 string (8-4-4-4-12 hex). One regex governs the whole codebase
 * after Track B; do not introduce a competing pattern.
 */

const UUID_RE_SRC = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Matches every token in a string. Use `.matchAll()` or recreate via
 * `new RegExp(TOKEN_RE.source, "g")` if you need to re-use across iterations
 * (RegExp.lastIndex is stateful with /g).
 */
export const TOKEN_RE = new RegExp(
  `\\{\\{(student|subtopic|classroom|guardian):(${UUID_RE_SRC})\\}\\}`,
  "gi"
);

/** Single-token match (used to test or validate a candidate string). */
export const TOKEN_RE_SINGLE = new RegExp(
  `^\\{\\{(student|subtopic|classroom|guardian):(${UUID_RE_SRC})\\}\\}$`,
  "i"
);

export function formatToken(kind: TokenKind, uuid: string): string {
  return `{{${kind}:${uuid}}}`;
}

export const formatStudentToken = (uuid: string) => formatToken("student", uuid);
export const formatSubtopicToken = (uuid: string) => formatToken("subtopic", uuid);
export const formatClassroomToken = (uuid: string) => formatToken("classroom", uuid);
export const formatGuardianToken = (uuid: string) => formatToken("guardian", uuid);

export interface ParsedToken {
  kind: TokenKind;
  id: string;
  /** The raw match (e.g. `{{student:UUID}}`). */
  raw: string;
}

/** Parse a single token string. Returns null if it doesn't match. */
export function parseToken(s: string): ParsedToken | null {
  const m = TOKEN_RE_SINGLE.exec(s);
  if (!m) return null;
  return { kind: m[1].toLowerCase() as ParsedToken["kind"], id: m[2].toLowerCase(), raw: s };
}

/** Extract every token in `text` in order of appearance. */
export function extractTokens(text: string): ParsedToken[] {
  const re = new RegExp(TOKEN_RE.source, "gi");
  const out: ParsedToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      kind: m[1].toLowerCase() as ParsedToken["kind"],
      id: m[2].toLowerCase(),
      raw: m[0],
    });
  }
  return out;
}

/** True if `s` is exactly one token. */
export function isToken(s: string): boolean {
  return TOKEN_RE_SINGLE.test(s);
}
