-- Migration 0046: Add external_id to activity_blocks for deduplication
-- Stores the source system's unique ID (Fireflies transcript ID, Granola meeting ID)
-- so sync jobs can skip already-ingested meetings without re-classifying.

ALTER TABLE activity_blocks
ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

-- Unique constraint: one block per (user, type, external source ID)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_blocks_external
ON activity_blocks (user_id, block_type, external_id)
WHERE external_id IS NOT NULL;

COMMENT ON COLUMN activity_blocks.external_id IS 'Source system unique ID (e.g. Fireflies transcript ID, Granola meeting ID) for deduplication';
