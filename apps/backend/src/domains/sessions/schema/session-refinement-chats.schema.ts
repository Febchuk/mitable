import { pgTable, uuid, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { monitoringSessions } from "./monitoring.schema";
import { users } from "../../auth/schema/users.schema";

export const sessionRefinementChats = pgTable(
  "session_refinement_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monitoringSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messages: jsonb("messages").notNull().default([]), // Array of { role, content, timestamp }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_refinement_chats_session_user").on(table.sessionId, table.userId),
    index("idx_refinement_chats_session").on(table.sessionId),
  ]
);

export const sessionRefinementChatsRelations = relations(sessionRefinementChats, ({ one }) => ({
  session: one(monitoringSessions, {
    fields: [sessionRefinementChats.sessionId],
    references: [monitoringSessions.id],
  }),
  user: one(users, {
    fields: [sessionRefinementChats.userId],
    references: [users.id],
  }),
}));
