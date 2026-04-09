import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../../auth/schema/users.schema.js";
import { organizations } from "../../auth/schema/organizations.schema.js";

// Agent Conversations
export const agentConversations = pgTable("agent_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  sessionId: varchar("session_id", { length: 255 }), // Claude Code session ID for resume
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_agent_conversations_user").on(table.userId, table.createdAt),
  index("idx_agent_conversations_org").on(table.organizationId),
]);

// Agent Messages
export const agentMessages = pgTable("agent_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => agentConversations.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant' | 'error' | 'plan'
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls").default("[]"), // Array of {name, input, detail}
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_agent_messages_conversation").on(table.conversationId, table.createdAt),
]);

// Relations
export const agentConversationsRelations = relations(agentConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [agentConversations.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [agentConversations.organizationId],
    references: [organizations.id],
  }),
  messages: many(agentMessages),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  conversation: one(agentConversations, {
    fields: [agentMessages.conversationId],
    references: [agentConversations.id],
  }),
}));

// Export types
export type AgentConversation = typeof agentConversations.$inferSelect;
export type NewAgentConversation = typeof agentConversations.$inferInsert;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;
