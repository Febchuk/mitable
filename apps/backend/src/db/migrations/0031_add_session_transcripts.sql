-- Migration: Add session_transcripts table for audio transcription
-- 
-- Purpose: Store real-time audio transcripts from Deepgram during monitoring sessions.
-- Includes speaker diarization to differentiate between multiple speakers.
-- 
-- Chronological Consistency:
-- - Uses timestamp with timezone for precise time alignment
-- - start_time and end_time align with session_captures.captured_at
-- - Allows RLM classifier to correlate audio context with visual frames
--
-- Example Query (get context for a capture):
-- SELECT * FROM session_transcripts 
-- WHERE session_id = '...' 
--   AND start_time <= '2026-02-03 20:00:00' 
--   AND end_time >= '2026-02-03 19:59:55'
-- ORDER BY start_time;

CREATE TABLE IF NOT EXISTS session_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES monitoring_sessions(id) ON DELETE CASCADE,
  
  -- Speaker identification (from Deepgram diarization)
  -- speaker_id: 0, 1, 2, etc. - identifies unique speakers in the session
  speaker_id INTEGER NOT NULL,
  
  -- Transcript content
  transcript TEXT NOT NULL,
  
  -- Timing information (timestamp with timezone for consistency with session_captures)
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  
  -- Confidence score from Deepgram (0.0 to 1.0)
  confidence REAL NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: Query transcripts by session
CREATE INDEX session_transcripts_session_id_idx 
  ON session_transcripts(session_id);

-- Index: Time-based queries for chronological alignment with captures
-- This enables efficient queries like "get all transcripts during this capture's time window"
CREATE INDEX session_transcripts_time_idx 
  ON session_transcripts(session_id, start_time);

-- Index: Speaker-based queries
CREATE INDEX session_transcripts_speaker_idx 
  ON session_transcripts(session_id, speaker_id);

-- Comment for documentation
COMMENT ON TABLE session_transcripts IS 
  'Real-time audio transcripts from Deepgram with speaker diarization. Timestamps align with session_captures for multimodal context.';

COMMENT ON COLUMN session_transcripts.speaker_id IS 
  'Speaker identifier from Deepgram diarization (0, 1, 2, etc.). Does not map to user IDs - just distinguishes voices.';

COMMENT ON COLUMN session_transcripts.start_time IS 
  'Utterance start time (with timezone). Aligns with session_captures.captured_at for temporal correlation.';

COMMENT ON COLUMN session_transcripts.confidence IS 
  'Deepgram transcription confidence score (0.0 to 1.0). Lower scores may indicate unclear audio or overlapping speech.';
