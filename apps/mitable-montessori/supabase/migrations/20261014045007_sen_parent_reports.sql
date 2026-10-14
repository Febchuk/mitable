-- Link a saved SEN assessment to one ordinary deliverable report.
alter table public.reports drop constraint if exists reports_report_type_check;
alter table public.reports add constraint reports_report_type_check
  check (report_type in ('daily', 'major', 'incident', 'sen'));
alter table public.reports add column if not exists sen_daily_report_id uuid
  references public.sen_daily_reports(id) on delete restrict;
create unique index if not exists reports_sen_daily_report_key
  on public.reports(sen_daily_report_id) where sen_daily_report_id is not null;
