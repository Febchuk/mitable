import { pgTable, uuid, varchar, timestamp, jsonb, char } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.schema";
import { users } from "./users.schema";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  keyHash: char("key_hash", { length: 64 }).notNull().unique(), // SHA-256 hex
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(), // "mk_live_xxxx" for display
  scopes: jsonb("scopes").default("[]"), // Reserved for future fine-grained permissions
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
