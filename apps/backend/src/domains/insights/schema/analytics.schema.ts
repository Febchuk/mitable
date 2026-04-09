import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../../../db/schema/users.schema.js";
import { organizations } from "../../../db/schema/organizations.schema.js";

// Analytics Events
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 100 }).notNull(), // e.g., "help_requested", "task_completed"
  eventData: jsonb("event_data").default("{}"), // Flexible event metadata
  sessionId: uuid("session_id"), // For grouping related events
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const analyticsEventsRelations = relations(analyticsEvents, ({ one }) => ({
  user: one(users, {
    fields: [analyticsEvents.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [analyticsEvents.organizationId],
    references: [organizations.id],
  }),
}));

// Export types
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
