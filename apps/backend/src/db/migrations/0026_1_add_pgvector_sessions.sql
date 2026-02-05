-- Migration: Add pgvector extension and session metadata to search_content
-- Description: Enable vector search with pgvector HNSW index and add session-specific columns
-- Author: Docs Overhaul (feature/docs-overhaul-rag-rlm)
-- Date: 2026-01-31

BEGIN;

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to search_content
ALTER TABLE search_content 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Add session metadata columns (for source='session')
ALTER TABLE search_content
ADD COLUMN IF NOT EXISTS session_id UUID,
ADD COLUMN IF NOT EXISTS session_name TEXT,
ADD COLUMN IF NOT EXISTS session_goal TEXT,
ADD COLUMN IF NOT EXISTS session_status TEXT,
ADD COLUMN IF NOT EXISTS action_type TEXT,
ADD COLUMN IF NOT EXISTS app_name TEXT,
ADD COLUMN IF NOT EXISTS window_title TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS importance_score REAL,
ADD COLUMN IF NOT EXISTS confidence REAL,
ADD COLUMN IF NOT EXISTS start_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS end_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
ADD COLUMN IF NOT EXISTS activity_count INTEGER;

-- 4. Add doc facts JSONB column (structured claims + evidence + outcomes)
ALTER TABLE search_content
ADD COLUMN IF NOT EXISTS doc_facts JSONB;

-- 5. Add RLM environment columns (retrieved only when explicitly requested)
ALTER TABLE search_content
ADD COLUMN IF NOT EXISTS classifier_environment_jsonb JSONB,
ADD COLUMN IF NOT EXISTS storyteller_environment_jsonb JSONB,
ADD COLUMN IF NOT EXISTS raw_capture_ids TEXT[];

-- 6. Create HNSW index for vector similarity search (preferred over IVFFlat)
-- Using cosine distance (vector_cosine_ops) for semantic similarity
-- m=16: number of bi-directional links per node (higher = better recall, more memory)
-- ef_construction=64: size of dynamic candidate list during index build (higher = better quality)
CREATE INDEX IF NOT EXISTS search_content_embedding_hnsw_idx 
ON search_content 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 7. Add indexes for session filtering
CREATE INDEX IF NOT EXISTS search_content_session_id_idx 
ON search_content(session_id) 
WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS search_content_action_type_idx 
ON search_content(action_type) 
WHERE action_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS search_content_importance_score_idx 
ON search_content(importance_score) 
WHERE importance_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS search_content_start_time_idx 
ON search_content(start_time) 
WHERE start_time IS NOT NULL;

-- 8. Add composite index for common session queries
CREATE INDEX IF NOT EXISTS search_content_session_time_idx 
ON search_content(organization_id, source, start_time) 
WHERE source = 'session';

COMMIT;

-- Rollback instructions:
-- To undo this migration, run:
-- BEGIN;
-- DROP INDEX IF EXISTS search_content_embedding_hnsw_idx;
-- DROP INDEX IF EXISTS search_content_session_id_idx;
-- DROP INDEX IF EXISTS search_content_action_type_idx;
-- DROP INDEX IF EXISTS search_content_importance_score_idx;
-- DROP INDEX IF EXISTS search_content_start_time_idx;
-- DROP INDEX IF EXISTS search_content_session_time_idx;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS embedding;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS session_id;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS session_name;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS session_goal;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS session_status;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS action_type;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS app_name;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS window_title;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS file_name;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS importance_score;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS confidence;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS start_time;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS end_time;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS duration_minutes;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS activity_count;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS doc_facts;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS classifier_environment_jsonb;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS storyteller_environment_jsonb;
-- ALTER TABLE search_content DROP COLUMN IF EXISTS raw_capture_ids;
-- DROP EXTENSION IF EXISTS vector;
-- COMMIT;
