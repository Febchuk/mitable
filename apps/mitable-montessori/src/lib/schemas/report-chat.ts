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
  /** Set when teacher accepts a proposal/ghost. ISO 8601 timestamp. */
  appliedAt: z.string().optional(),
  /** Set when teacher rejects a proposal/ghost. ISO 8601 timestamp. */
  dismissedAt: z.string().optional(),
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

export const ChatProposalTargetSchema = z.object({
  sectionId: z.string(),
  paragraphId: z.string(),
  /** Server-derived display string (e.g. "Morning paragraph") for the UI label. */
  headingDisplay: z.string().optional(),
});
export type ChatProposalTarget = z.infer<typeof ChatProposalTargetSchema>;

export const ChatProposalMessageSchema = z.object({
  kind: z.literal("proposal"),
  /** One short sentence introducing the rewrite. */
  lead: z.string().min(1).max(500),
  target: ChatProposalTargetSchema,
  oldText: z.string().min(1).max(4000),
  newText: z.string().min(1).max(4000),
  rationale: z.string().max(500).optional(),
  ...baseFields,
});

export const ChatTurnMessageSchema = z.discriminatedUnion("kind", [
  ChatProseMessageSchema,
  ChatClarifyMessageSchema,
  ChatUserTextMessageSchema,
  ChatProposalMessageSchema,
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

export const ChatMessageActionSchema = z.object({
  /** What the teacher did to a proposal/ghost. */
  action: z.enum(["applied", "dismissed", "regenerated"]),
  /** Optional snapshot of what the apply changed (for audit + undo). */
  appliedTo: z
    .object({
      sectionId: z.string(),
      paragraphId: z.string(),
      before: z.string(),
      after: z.string(),
    })
    .optional(),
});
export type ChatMessageAction = z.infer<typeof ChatMessageActionSchema>;
