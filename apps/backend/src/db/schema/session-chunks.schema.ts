import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
  vector,
} from "drizzle-orm/pg-core";
import { monitoringSessions } from "./monitoring.schema";
import { organizations } from "./organizations.schema";
import { users } from "./users.schema";

export const sessionChunks = pgTable(
  "session_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monitoringSessions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }), // Added in migration 0028 for efficient user filtering

    // Chunk metadata
    chunkIndex: integer("chunk_index").notNull(),
    chunkType: text("chunk_type", {
      enum: ["classifier", "storyteller_summary", "storyteller_timeline", "transcript"],
    }).notNull(),

    // Content and embedding
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),

    // Contextual metadata (entities, timestamps, activity info)
    metadata: jsonb("metadata")
      .$type<{
        entities?: {
          people?: string[];
          systems?: string[];
        };
        timeRange?: {
          start: string;
          end: string;
        };
        activityCount?: number;
        eventTypes?: string[];
        [key: string]: any;
      }>()
      .default({}),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sessionIdIdx: index("idx_session_chunks_session_id").on(table.sessionId),
    orgIdIdx: index("idx_session_chunks_org_id").on(table.organizationId),
    chunkTypeIdx: index("idx_session_chunks_type").on(table.chunkType),
    embeddingIdx: index("idx_session_chunks_embedding").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    metadataIdx: index("idx_session_chunks_metadata").using("gin", table.metadata),
    uniqueChunk: unique("unique_session_chunk").on(
      table.sessionId,
      table.chunkType,
      table.chunkIndex
    ),
  })
);

export type SessionChunk = typeof sessionChunks.$inferSelect;
export type NewSessionChunk = typeof sessionChunks.$inferInsert;
