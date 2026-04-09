import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../../domains/auth/schema/users.schema";
import { organizations } from "../../domains/auth/schema/organizations.schema";

export const userMemories = pgTable(
  "user_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // 'summary_style', 'doc_style', 'general'
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_user_memories_user_category").on(table.userId, table.category),
    index("idx_user_memories_org").on(table.orgId),
  ]
);

export const userMemoriesRelations = relations(userMemories, ({ one }) => ({
  user: one(users, {
    fields: [userMemories.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userMemories.orgId],
    references: [organizations.id],
  }),
}));
