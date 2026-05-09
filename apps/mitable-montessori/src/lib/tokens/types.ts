/**
 * Shared token grammar used by:
 *   - the new general chat agent (`POST /api/agent/chat`)
 *   - the report-editing chat (after Track B migration)
 *   - browser-side tokenizers in `src/lib/tokenize/*`
 *
 * Wire format: `{{kind:UUID}}` (e.g. `{{student:7e1c…}}`).
 *
 * The UUID is the entity's database ID. The token is stable across requests
 * and threads — a model that learns "{{student:7e1c}}" in turn 1 can refer to
 * the same student in turn 5 without the server re-emitting a new token.
 */

export type TokenKind = "student" | "subtopic" | "classroom" | "guardian";

export interface TokenRef {
  /** Database UUID of the entity. */
  id: string;
  /** Human-readable name (e.g. "Amelia"). Never sent to the LLM. */
  display: string;
  kind: TokenKind;
  /** Pre-computed wire token, e.g. `{{student:UUID}}`. */
  token: string;
}

/**
 * Per-request token map. Built fresh on every chat turn; never cached or
 * persisted in raw form (only the redacted text + a snapshot for replay).
 *
 *   forward: display string → token
 *   reverse: token → TokenRef
 */
export interface TokenMap {
  forward: Map<string, string>;
  reverse: Map<string, TokenRef>;
}

export interface ResolvedEntity {
  kind: TokenKind;
  id: string;
  display: string;
  /** Char offsets of every occurrence of `display` in the detokenized text. */
  offsets: Array<[number, number]>;
}

export interface DetokenizeResult {
  text: string;
  entities: ResolvedEntity[];
}
