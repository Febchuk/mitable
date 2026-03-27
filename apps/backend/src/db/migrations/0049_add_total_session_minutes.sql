-- Add total_session_minutes to user_daily_activities
-- Stores the sum of actual monitoring session durations (endedAt - startedAt)
-- for all sessions processed into this daily row.
-- This is the ground-truth "time spent in Mitable" metric.

ALTER TABLE user_daily_activities
  ADD COLUMN IF NOT EXISTS total_session_minutes integer NOT NULL DEFAULT 0;
