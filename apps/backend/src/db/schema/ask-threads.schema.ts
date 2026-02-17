import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema";

// Ask Threads — admin org-wide AI conversations
export const askThreads = pgTable("ask_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).default("New conversation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Ask Messages — individual messages within a thread
export const askMessages = pgTable("ask_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => askThreads.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  reportTitle: varchar("report_title", { length: 255 }),
  reportSubtitle: varchar("report_subtitle", { length: 255 }),
  reportHtml: text("report_html"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const askThreadsRelations = relations(askThreads, ({ one, many }) => ({
  user: one(users, {
    fields: [askThreads.userId],
    references: [users.id],
  }),
  messages: many(askMessages),
}));

export const askMessagesRelations = relations(askMessages, ({ one }) => ({
  thread: one(askThreads, {
    fields: [askMessages.threadId],
    references: [askThreads.id],
  }),
}));

// Export types
export type AskThread = typeof askThreads.$inferSelect;
export type NewAskThread = typeof askThreads.$inferInsert;
export type AskMessage = typeof askMessages.$inferSelect;
export type NewAskMessage = typeof askMessages.$inferInsert;
