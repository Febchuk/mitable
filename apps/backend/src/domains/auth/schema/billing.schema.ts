import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  date,
  integer,
  bigint,
  jsonb,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.schema";

// Subscription tiers
export type SubscriptionTier = "free" | "pro" | "team";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid";

// Subscriptions - Organization-level subscription state
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  tier: varchar("tier", { length: 50 }).notNull().default("free"),
  status: varchar("status", { length: 50 }).notNull().default("active"),

  // Stripe integration (for future use)
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),

  // Billing period
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  cancelledAt: timestamp("cancelled_at"),

  // Trial management
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Usage tracking - Monthly usage counters per organization
export const usageTracking = pgTable("usage_tracking", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),

  // Usage counters
  aiQueries: integer("ai_queries").default(0),
  documentsUploaded: integer("documents_uploaded").default(0),
  storageBytesUsed: bigint("storage_bytes_used", { mode: "number" }).default(0),
  integrationSyncs: integer("integration_syncs").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Usage limits - Tier definitions (static reference table)
export const usageLimits = pgTable("usage_limits", {
  tier: varchar("tier", { length: 50 }).primaryKey(),
  monthlyAiQueries: integer("monthly_ai_queries"), // null = unlimited
  maxDocuments: integer("max_documents"),
  maxStorageBytes: bigint("max_storage_bytes", { mode: "number" }),
  maxTeamMembers: integer("max_team_members"),
  maxIntegrations: integer("max_integrations"),
  syncFrequencyHours: integer("sync_frequency_hours"),
  features: jsonb("features").default("{}"),
});

// Export types
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type UsageTracking = typeof usageTracking.$inferSelect;
export type NewUsageTracking = typeof usageTracking.$inferInsert;

export type UsageLimits = typeof usageLimits.$inferSelect;
export type NewUsageLimits = typeof usageLimits.$inferInsert;

// Feature flags stored in usage_limits.features
export interface TierFeatures {
  sso?: boolean;
  apiAccess?: boolean;
  auditLogs?: boolean;
  exportData?: boolean;
  prioritySupport?: boolean;
}

// Quota status response type
export interface QuotaStatus {
  tier: SubscriptionTier;
  isInternal: boolean;
  aiQueries: {
    used: number;
    limit: number | null; // null = unlimited
    remaining: number | null;
    percentUsed: number;
  };
  documents: {
    used: number;
    limit: number | null;
    remaining: number | null;
    percentUsed: number;
  };
  storage: {
    usedBytes: number;
    limitBytes: number | null;
    remainingBytes: number | null;
    percentUsed: number;
  };
  periodStart: string;
  periodEnd: string;
}
