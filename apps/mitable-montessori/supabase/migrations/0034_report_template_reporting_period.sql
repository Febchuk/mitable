-- =============================================================================
-- 0034 — Add reporting_period and context_mode_default to report_templates,
--         and ensure section_meta column exists.
--
-- reporting_period drives how much historical child data the AI pulls when
-- drafting a report. context_mode_default sets whether the template defaults
-- to using child history or only the teacher's current input.
--
-- section_meta was added to the codebase without a corresponding migration;
-- the IF NOT EXISTS guard makes this idempotent for the live DB.
-- =============================================================================

-- section_meta: per-section field type metadata (text / checklist / single_select)
alter table public.report_templates
  add column if not exists section_meta jsonb not null default '{}'::jsonb;

-- reporting_period: drives the context window for AI-assisted drafting
alter table public.report_templates
  add column if not exists reporting_period text
    check (reporting_period is null or reporting_period in
      ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'end_of_term'));

-- context_mode_default: whether the template defaults to pulling child history
alter table public.report_templates
  add column if not exists context_mode_default text not null default 'history'
    check (context_mode_default in ('history', 'input_only'));
