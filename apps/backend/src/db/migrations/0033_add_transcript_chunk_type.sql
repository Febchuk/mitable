-- Migration: Add 'transcript' to session_chunks chunk_type check constraint
-- Needed for audio transcript chunking in session ingestion

ALTER TABLE session_chunks DROP CONSTRAINT IF EXISTS session_chunks_chunk_type_check;
ALTER TABLE session_chunks ADD CONSTRAINT session_chunks_chunk_type_check 
  CHECK (chunk_type IN ('classifier', 'storyteller_summary', 'storyteller_timeline', 'transcript'));
