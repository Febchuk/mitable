-- The parent header reads guardians.schools(name). Parents do not have the
-- staff school_id JWT claim used by the original schools SELECT policy.
-- Use the existing guardian lookup to expose only their own school's row.
create policy "guardians read own school" on public.schools
  for select
  to authenticated
  using (id = (select public.current_guardian_school_id()));
