-- Persist section_meta + section_guidance on reports created from the built-in
-- "From progress" template (template_id IS NULL). Admin-uploaded templates
-- keep using report_templates; these columns stay {} for those rows.

alter table public.reports
  add column if not exists section_meta jsonb not null default '{}'::jsonb;

alter table public.reports
  add column if not exists section_guidance jsonb not null default '{}'::jsonb;
