import { z } from "zod";

/**
 * Wire format for the report-editing chat agent.
 *
 * Phase 2 emits `prose`, `clarify`, and `user-text` only. Later phases add the
 * structured archetypes (proposal, chips, obs-ref, ghost-edit) without
 * breaking the discriminated union — clients should treat unknown `kind`
 * values defensively.
 */

export const TargetRefSchema = z.object({
  sectionId: z.string().optional(),
  paragraphId: z.string().optional(),
  quote: z.string().max(500).optional(),
});
export type TargetRef = z.infer<typeof TargetRefSchema>;

const baseFields = {
  id: z.string(),
  /** ISO 8601 timestamp when the message was created server-side. */
  createdAt: z.string().optional(),
  /** Who posted this turn — null/undefined for the initial empty load. */
  actorRole: z.enum(["teacher", "admin", "assistant"]).optional(),
  targetRef: TargetRefSchema.optional(),
};

export const ChatProseMessageSchema = z.object({
  kind: z.literal("prose"),
  body: z.string().min(1).max(4000),
  ...baseFields,
});

export const ChatClarifyMessageSchema = z.object({
  kind: z.literal("clarify"),
  body: z.string().min(1).max(4000),
  ...baseFields,
});

export const ChatUserTextMessageSchema = z.object({
  kind: z.literal("user-text"),
  body: z.string().min(1).max(4000),
  ...baseFields,
});

export const ChatTurnMessageSchema = z.discriminatedUnion("kind", [
  ChatProseMessageSchema,
  ChatClarifyMessageSchema,
  ChatUserTextMessageSchema,
]);
export type ChatTurnMessage = z.infer<typeof ChatTurnMessageSchema>;

export const ChatTurnRequestSchema = z.object({
  userMessage: z.string().min(1).max(4000),
  targetRef: TargetRefSchema.optional(),
});
export type ChatTurnRequest = z.infer<typeof ChatTurnRequestSchema>;

export const ChatTurnResponseSchema = z.object({
  /**
   * The newly persisted messages from this turn — typically `[user-text,
   * assistant-archetype]`. Clients append these to their local state.
   */
  messages: z.array(ChatTurnMessageSchema).min(1),
});
export type ChatTurnResponse = z.infer<typeof ChatTurnResponseSchema>;

export const ChatHistoryResponseSchema = z.object({
  /** Oldest first. Empty array when the report has no thread yet. */
  messages: z.array(ChatTurnMessageSchema),
});
export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponseSchema>;
