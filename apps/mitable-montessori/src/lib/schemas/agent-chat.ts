import { z } from "zod";

/**
 * Wire schemas for `POST /api/agent/chat`. Inputs and outputs are validated
 * with zod so type drift between client and server stays caught at the edge.
 */

export const InboundMentionSchema = z.object({
  kind: z.literal("student"),
  id: z.string().uuid(),
  display: z.string().min(1),
});
export type InboundMention = z.infer<typeof InboundMentionSchema>;

export const ChatRequestSchema = z.object({
  threadId: z.string().min(1).optional(),
  message: z.string().min(1).max(4000),
  mentions: z.array(InboundMentionSchema).max(20).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ResolvedEntitySchema = z.object({
  kind: z.enum(["student", "subtopic", "classroom", "guardian"]),
  id: z.string(),
  display: z.string(),
  offsets: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
});
export type ResolvedEntity = z.infer<typeof ResolvedEntitySchema>;

export const AmbiguityCandidateSchema = z.object({
  id: z.string().uuid(),
  display: z.string(),
  score: z.number(),
});

export const AmbiguityFragmentSchema = z.object({
  fragment: z.string(),
  candidates: z.array(AmbiguityCandidateSchema),
});

export const ChatResponseSchema = z.object({
  threadId: z.string(),
  message: z.string(),
  entities: z.array(ResolvedEntitySchema),
  /** Set when the resolver couldn't pick between multiple students. */
  ambiguities: z.array(AmbiguityFragmentSchema).optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
