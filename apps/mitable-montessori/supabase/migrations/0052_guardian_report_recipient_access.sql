-- Parents may only read reports addressed to them, rather than every sent
-- report for a child. The helper is SECURITY DEFINER to keep the RLS policy
-- graph flat (reports and report_recipients otherwise reference each other).
create or replace function public.guardian_visible_report_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select report_id
  from public.report_recipients
  where guardian_id = public.current_guardian_id();
$$;

revoke all on function public.guardian_visible_report_ids() from public;
grant execute on function public.guardian_visible_report_ids()
  to authenticated, anon, service_role;

drop policy if exists "guardians see sent reports" on public.reports;
drop policy if exists "guardians see sent reports v2" on public.reports;

create policy "guardians see reports sent to them" on public.reports
  for select
  using (
    status = 'sent'
    and id in (select public.guardian_visible_report_ids())
  );
