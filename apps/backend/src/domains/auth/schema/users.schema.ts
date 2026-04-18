import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  date,
  text,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";
import { teams } from "./teams.schema"; // Safe: teams doesn't import users

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

  // Persona fields
  jobTitle: varchar("job_title", { length: 100 }),
  regularTasks: jsonb("regular_tasks").default("[]"), // Array of strings
  regularApps: jsonb("regular_apps").default("[]"), // Array of strings
  additionalContext: text("additional_context"),

  // Linear OAuth tokens (per-user, encrypted)
  linearAccessTokenEncrypted: text("linear_access_token_encrypted"),
  linearRefreshTokenEncrypted: text("linear_refresh_token_encrypted"),
  linearTokenExpiresAt: timestamp("linear_token_expires_at"),

  // Gmail OAuth tokens (per-user email sending, encrypted)
  gmailAccessTokenEncrypted: text("gmail_access_token_encrypted"),
  gmailRefreshTokenEncrypted: text("gmail_refresh_token_encrypted"),
  gmailTokenExpiresAt: timestamp("gmail_token_expires_at"),
  gmailUserEmail: varchar("gmail_user_email", { length: 255 }),

  // Notion OAuth tokens (per-user document exports, encrypted)
  notionAccessTokenEncrypted: text("notion_access_token_encrypted"),
  notionRefreshTokenEncrypted: text("notion_refresh_token_encrypted"),
  notionTokenExpiresAt: timestamp("notion_token_expires_at"),
  notionWorkspaceId: varchar("notion_workspace_id", { length: 100 }),

  // Granola OAuth tokens (per-user meeting notes, encrypted)
  granolaAccessTokenEncrypted: text("granola_access_token_encrypted"),
  granolaRefreshTokenEncrypted: text("granola_refresh_token_encrypted"),
  granolaTokenExpiresAt: timestamp("granola_token_expires_at"),
  granolaOAuthClientId: varchar("granola_oauth_client_id", { length: 255 }),
  granolaUserEmail: varchar("granola_user_email", { length: 255 }),
  granolaLastSyncedAt: timestamp("granola_last_synced_at"),

  // Fireflies AI integration (per-user API key, encrypted)
  firefliesApiKeyEncrypted: text("fireflies_api_key_encrypted"),
  firefliesLastSyncedAt: timestamp("fireflies_last_synced_at"),

  // Slack user OAuth tokens (per-user event subscriptions, encrypted)
  slackUserAccessTokenEncrypted: text("slack_user_access_token_encrypted"),
  slackUserTokenExpiresAt: timestamp("slack_user_token_expires_at"),
  slackUserId: varchar("slack_user_id", { length: 50 }),
  slackTeamId: varchar("slack_team_id", { length: 50 }),
  slackTeamName: varchar("slack_team_name", { length: 255 }),
  slackUserDisplayName: varchar("slack_user_display_name", { length: 255 }),

  // Hierarchy fields
  managerId: uuid("manager_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  department: varchar("department", { length: 100 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "managerReports",
  }),
  directReports: many(users, {
    relationName: "managerReports",
  }),
  team: one(teams, {
    fields: [users.teamId],
    references: [teams.id],
  }),
}));

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
