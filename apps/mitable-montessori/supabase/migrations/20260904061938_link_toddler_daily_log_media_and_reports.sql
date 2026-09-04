-- Keep toddler daily-log reports and their media tied to the exact saved log.
-- Nullable columns preserve existing reports and standalone student media.
alter table public.student_media
  add column if not exists toddler_daily_log_id uuid
  references public.toddler_daily_logs(id) on delete set null;

create index if not exists student_media_toddler_daily_log_idx
  on public.student_media (toddler_daily_log_id)
  where toddler_daily_log_id is not null and status <> 'deleted';

alter table public.reports
  add column if not exists toddler_daily_log_id uuid
  references public.toddler_daily_logs(id) on delete set null;

create index if not exists reports_toddler_daily_log_idx
  on public.reports (toddler_daily_log_id)
  where toddler_daily_log_id is not null;
