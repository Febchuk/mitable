-- 0044 used auth.jwt() ->> 'role' = 'admin', but migration 0021 moved app role to
-- user_role and admin checks must use current_user_is_admin().

drop policy if exists "school_terms read" on public.school_terms;
drop policy if exists "school_terms admin write" on public.school_terms;

create policy "school_terms read"
  on public.school_terms for select
  using (school_id = public.current_user_school_id());

create policy "school_terms admin write"
  on public.school_terms for all
  using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  )
  with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );
