export type TokenKind = "student" | "subtopic" | "classroom" | "guardian" | "user";

export interface TokenReference {
  token: string;
  /** Underlying UUID — never sent to the LLM, only used by the client de-tokenizer. */
  id: string;
  /** Human display string for inline review cards. */
  display: string;
  kind: TokenKind;
}

export interface TokenizeResult {
  /** Tokenized text safe to send to the LLM. */
  tokenizedText: string;
  /** Map from token string → reference. */
  references: TokenReference[];
  /** True if the tokenizer found candidates within 0.05 of each other; the LLM should ask for clarification. */
  ambiguous: boolean;
}
