import { z } from "zod";

export const TokenReferenceSchema = z.object({
  token: z.string().regex(/^\[(STUDENT|SUBTOPIC|CLASSROOM|GUARDIAN|USER)_\d+\]$/),
  /**
   * The opaque server-side identifier for this token. NOT sent to the LLM —
   * the client uses it to de-tokenize the response. Server route handlers may
   * verify the references list shape but should never inline the value into
   * the LLM payload.
   */
  ref: z.string().min(1),
  /**
   * Optional category hint, derivable from the token but explicit for the
   * server-side validator that ensures references match what the LLM saw.
   */
  kind: z.enum(["student", "subtopic", "classroom", "guardian", "user"]),
});

export const TokenizedInputSchema = z.object({
  tokenizedText: z.string().min(1).max(2000),
  references: z.array(TokenReferenceSchema).max(50),
  classroomId: z.string().uuid(),
  todayIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type TokenizedInput = z.infer<typeof TokenizedInputSchema>;
export type TokenReference = z.infer<typeof TokenReferenceSchema>;
