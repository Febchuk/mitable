-- Allow admins to delete report templates even when teachers have created
-- reports from them. Existing reports keep their content; template_id clears.

alter table public.reports
  drop constraint if exists reports_template_id_fkey;

alter table public.reports
  add constraint reports_template_id_fkey
  foreign key (template_id) references public.report_templates(id) on delete set null;
