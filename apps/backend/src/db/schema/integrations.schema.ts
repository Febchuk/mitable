import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  interval,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(), // 'slack' | 'notion' | 'github' | 'google-drive'
    status: varchar("status", { length: 50 }).notNull(), // 'connected' | 'disconnected' | 'pending' | 'error'
    accessToken: text("access_token"), // Encrypted in production
    refreshToken: text("refresh_token"), // Encrypted in production
    tokenExpiresAt: timestamp("token_expires_at"),
    metadata: jsonb("metadata").default("{}"), // Provider-specific config
    lastSyncedAt: timestamp("last_synced_at"),
    syncFrequency: interval("sync_frequency").default("6 hours"), // How often to sync
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: one integration per provider per organization
    uniqueOrgProvider: unique().on(table.organizationId, table.provider),
  })
);

export const syncLogs = pgTable("sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  integrationId: uuid("integration_id")
    .notNull()
    .references(() => integrations.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).notNull(), // 'success' | 'failed' | 'in_progress'
  itemsSynced: integer("items_synced").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Relations
export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [integrations.organizationId],
    references: [organizations.id],
  }),
  syncLogs: many(syncLogs),
}));

export const syncLogsRelations = relations(syncLogs, ({ one }) => ({
  integration: one(integrations, {
    fields: [syncLogs.integrationId],
    references: [integrations.id],
  }),
}));

// Export types
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;
