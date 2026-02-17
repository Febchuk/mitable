-- Migration 0038: Create daily activity tables for admin dashboard
-- 
-- Two tables:
--   1. user_daily_activities  — Per-user daily rollup (Layer 1 output)
--   2. activity_blocks        — Individual work/meeting blocks within a day
--   3. org_daily_metrics      — Org-wide aggregated metrics (Layer 2 output)

-- ============================================================================
-- Table: user_daily_activities
-- One row per user per day. Stores the Day Analyzer RLM output.
-- ============================================================================
CREATE TABLE user_daily_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- The date this rollup covers
  activity_date DATE NOT NULL,

  -- Period type for time-period snapshots (Layer 3)
  period_type VARCHAR(20) NOT NULL DEFAULT 'daily',
  -- Values: 'daily', 'weekly', 'monthly'

  -- Quantitative rollup
  total_work_minutes INTEGER NOT NULL DEFAULT 0,
  total_meeting_minutes INTEGER NOT NULL DEFAULT 0,
  total_active_minutes INTEGER NOT NULL DEFAULT 0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_captures INTEGER NOT NULL DEFAULT 0,

  -- Percentage breakdowns
  work_percentage REAL NOT NULL DEFAULT 0,
  meeting_percentage REAL NOT NULL DEFAULT 0,

  -- App usage breakdown (JSONB array)
  app_breakdown JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "app": "VS Code", "minutes": 120 }, ...]

  -- Activity category breakdown (JSONB array)
  category_breakdown JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "category": "development", "percentage": 45, "minutes": 180 }, ...]

  -- AI-generated content (from Day Analyzer RLM)
  day_summary TEXT,
  -- "Sarah focused on frontend development, spending 3h on the payment flow implementation. 
  --  She attended 2 meetings including sprint planning and a design review with the team."

  key_accomplishments JSONB NOT NULL DEFAULT '[]',
  -- Format: ["Merged auth refactor PR", "Completed payment flow UI"]

  -- Processing metadata
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Values: 'pending', 'processing', 'completed', 'failed'
  model_used VARCHAR(100),
  processing_time_ms INTEGER,
  last_processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- One rollup per user per day per period type
  UNIQUE(user_id, activity_date, period_type)
);

CREATE INDEX idx_user_daily_activities_user ON user_daily_activities(user_id, activity_date);
CREATE INDEX idx_user_daily_activities_org ON user_daily_activities(organization_id, activity_date);
CREATE INDEX idx_user_daily_activities_status ON user_daily_activities(status);

-- ============================================================================
-- Table: activity_blocks
-- Individual work/meeting blocks within a user's day.
-- Child of user_daily_activities.
-- ============================================================================
CREATE TABLE activity_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_activity_id UUID NOT NULL REFERENCES user_daily_activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Block type and identity
  block_type VARCHAR(20) NOT NULL,
  -- Values: 'work', 'meeting'
  name VARCHAR(500) NOT NULL,
  -- e.g., "Auth PR Code Review" or "Sprint Planning Standup"

  -- Timing
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL,

  -- Details
  description TEXT,
  -- AI-generated longer description of what happened in this block

  apps JSONB NOT NULL DEFAULT '[]',
  -- Format: ["VS Code", "Chrome", "Terminal"]

  category VARCHAR(50),
  -- For work: 'development', 'communication', 'research', 'design', 'review', 'other'
  -- For meetings: 'standup', 'planning', 'review', 'one_on_one', 'external', 'other'

  -- Meeting-specific fields
  participants JSONB DEFAULT '[]',
  -- Format: ["Speaker 0", "Speaker 1"] or named if identifiable

  -- Source tracking (which sessions contributed to this block)
  source_session_ids JSONB NOT NULL DEFAULT '[]',
  -- Format: ["uuid1", "uuid2"]

  -- Ordering within the day
  sequence_number INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_activity_blocks_daily ON activity_blocks(daily_activity_id);
CREATE INDEX idx_activity_blocks_user_time ON activity_blocks(user_id, start_time);
CREATE INDEX idx_activity_blocks_type ON activity_blocks(block_type);

-- ============================================================================
-- Table: org_daily_metrics
-- Org-wide aggregated metrics (Layer 2 output).
-- One row per org per day per period type.
-- ============================================================================
CREATE TABLE org_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- The date this rollup covers
  metrics_date DATE NOT NULL,

  -- Period type for time-period snapshots (Layer 3)
  period_type VARCHAR(20) NOT NULL DEFAULT 'daily',
  -- Values: 'daily', 'weekly', 'monthly'

  -- Team-wide averages
  avg_work_minutes REAL NOT NULL DEFAULT 0,
  avg_meeting_minutes REAL NOT NULL DEFAULT 0,
  avg_active_minutes REAL NOT NULL DEFAULT 0,
  avg_work_percentage REAL NOT NULL DEFAULT 0,
  avg_meeting_percentage REAL NOT NULL DEFAULT 0,

  -- Totals
  total_users_tracked INTEGER NOT NULL DEFAULT 0,
  total_team_work_minutes INTEGER NOT NULL DEFAULT 0,
  total_team_meeting_minutes INTEGER NOT NULL DEFAULT 0,

  -- Org-wide activity distribution (JSONB array)
  activity_distribution JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "category": "development", "percentage": 40, "totalMinutes": 1200 }, ...]

  -- Top apps across org (JSONB array)
  top_apps JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "app": "VS Code", "totalMinutes": 800, "userCount": 12 }, ...]

  -- Per-user summary for quick access (JSONB array)
  user_summaries JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "userId": "uuid", "name": "Sarah Chen", "activeMinutes": 405, "workPct": 75, "meetingPct": 25 }, ...]

  -- Processing metadata
  last_processed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- One rollup per org per day per period type
  UNIQUE(organization_id, metrics_date, period_type)
);

CREATE INDEX idx_org_daily_metrics_org ON org_daily_metrics(organization_id, metrics_date);
