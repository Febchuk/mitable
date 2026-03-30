-- Benchmarks feature migration
-- Run with: psql $DATABASE_URL -f apps/backend/src/db/migrations/benchmarks.sql

BEGIN;

-- 1. Benchmarks (org-scoped definitions)
CREATE TABLE IF NOT EXISTS benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  metric VARCHAR(50) NOT NULL,
  target_value REAL NOT NULL,
  unit VARCHAR(50) NOT NULL,
  frequency VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmarks_organization_id ON benchmarks(organization_id);

-- 2. Benchmark Parameters (axes for scoring)
CREATE TABLE IF NOT EXISTS benchmark_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  importance INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_parameters_benchmark_id ON benchmark_parameters(benchmark_id);

-- 3. Benchmark Assignments (user-to-benchmark links with scores)
CREATE TABLE IF NOT EXISTS benchmark_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_value REAL,
  current_value REAL NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  percentile VARCHAR(20) DEFAULT 'bottom_half',
  trend VARCHAR(20) DEFAULT 'new',
  trend_delta REAL DEFAULT 0,
  assigned_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL,
  UNIQUE(benchmark_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_assignments_user_id ON benchmark_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_benchmark_assignments_benchmark_id ON benchmark_assignments(benchmark_id);

-- 4. Benchmark Snapshots (historical data points)
CREATE TABLE IF NOT EXISTS benchmark_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES benchmark_assignments(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  value REAL NOT NULL,
  target REAL NOT NULL,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_assignment_date ON benchmark_snapshots(assignment_id, date);

-- 5. Benchmark Suggestions (AI coaching)
CREATE TABLE IF NOT EXISTS benchmark_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES benchmark_assignments(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_suggestions_assignment_id ON benchmark_suggestions(assignment_id);

-- 6. Benchmark Accomplishments (detected achievements)
CREATE TABLE IF NOT EXISTS benchmark_accomplishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES benchmark_assignments(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_accomplishments_assignment_id ON benchmark_accomplishments(assignment_id);

-- 7. Benchmark Parameter Scores (per-axis LLM scores)
CREATE TABLE IF NOT EXISTS benchmark_parameter_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES benchmark_assignments(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES benchmark_parameters(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  reasoning TEXT,
  period_start DATE NOT NULL,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_parameter_scores_assignment_period ON benchmark_parameter_scores(assignment_id, period_start);

COMMIT;
