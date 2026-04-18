import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../../auth/schema/users.schema";

export const slackUserEvents = pgTable("slack_user_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'dm' | 'mention'
  slackEventId: varchar("slack_event_id", { length: 100 }).notNull().unique(),
  senderSlackId: varchar("sender_slack_id", { length: 50 }).notNull(),
  senderName: varchar("sender_name", { length: 255 }),
  recipientSlackId: varchar("recipient_slack_id", { length: 50 }).notNull(),
  recipientName: varchar("recipient_name", { length: 255 }),
  channelId: varchar("channel_id", { length: 50 }),
  channelName: varchar("channel_name", { length: 255 }),
  messageText: text("message_text").notNull(),
  slackTs: varchar("slack_ts", { length: 50 }).notNull(),
  eventTimestamp: timestamp("event_timestamp").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const slackUserEventsRelations = relations(slackUserEvents, ({ one }) => ({
  user: one(users, {
    fields: [slackUserEvents.userId],
    references: [users.id],
  }),
}));

export type SlackUserEvent = typeof slackUserEvents.$inferSelect;
export type NewSlackUserEvent = typeof slackUserEvents.$inferInsert;
