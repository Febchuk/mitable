import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../../../db/schema/users.schema";
import { organizations } from "../../../db/schema/organizations.schema";
import { monitoringSessions } from "../../../db/schema/monitoring.schema";

/**
 * Recaps
 *
 * User-created recap documents that summarize work across multiple sessions/blocks.
 * Content is AI-generated then user-edited. Blocks and deliveries are stored as
 * JSONB snapshots (not live references).
 */
export const recaps = pgTable(
  "recaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    title: varchar("title", { length: 500 }).notNull(),
    content: text("content").notNull().default(""),
    blocks: jsonb("blocks").notNull().default("[]"), // RecapBlockSnapshot[]
    totalDuration: integer("total_duration").notNull().default(0), // minutes
    deliveries: jsonb("deliveries").notNull().default("[]"), // RecapDelivery[]

    // Nullable — set when auto-created from a single session end
    sessionId: uuid("session_id").references(() => monitoringSessions.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_recaps_user_id").on(table.userId),
    createdAtIdx: index("idx_recaps_created_at").on(table.userId, table.createdAt),
  })
);

// Relations
export const recapsRelations = relations(recaps, ({ one }) => ({
  user: one(users, {
    fields: [recaps.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [recaps.organizationId],
    references: [organizations.id],
  }),
}));

// Export types
export type RecapRow = typeof recaps.$inferSelect;
export type NewRecap = typeof recaps.$inferInsert;
