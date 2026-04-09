import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "../../domains/auth/schema/users.schema";
import { organizations } from "../../domains/auth/schema/organizations.schema";
import { monitoringSessions } from "./monitoring.schema";

/**
 * Documents (Knowledge Base)
 *
 * Stores documentation generated from monitoring sessions or created manually.
 * Supports How-to Guides, Knowledge Articles, and Troubleshooting Docs.
 *
 * Flow: Session ends → Generate Doc → Edit with AI assist → Publish → Export to Notion/Google Docs
 */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "set null" }),

  // Document metadata
  title: varchar("title", { length: 500 }).notNull(),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  // Types: 'how-to' | 'knowledge-article' | 'troubleshooting'
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  // States: 'draft' | 'published' | 'archived'
  description: text("description"),
  tags: jsonb("tags").default([]),

  // Content (markdown)
  content: text("content").notNull(),

  // Notion sync tracking
  notionPageId: varchar("notion_page_id", { length: 36 }),
  notionSyncStatus: varchar("notion_sync_status", { length: 50 }),
  // States: null | 'pending' | 'synced' | 'error'
  notionSyncedAt: timestamp("notion_synced_at"),
  notionSyncError: text("notion_sync_error"),

  // Google Docs export tracking
  googleDocsId: varchar("google_docs_id", { length: 100 }),
  googleDocsFolderId: varchar("google_docs_folder_id", { length: 100 }),
  googleDocsSyncStatus: varchar("google_docs_sync_status", { length: 50 }),
  // States: null | 'pending' | 'synced' | 'error'
  googleDocsSyncedAt: timestamp("google_docs_synced_at"),
  googleDocsSyncError: text("google_docs_sync_error"),

  // AI generation metadata
  generationModel: varchar("generation_model", { length: 100 }),
  generationPromptVersion: integer("generation_prompt_version").default(1),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
});

/**
 * Document Versions
 *
 * Tracks edit history for documents.
 * Each edit (manual or AI-assisted) creates a new version.
 */
export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),

  version: integer("version").notNull(),
  content: text("content").notNull(),
  changeSummary: text("change_summary"),
  changedBy: uuid("changed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  changeType: varchar("change_type", { length: 50 }).notNull(),
  // Types: 'created' | 'user_edit' | 'ai_revision' | 'session_update'

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Session-Document Contributions
 *
 * Links monitoring sessions to documents they contributed to.
 * Tracks which sessions were used as source material or updates.
 */
export const sessionDocumentContributions = pgTable(
  "session_document_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monitoringSessions.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),

    contributionType: varchar("contribution_type", { length: 50 }).notNull(),
    // Types: 'source' | 'update' | 'enhancement'
    insightsUsed: jsonb("insights_used").default([]),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueSessionDoc: unique().on(table.sessionId, table.documentId),
  })
);

// Relations
export const documentsRelations = relations(documents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documents.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [documents.createdBy],
    references: [users.id],
  }),
  versions: many(documentVersions),
  sessionContributions: many(sessionDocumentContributions),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
  changedByUser: one(users, {
    fields: [documentVersions.changedBy],
    references: [users.id],
  }),
}));

export const sessionDocumentContributionsRelations = relations(
  sessionDocumentContributions,
  ({ one }) => ({
    session: one(monitoringSessions, {
      fields: [sessionDocumentContributions.sessionId],
      references: [monitoringSessions.id],
    }),
    document: one(documents, {
      fields: [sessionDocumentContributions.documentId],
      references: [documents.id],
    }),
  })
);

// Export types
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
export type SessionDocumentContribution = typeof sessionDocumentContributions.$inferSelect;
export type NewSessionDocumentContribution = typeof sessionDocumentContributions.$inferInsert;

// Doc type enum
export type DocType = "how-to" | "knowledge-article" | "troubleshooting";

// Doc status enum
export type DocStatus = "draft" | "published" | "archived";

// Change type enum
export type ChangeType = "created" | "user_edit" | "ai_revision" | "session_update";

// Contribution type enum
export type ContributionType = "source" | "update" | "enhancement";

// Helper types for JSONB fields
export interface DocumentTag {
  name: string;
  color?: string;
}

export interface SessionInsight {
  activity: string;
  appName?: string;
  timestamp?: string;
}
