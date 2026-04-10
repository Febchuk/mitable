import { pgTable, uuid, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { documents } from "../../domains/agent/schema/documents.schema";
import { users } from "../../domains/auth/schema/users.schema";

export const documentRefinementChats = pgTable(
  "document_refinement_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messages: jsonb("messages").notNull().default([]), // Array of { role, content, timestamp }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_doc_refinement_chats_doc_user").on(table.documentId, table.userId),
    index("idx_doc_refinement_chats_doc").on(table.documentId),
  ]
);

export const documentRefinementChatsRelations = relations(documentRefinementChats, ({ one }) => ({
  document: one(documents, {
    fields: [documentRefinementChats.documentId],
    references: [documents.id],
  }),
  user: one(users, {
    fields: [documentRefinementChats.userId],
    references: [users.id],
  }),
}));
