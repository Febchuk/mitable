/**
 * Artifacts Schema
 *
 * Stores uploaded artifacts (PDFs, DOCX, images, etc.) that can be used
 * as source material for document generation alongside monitoring sessions.
 */

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
import { users } from "./users.schema";
import { organizations } from "./organizations.schema";
import { documents } from "./documents.schema";

/**
 * Artifacts
 *
 * Stores uploaded files (PDFs, DOCX, TXT, images) for use in document generation.
 * Files are stored in Supabase Storage, text is extracted for use in AI prompts.
 */
export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // File metadata
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  // Examples: 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/png'

  // Storage
  storageUrl: text("storage_url").notNull(), // Public/signed URL
  storageKey: varchar("storage_key", { length: 500 }).notNull(), // Supabase Storage path for deletion

  // File info
  fileSizeBytes: integer("file_size_bytes").notNull(),

  // Text extraction
  extractedText: text("extracted_text"), // Parsed text content (null for images)
  extractionStatus: varchar("extraction_status", { length: 50 }).notNull().default("pending"),
  // States: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  extractionError: text("extraction_error"),

  // Embedding for RAG (future-ready)
  embeddingStatus: varchar("embedding_status", { length: 50 }).default("pending"),
  // States: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  embeddingError: text("embedding_error"),
  pineconeIds: jsonb("pinecone_ids").default([]), // Array of Pinecone vector IDs

  // Extensible metadata
  metadata: jsonb("metadata").default({}),
  // Examples: { pageCount: 5, wordCount: 1200, dimensions: { width: 1920, height: 1080 } }

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Document Artifact Sources
 *
 * Links artifacts to documents they contributed to.
 * Tracks which artifacts were used as source material.
 */
export const documentArtifactSources = pgTable(
  "document_artifact_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),

    contributionType: varchar("contribution_type", { length: 50 }).notNull().default("source"),
    // Types: 'source' | 'reference'

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueDocArtifact: unique().on(table.documentId, table.artifactId),
  })
);

// Relations
export const artifactsRelations = relations(artifacts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [artifacts.organizationId],
    references: [organizations.id],
  }),
  uploader: one(users, {
    fields: [artifacts.uploadedBy],
    references: [users.id],
  }),
  documentSources: many(documentArtifactSources),
}));

export const documentArtifactSourcesRelations = relations(documentArtifactSources, ({ one }) => ({
  document: one(documents, {
    fields: [documentArtifactSources.documentId],
    references: [documents.id],
  }),
  artifact: one(artifacts, {
    fields: [documentArtifactSources.artifactId],
    references: [artifacts.id],
  }),
}));

// Export types
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type DocumentArtifactSource = typeof documentArtifactSources.$inferSelect;
export type NewDocumentArtifactSource = typeof documentArtifactSources.$inferInsert;

// Extraction status enum
export type ExtractionStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

// Embedding status enum
export type EmbeddingStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

// Artifact contribution type
export type ArtifactContributionType = "source" | "reference";

// Allowed MIME types for upload
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// Max file size (10MB)
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Helper type for artifact metadata
export interface ArtifactMetadata {
  pageCount?: number;
  wordCount?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  encoding?: string;
}
