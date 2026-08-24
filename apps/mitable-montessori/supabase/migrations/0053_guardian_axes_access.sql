-- Whole-child assessments need their school's axis labels and descriptors in
-- the parent portal. This helper keeps the scope to the signed-in guardian's
-- school without relying on a staff users row.
create or replace function public.current_guardian_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select school_id
  from public.guardians
  where id = public.current_guardian_id();
$$;

revoke all on function public.current_guardian_school_id() from public;
grant execute on function public.current_guardian_school_id()
  to authenticated, anon, service_role;

create policy "guardians read own school axes" on public.axes
  for select
  using (school_id = public.current_guardian_school_id());
