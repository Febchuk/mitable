import { pgTable, uuid, varchar, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../../auth/schema/users.schema.js";
import { workflowSessions } from "../../../db/schema/workflows.schema.js";

// Conversations
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }), // Auto-generated from first message
  contextType: varchar("context_type", { length: 50 }), // 'general' | 'help_request' | 'workflow'

  // Memory management fields
  conversationSummary: text("conversation_summary"), // Incremental summary of older turns
  summaryUpToTurn: integer("summary_up_to_turn").default(0), // Which turn was last summarized

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Messages
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 50 }).default("text"), // 'text' | 'workflow' | 'experts'
  cardData: jsonb("card_data"), // Optional metadata for special message types
  sources: jsonb("sources").default("[]"), // Array of citation objects for RAG

  // Workflow relationship fields (optional for backward compatibility)
  workflowSessionId: uuid("workflow_session_id").references(() => workflowSessions.id, {
    onDelete: "set null",
  }), // Links to workflow_sessions.id
  relatedStepIndex: integer("related_step_index"), // Which workflow step this message relates to

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// Export types
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
