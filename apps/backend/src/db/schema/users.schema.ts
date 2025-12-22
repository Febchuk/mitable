import { pgTable, uuid, varchar, integer, timestamp, date, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: varchar("role", { length: 50 }).notNull(), // 'admin' | 'employee'
  avatarUrl: varchar("avatar_url", { length: 500 }),
  currentWeek: integer("current_week").default(1),
  startDate: date("start_date"),
  status: varchar("status", { length: 50 }).default("active"), // 'active' | 'inactive' | 'archived'

  // Linear OAuth tokens (per-user, encrypted)
  linearAccessTokenEncrypted: text("linear_access_token_encrypted"),
  linearRefreshTokenEncrypted: text("linear_refresh_token_encrypted"),
  linearTokenExpiresAt: timestamp("linear_token_expires_at"),

  // Gmail OAuth tokens (per-user email sending, encrypted)
  gmailAccessTokenEncrypted: text("gmail_access_token_encrypted"),
  gmailRefreshTokenEncrypted: text("gmail_refresh_token_encrypted"),
  gmailTokenExpiresAt: timestamp("gmail_token_expires_at"),
  gmailUserEmail: varchar("gmail_user_email", { length: 255 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
