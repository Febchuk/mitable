import { pgTable, uuid, varchar, text, timestamp, integer, bigint, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema";
import { organizations } from "./organizations.schema";

/**
 * Artifacts (Knowledge Source)
 * 
 * Stores user-uploaded files or pasted text to be used as context for document generation.
 * 
 * Types:
 * - 'file': Uploaded via UploadThing (URL stored)
 * - 'text': Raw text pasted by user (content stored)
 */
export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Artifact metadata
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'file' | 'text'
  
  // File specific
  url: varchar("url", { length: 1000 }), // URL from UploadThing (for files)
  fileType: varchar("file_type", { length: 100 }), // e.g. 'application/pdf', 'text/plain'
  size: bigint("size", { mode: "number" }), // Size in bytes
  
  // Text specific
  content: text("content"), // Raw text content (for pasted text)

  // Status
  status: varchar("status", { length: 50 }).default("active"), // 'active' | 'archived'

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const artifactsRelations = relations(artifacts, ({ one }) => ({
  organization: one(organizations, {
    fields: [artifacts.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [artifacts.userId],
    references: [users.id],
  }),
}));

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;

