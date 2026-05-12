-- =============================================================================
-- 0038 — AI score, flags, and reasoning on reports
--
-- Until now, "AI score" was a stubbed hash of the report id (see
-- stubAiScore() in src/lib/queries/reports.ts). This migration adds the four
-- columns the real scorer writes to:
--
--   ai_score       0–100 composite confidence score; null until first scored.
--   ai_flags       JSONB array of {kind, status, note}. Per-category signals
--                  (tone / evidence / pii / template) that surface as chips
--                  on the AI callout in the reading pane.
--   ai_reasoning   JSONB array of strings. The expandable "why this score?"
--                  bullets reviewers see when they don't trust the headline
--                  number.
--   ai_scored_at   When the scorer last ran. Lets the UI show "calculated
--                  2 min ago" and lets us re-score only when the body changes.
--
-- All four are nullable — existing reports have no score, the UI handles
-- that state. The scorer (Phase 4) runs synchronously on /submit and
-- fire-and-forget on PATCH (autosave) so re-submits never block on the LLM.
-- =============================================================================

alter table reports
  add column if not exists ai_score smallint,
  add column if not exists ai_flags jsonb,
  add column if not exists ai_reasoning jsonb,
  add column if not exists ai_scored_at timestamptz;

-- Score band: 0..100 inclusive. Null is fine (never scored).
alter table reports
  drop constraint if exists reports_ai_score_range,
  add constraint reports_ai_score_range
    check (ai_score is null or (ai_score between 0 and 100));

-- Most queries filter ai_score by band — index lets the "Approve all green"
-- bulk action (Phase 5) scan only green-tier rows without a sequential scan.
create index if not exists reports_ai_score_idx
  on reports (ai_score)
  where ai_score is not null;
