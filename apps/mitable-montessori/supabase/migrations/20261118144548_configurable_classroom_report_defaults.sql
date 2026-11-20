-- An admin-owned template may be the default for one classroom family.
alter table public.report_templates add column default_for text
  check (default_for in ('all', 'elementary', 'childrens_house', 'toddler_house'));
create unique index report_templates_one_default_per_group
  on public.report_templates(school_id, kind, default_for) where is_active and default_for is not null;

-- Make the current built-in end-of-term layouts editable without altering old reports.
insert into public.report_templates (school_id, name, kind, default_for, sections, section_meta, section_guidance, reporting_period, icon_tone)
select schools.id, groups.name, 'Major', groups.family,
  case when groups.family = 'elementary' then
    array['Curriculum progress', 'Exam grades', 'Skills report', 'Teacher''s comment', 'Specials report', 'Director''s comment', 'Incident reports — term highlights']
  else array['Curriculum progress', 'Skills report', 'Teacher''s comment', 'Specials report', 'Director''s comment', 'Incident reports — term highlights'] end,
  jsonb_build_object(
    'Curriculum progress', jsonb_build_object('type', 'progress_summary'),
    'Skills report', jsonb_build_object('type', 'term_skills'),
    'Teacher''s comment', jsonb_build_object('type', 'manual_text'),
    'Specials report', jsonb_build_object('type', 'manual_text'),
    'Director''s comment', jsonb_build_object('type', 'director_comment'),
    'Incident reports — term highlights', jsonb_build_object('type', 'term_history', 'reportType', 'incident')
  ) || case when groups.family = 'elementary' then jsonb_build_object('Exam grades', jsonb_build_object('type', 'exam_grades', 'termId', null)) else '{}'::jsonb end,
  '{}'::jsonb, 'end_of_term', 'sage'
from public.schools
cross join (values ('elementary', 'Elementary — End-of-term'), ('childrens_house', 'Children’s House — End-of-term'), ('toddler_house', 'Toddler’s House — End-of-term')) as groups(family, name);
