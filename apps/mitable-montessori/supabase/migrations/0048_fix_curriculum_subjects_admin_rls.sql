drop policy if exists "admins write subjects" on public.curriculum_subjects;

create policy "admins write subjects"
  on public.curriculum_subjects
  for all
  using (
    public.current_user_is_admin()
    and curriculum_id in (select public.school_curriculum_ids())
  )
  with check (
    public.current_user_is_admin()
    and curriculum_id in (select public.school_curriculum_ids())
  );
