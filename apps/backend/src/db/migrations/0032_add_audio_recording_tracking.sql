-- Migration: Add audio recording duration tracking to monitoring_sessions
-- 
-- Purpose: Track total duration of audio recordings within a session.
-- Similar to pause tracking, we track when audio starts and accumulate total duration.
--
-- Use case: Display "Audio Recorded: 5m 23s" in session dashboard

ALTER TABLE monitoring_sessions
ADD COLUMN audio_recording_started_at TIMESTAMPTZ,
ADD COLUMN audio_recording_total_ms INTEGER NOT NULL DEFAULT 0;

-- Comment for documentation
COMMENT ON COLUMN monitoring_sessions.audio_recording_started_at IS 
  'Timestamp when audio recording was last started. Null when not recording.';

COMMENT ON COLUMN monitoring_sessions.audio_recording_total_ms IS 
  'Cumulative duration of all audio recordings in this session (milliseconds).';
