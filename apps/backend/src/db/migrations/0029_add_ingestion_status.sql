-- Migration: Add ingestion_status to monitoring_sessions to track RAG ingestion separately
-- Addresses race condition where session is marked "ready" before ingestion completes

ALTER TABLE monitoring_sessions
ADD COLUMN ingestion_status TEXT DEFAULT 'pending' CHECK (ingestion_status IN ('pending', 'ingesting', 'completed', 'failed'));

-- Backfill: sessions that are ready/ended should have completed ingestion (or are old)
UPDATE monitoring_sessions
SET ingestion_status = 'completed'
WHERE status IN ('ready', 'ended');

-- Create index for filtering by ingestion status
CREATE INDEX idx_monitoring_sessions_ingestion_status ON monitoring_sessions(ingestion_status);
