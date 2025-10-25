import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  date,
  bigint,
  uuid,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations.schema";

/**
 * Custom type for PostgreSQL tsvector
 * The actual tsvector value will be auto-populated by a database trigger
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Search content table for hybrid search (PostgreSQL FTS + Pinecone semantic)
 *
 * This table mirrors Pinecone vectors but stores text for keyword search.
 * The text_vector column is auto-updated by a PostgreSQL trigger (see migration).
 *
 * Architecture:
 * - Pinecone: Semantic search (vector similarity)
 * - PostgreSQL: Keyword search (full-text search with tsvector + GIN index)
 * - Hybrid: Combine both with Reciprocal Rank Fusion (RRF)
 */
export const searchContent = pgTable(
  "search_content",
  {
    // Same ID as Pinecone vector for easy correlation
    // Format: "slack-{channelId}-{timestamp}-chunk-{index}" or "notion-{pageId}-{blockId}-chunk-{index}"
    id: text("id").primaryKey(),

    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Source metadata
    source: text("source").notNull(), // 'slack' | 'notion'
    sourceType: text("source_type"), // 'message' | 'block' | 'thread_reply'

    // Full text content (raw text from the chunk)
    text: text("text").notNull(),

    // tsvector column for full-text search
    // Auto-updated by trigger on INSERT/UPDATE (see migration file)
    // Uses 'english' configuration for stemming, stop words, etc.
    textVector: tsvector("text_vector").notNull(),

    // Slack-specific metadata
    channelId: text("channel_id"),
    channelName: text("channel_name"),
    userId: text("user_id"),
    username: text("username"),

    // Notion-specific metadata
    pageId: text("page_id"),
    pageTitle: text("page_title"),
    blockId: text("block_id"),
    blockType: text("block_type"),

    // Chunk metadata (from chunking service)
    chunkIndex: integer("chunk_index").default(0),
    totalChunks: integer("total_chunks").default(1),
    isChunked: boolean("is_chunked").default(false),

    // Temporal metadata for filtering
    timestamp: bigint("timestamp", { mode: "number" }), // Unix timestamp (milliseconds)
    date: date("date"), // Date only for easier date range queries
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // GIN index for fast full-text search on text_vector
    // This is the critical index for keyword search performance
    // Note: The actual GIN index is created in the migration file with fastupdate option
    // Drizzle currently doesn't support GIN index options, so we use sql`` here
    index("search_content_text_vector_idx").using("gin", sql`${table.textVector}`),

    // Standard B-tree indexes for filters
    index("search_content_org_idx").on(table.organizationId),
    index("search_content_source_idx").on(table.source),
    index("search_content_date_idx").on(table.date),

    // Composite indexes for common filter combinations
    index("search_content_org_source_idx").on(table.organizationId, table.source),
    index("search_content_org_date_idx").on(table.organizationId, table.date),

    // Slack-specific indexes
    index("search_content_channel_idx").on(table.channelId),

    // Notion-specific indexes
    index("search_content_page_idx").on(table.pageId),
  ]
);

// Export types
export type SearchContent = typeof searchContent.$inferSelect;
export type NewSearchContent = typeof searchContent.$inferInsert;

/**
 * Helper type for search result metadata
 * Used when returning search results with relevance scores
 */
export interface SearchResultMetadata {
  id: string;
  text: string;
  snippet?: string; // ±100 chars around match
  source: string;
  sourceType?: string;
  relevanceScore: number; // Combined score from RRF
  semanticScore?: number; // Pinecone cosine similarity
  keywordScore?: number; // PostgreSQL ts_rank

  // Source-specific metadata
  channelId?: string;
  channelName?: string;
  username?: string;
  pageId?: string;
  pageTitle?: string;

  // Temporal
  timestamp?: number;
  date?: string;
}
