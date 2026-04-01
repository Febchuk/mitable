import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users.schema";
import { organizations } from "./organizations.schema";

/**
 * Bragbook Entries
 *
 * Stores accomplishments per period (weekly/monthly/quarterly).
 * Populated by cron (source: "auto-generated") or manual user edits (source: "user-edited").
 * Cron never overwrites user-edited entries.
 */
export const bragbookEntries = pgTable(
  "bragbook_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // "weekly" | "monthly" | "quarterly"
    periodType: varchar("period_type", { length: 20 }).notNull(),

    // Monday for weekly, 1st of month for monthly, 1st of quarter for quarterly
    periodStart: date("period_start").notNull(),

    // User-curated accomplishments for this period
    accomplishments: jsonb("accomplishments").notNull().default([]),

    // "auto-generated" (from cron/LLM) or "user-edited" (manual edits)
    source: varchar("source", { length: 20 }).notNull().default("auto-generated"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("bragbook_user_period_unique").on(
      table.userId,
      table.periodType,
      table.periodStart
    ),
  ]
);
