-- Migration 0042: Create graph sync control and visibility snapshot tables

CREATE TABLE IF NOT EXISTS graph_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  synced_users INTEGER NOT NULL DEFAULT 0,
  synced_workstreams INTEGER NOT NULL DEFAULT 0,
  synced_preferences INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_sync_runs_started ON graph_sync_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_graph_sync_runs_success ON graph_sync_runs (success);

CREATE TABLE IF NOT EXISTS graph_sync_watermarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL UNIQUE,
  watermark_ts TIMESTAMPTZ,
  watermark_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_sync_watermarks_source ON graph_sync_watermarks (source);

CREATE TABLE IF NOT EXISTS workflow_visibility_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID,
  window TEXT NOT NULL,
  snapshot_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_visibility_org_window
  ON workflow_visibility_snapshots (organization_id, window);

CREATE INDEX IF NOT EXISTS idx_workflow_visibility_user_window
  ON workflow_visibility_snapshots (user_id, window);
