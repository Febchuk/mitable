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
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "../../domains/auth/schema/organizations.schema";

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
 * Custom type for pgvector embedding (vector(1536))
 * Used for semantic similarity search
 */
const vector = customType<{ data: number[]; dimensions?: number }>({
  dataType(config) {
    return `vector(${(config as any)?.dimensions ?? 1536})`;
  },
});

/**
 * Search content table for hybrid search (pgvector semantic + PostgreSQL FTS keyword)
 *
 * This table stores both vector embeddings and text for hybrid search.
 * The text_vector column is auto-updated by a PostgreSQL trigger (see migration).
 *
 * Architecture:
 * - pgvector: Semantic search (HNSW index for vector similarity)
 * - PostgreSQL FTS: Keyword search (tsvector + GIN index)
 * - Hybrid: Combine both with Reciprocal Rank Fusion (RRF)
 *
 * Sources: 'slack' | 'notion' | 'session' | 'artifact'
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

    // pgvector embedding for semantic search (Migration 0026)
    // 1536 dimensions for OpenAI text-embedding-3-small
    embedding: vector("embedding", { dimensions: 1536 }),

    // 🆕 SESSION METADATA (Migration 0026)
    sessionId: uuid("session_id"),
    sessionName: text("session_name"),
    sessionGoal: text("session_goal"),
    sessionStatus: text("session_status"),
    actionType: text("action_type"), // VIEWING | AUTHORING | EDITING | PASTING | NAVIGATION
    appName: text("app_name"),
    windowTitle: text("window_title"),
    importanceScore: integer("importance_score"), // 0-100
    confidence: integer("confidence"), // 0-100
    startTime: timestamp("start_time"),
    endTime: timestamp("end_time"),
    durationMinutes: integer("duration_minutes"),
    activityCount: integer("activity_count"),

    // Doc facts layer (structured claims for reliability)
    docFacts: jsonb("doc_facts"), // { claim, evidence[], outcome, confidence }

    // RLM environments (retrieved only when explicitly requested via tools)
    classifierEnvironmentJsonb: jsonb("classifier_environment_jsonb"),
    storytellerEnvironmentJsonb: jsonb("storyteller_environment_jsonb"),
    rawCaptureIds: text("raw_capture_ids").array(),

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

    // GitHub-specific metadata (Code Domain - Phase 1)
    repoId: text("repo_id"), // FK to github_repos (not enforced to allow flexibility)
    repoFullName: text("repo_full_name"), // "Febchuk/mitable"
    filePath: text("file_path"), // "apps/backend/src/services/notion.service.ts"
    fileName: text("file_name"), // "notion.service.ts"
    language: text("language"), // "typescript" | "javascript" | etc.
    fileRole: text("file_role"), // "service" | "controller" | "component" | etc.
    area: text("area"), // "backend-services" | "electron-main" | etc.
    commitSha: text("commit_sha"), // Git commit SHA
    gitAuthor: text("git_author"), // Git author name
    committedAt: timestamp("committed_at"), // When committed
    startLine: integer("start_line"), // Symbol start line
    endLine: integer("end_line"), // Symbol end line
    functionName: text("function_name"), // For function chunks
    className: text("class_name"), // For class chunks
    exports: text("exports").array(), // Exported symbols (for file_overview)
    isExported: boolean("is_exported").default(false), // Is this symbol exported?
    isTestFile: boolean("is_test_file").default(false), // Test vs production code
    isGenerated: boolean("is_generated").default(false), // Generated code (e.g., Prisma client)

    // Chunk metadata (from chunking service)
    chunkIndex: integer("chunk_index").default(0),
    totalChunks: integer("total_chunks").default(1),
    isChunked: boolean("is_chunked").default(false),

    // 🆕 SLACK STRUCTURE-AWARE METADATA (Migration 0011)
    chunkType: text("chunk_type"), // 'message_window' | 'code' | 'log' | 'thread_summary' | 'text'
    authors: text("authors").array(), // Array of usernames
    mentionedUsers: text("mentioned_users").array(), // Array of mentioned user IDs
    hasCode: boolean("has_code").default(false),
    codeLanguage: text("code_language"), // 'sql' | 'typescript' | 'python' | etc.
    hasLinks: boolean("has_links").default(false),
    hasAttachments: boolean("has_attachments").default(false),
    hasReactions: boolean("has_reactions").default(false),
    reactionSummary: jsonb("reaction_summary"), // { "👍": 5, "✅": 3 }
    threadId: text("thread_id"), // Slack thread_ts identifier
    isThreadRoot: boolean("is_thread_root").default(false),
    messageIds: text("message_ids").array(), // Array of message timestamps

    // 🆕 NOTION STRUCTURE-AWARE METADATA (Migration 0010)
    sectionPath: text("section_path"), // JSON array: ["Parent Section", "Child Section"]
    sectionTitle: text("section_title"), // Title of the section this chunk belongs to
    sectionId: text("section_id"), // Unique identifier for the section
    headingLevel: integer("heading_level"), // 1, 2, or 3 for heading levels
    hasTable: boolean("has_table").default(false), // Whether chunk contains tables
    hasList: boolean("has_list").default(false), // Whether chunk contains lists

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

    // GitHub-specific indexes
    index("search_content_repo_idx").on(table.repoFullName),
    index("search_content_file_role_idx").on(table.fileRole),
    index("search_content_area_idx").on(table.area),
    index("search_content_language_idx").on(table.language),
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
  semanticScore?: number; // pgvector cosine similarity
  keywordScore?: number; // PostgreSQL ts_rank

  // Source-specific metadata
  // Slack
  channelId?: string;
  channelName?: string;
  username?: string;

  // Notion
  pageId?: string;
  pageTitle?: string;

  // Session
  sessionId?: string;
  sessionName?: string;
  sessionGoal?: string;
  actionType?: string;
  appName?: string;
  importanceScore?: number;

  // Temporal
  timestamp?: number;
  date?: string;
  startTime?: Date;
  endTime?: Date;
}
