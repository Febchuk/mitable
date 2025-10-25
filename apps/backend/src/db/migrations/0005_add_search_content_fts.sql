-- Migration: Add search_content table for hybrid search (PostgreSQL FTS)
-- Description: Creates table to mirror Pinecone vectors for keyword search
-- Author: Hybrid Search Implementation
-- Date: 2025-10-24

BEGIN;

-- Drop existing table if it exists (cleanup from previous push attempts)
DROP TABLE IF EXISTS "search_content" CASCADE;

-- Create search_content table
CREATE TABLE IF NOT EXISTS "search_content" (
  "id" TEXT PRIMARY KEY,
  "organization_id" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "source_type" TEXT,
  "text" TEXT NOT NULL,
  "text_vector" tsvector NOT NULL,
  "channel_id" TEXT,
  "channel_name" TEXT,
  "user_id" TEXT,
  "username" TEXT,
  "page_id" TEXT,
  "page_title" TEXT,
  "block_id" TEXT,
  "block_type" TEXT,
  "chunk_index" INTEGER DEFAULT 0,
  "total_chunks" INTEGER DEFAULT 1,
  "is_chunked" BOOLEAN DEFAULT FALSE,
  "timestamp" BIGINT,
  "date" DATE,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  
  CONSTRAINT "fk_organization" 
    FOREIGN KEY ("organization_id") 
    REFERENCES "organizations"("id") 
    ON DELETE CASCADE
);

-- Create GIN index for full-text search (THIS IS THE CRITICAL INDEX)
-- GIN (Generalized Inverted Index) is optimal for tsvector columns
-- fastupdate=on allows faster ingestion at the cost of slightly slower search
CREATE INDEX IF NOT EXISTS "search_content_text_vector_idx" 
  ON "search_content" 
  USING GIN("text_vector")
  WITH (fastupdate = on);

-- Standard B-tree indexes for filters
CREATE INDEX IF NOT EXISTS "search_content_org_idx" 
  ON "search_content"("organization_id");

CREATE INDEX IF NOT EXISTS "search_content_source_idx" 
  ON "search_content"("source");

CREATE INDEX IF NOT EXISTS "search_content_date_idx" 
  ON "search_content"("date");

-- Composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS "search_content_org_source_idx" 
  ON "search_content"("organization_id", "source");

CREATE INDEX IF NOT EXISTS "search_content_org_date_idx" 
  ON "search_content"("organization_id", "date");

-- Source-specific indexes
CREATE INDEX IF NOT EXISTS "search_content_channel_idx" 
  ON "search_content"("channel_id");

CREATE INDEX IF NOT EXISTS "search_content_page_idx" 
  ON "search_content"("page_id");

-- Create trigger function to auto-update text_vector on INSERT/UPDATE
-- This uses PostgreSQL's to_tsvector with 'english' configuration
CREATE OR REPLACE FUNCTION update_search_content_text_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.text_vector := to_tsvector('english', NEW.text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to search_content table
DROP TRIGGER IF EXISTS search_content_text_vector_update ON "search_content";
CREATE TRIGGER search_content_text_vector_update
  BEFORE INSERT OR UPDATE OF "text"
  ON "search_content"
  FOR EACH ROW
  EXECUTE FUNCTION update_search_content_text_vector();

-- Create trigger function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_search_content_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach timestamp trigger
DROP TRIGGER IF EXISTS search_content_updated_at_update ON "search_content";
CREATE TRIGGER search_content_updated_at_update
  BEFORE UPDATE
  ON "search_content"
  FOR EACH ROW
  EXECUTE FUNCTION update_search_content_timestamp();

COMMIT;

-- Rollback instructions:
-- To undo this migration, run:
-- BEGIN;
-- DROP TRIGGER IF EXISTS search_content_text_vector_update ON "search_content";
-- DROP TRIGGER IF EXISTS search_content_updated_at_update ON "search_content";
-- DROP FUNCTION IF EXISTS update_search_content_text_vector();
-- DROP FUNCTION IF EXISTS update_search_content_timestamp();
-- DROP TABLE IF EXISTS "search_content";
-- COMMIT;
