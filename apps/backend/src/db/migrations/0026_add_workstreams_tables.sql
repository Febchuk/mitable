-- Migration: Add Workstreams Tables for RLM-based workstream detection
--
-- This migration adds support for intelligent workstream grouping:
-- 1. session_workstreams - Stores detected workstreams with AI-generated summaries
-- 2. workstream_analysis_log - Tracks RLM analysis runs for debugging
-- 3. Adds workstream_id to session_captures for linking

-- ============================================
-- Table: session_workstreams
-- ============================================
CREATE TABLE IF NOT EXISTS session_workstreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES monitoring_sessions(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  color VARCHAR(20) NOT NULL,
  category VARCHAR(50),

  -- AI-generated content
  summary TEXT,

  -- State
  is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  is_merged_into UUID REFERENCES session_workstreams(id),

  -- Stats (denormalized for quick access)
  capture_count INTEGER NOT NULL DEFAULT 0,
  total_duration_minutes INTEGER NOT NULL DEFAULT 0,
  apps_used TEXT[] NOT NULL DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_analysis_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for session_workstreams
CREATE INDEX IF NOT EXISTS idx_session_workstreams_session ON session_workstreams(session_id);
CREATE INDEX IF NOT EXISTS idx_session_workstreams_merged ON session_workstreams(is_merged_into);

-- ============================================
-- Table: workstream_analysis_log
-- ============================================
CREATE TABLE IF NOT EXISTS workstream_analysis_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES monitoring_sessions(id) ON DELETE CASCADE,

  -- Analysis metadata
  analysis_number INTEGER NOT NULL,
  trigger_reason VARCHAR(50),
  captures_analyzed INTEGER,

  -- RLM details
  model_used VARCHAR(100),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  execution_time_ms INTEGER,

  -- Results summary
  workstreams_created INTEGER DEFAULT 0,
  workstreams_merged INTEGER DEFAULT 0,
  captures_reassigned INTEGER DEFAULT 0,

  -- Error tracking
  error TEXT,
  success BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for workstream_analysis_log
CREATE INDEX IF NOT EXISTS idx_workstream_analysis_session ON workstream_analysis_log(session_id);
CREATE INDEX IF NOT EXISTS idx_workstream_analysis_created ON workstream_analysis_log(created_at);

-- ============================================
-- Alter: session_captures - Add workstream columns
-- ============================================
ALTER TABLE session_captures
  ADD COLUMN IF NOT EXISTS workstream_id UUID REFERENCES session_workstreams(id),
  ADD COLUMN IF NOT EXISTS workstream_provisional BOOLEAN DEFAULT TRUE;

-- Index for workstream lookups
CREATE INDEX IF NOT EXISTS idx_captures_workstream ON session_captures(workstream_id);
