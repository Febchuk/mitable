-- Add Slack user OAuth columns to users table (per-user event subscriptions)
-- Following the same pattern as Gmail/Linear/Notion/Granola user tokens
-- Safe to run multiple times (IF NOT EXISTS)

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN slack_user_access_token_encrypted TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN slack_user_token_expires_at TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN slack_user_id VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN slack_team_id VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN slack_team_name VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN slack_user_display_name VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Slack user events table for storing incoming webhook events
CREATE TABLE IF NOT EXISTS slack_user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  slack_event_id VARCHAR(100) NOT NULL UNIQUE,
  sender_slack_id VARCHAR(50) NOT NULL,
  sender_name VARCHAR(255),
  recipient_slack_id VARCHAR(50) NOT NULL,
  recipient_name VARCHAR(255),
  channel_id VARCHAR(50),
  channel_name VARCHAR(255),
  message_text TEXT NOT NULL,
  slack_ts VARCHAR(50) NOT NULL,
  event_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_user_events_user ON slack_user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_user_events_event_id ON slack_user_events(slack_event_id);
