import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";

// Source Materials (shared learning resources)
export const sourceMaterials = pgTable("source_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }), // 'document' | 'video' | 'tutorial' | 'code_sample' | 'link'
  url: varchar("url", { length: 500 }),
  description: text("description"),
  organizationId: uuid("organization_id").references(() => organizations.id), // NULL for global resources
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const sourceMaterialsRelations = relations(sourceMaterials, ({ one }) => ({
  organization: one(organizations, {
    fields: [sourceMaterials.organizationId],
    references: [organizations.id],
  }),
}));

// Export types
export type SourceMaterial = typeof sourceMaterials.$inferSelect;
export type NewSourceMaterial = typeof sourceMaterials.$inferInsert;
