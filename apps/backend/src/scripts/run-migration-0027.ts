/**
 * Migration 0027: Add session_chunks table for document generation RAG
 *
 * Creates session_chunks table to store chunked and embedded session data.
 * Completely separate from search_content (knowledge agent domain).
 *
 * Features:
 * - Classifier chunks (time-windowed activity events)
 * - Storyteller summary chunks (narrative text)
 * - pgvector HNSW index for similarity search
 * - Metadata for entities, timestamps, event types
 *
 * Run with: npx tsx src/scripts/run-migration-0027.ts
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration 0027: Add session_chunks table...\n");

    // 1. Create session_chunks table
    console.log("1. Creating session_chunks table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS session_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES monitoring_sessions(id) ON DELETE CASCADE,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        -- Chunk metadata
        chunk_index INTEGER NOT NULL,
        chunk_type TEXT NOT NULL CHECK (chunk_type IN ('classifier', 'storyteller_summary', 'storyteller_timeline')),
        
        -- Content and embedding
        text TEXT NOT NULL,
        embedding vector(1536),
        
        -- Contextual metadata (entities, timestamps, activity info)
        metadata JSONB DEFAULT '{}'::jsonb,
        
        -- Timestamps
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        
        -- Unique constraint: one chunk per (session, type, index)
        CONSTRAINT unique_session_chunk UNIQUE (session_id, chunk_type, chunk_index)
      )
    `);

    // 2. Create indexes for fast retrieval
    console.log("2. Creating indexes for session_chunks...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_chunks_session_id ON session_chunks(session_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_chunks_org_id ON session_chunks(organization_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_chunks_type ON session_chunks(chunk_type)
    `);

    // 3. Create HNSW index for vector similarity search
    console.log("3. Creating HNSW index for embeddings...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_chunks_embedding ON session_chunks 
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);

    // 4. Create GIN index for metadata queries
    console.log("4. Creating GIN index for metadata...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_session_chunks_metadata ON session_chunks USING GIN(metadata)
    `);

    // 5. Create update timestamp trigger
    console.log("5. Creating updated_at trigger...");
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION update_session_chunks_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await db.execute(sql`
      DROP TRIGGER IF EXISTS trigger_session_chunks_updated_at ON session_chunks
    `);

    await db.execute(sql`
      CREATE TRIGGER trigger_session_chunks_updated_at
        BEFORE UPDATE ON session_chunks
        FOR EACH ROW
        EXECUTE FUNCTION update_session_chunks_updated_at()
    `);

    console.log("\n✅ Migration 0027 completed successfully!");
    console.log("\nChanges:");
    console.log("  • Created session_chunks table");
    console.log("  • Added pgvector HNSW index for similarity search");
    console.log("  • Added indexes for session_id, org_id, chunk_type");
    console.log("  • Added GIN index for metadata JSONB queries");
    console.log("\nWhat this enables:");
    console.log("  • Document generation RAG (separate from knowledge agent)");
    console.log("  • Chunk types: classifier, storyteller_summary, storyteller_timeline");
    console.log("  • Auto-triggered when session status becomes 'ready'");
    console.log("\nNext steps:");
    console.log("  • Run backfill: npx tsx src/scripts/backfill-session-chunks.ts --execute");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
