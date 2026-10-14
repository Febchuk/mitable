-- Project letters are individual reports. They do not consume the child's
-- one-daily-report slot or share its progress snapshot.
alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type in ('daily', 'major', 'incident', 'sen', 'project'));
