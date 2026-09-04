-- Keep the RLS helper out of the public Data API while preserving its use in
-- policies for signed-in teachers.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create function private.teacher_active_toddler_classroom_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.classroom_id
  from public.classroom_teacher_assignments a
  join public.classrooms c on c.id = a.classroom_id
  where a.teacher_user_id = auth.uid()
    and a.end_date is null
    and c.school_id = public.current_user_school_id()
    and lower(coalesce(c.code, '')) = 'toddler';
$$;

revoke all on function private.teacher_active_toddler_classroom_ids() from public, anon;
grant execute on function private.teacher_active_toddler_classroom_ids()
  to authenticated, service_role;

alter policy "toddler daily logs school read"
  on public.toddler_daily_logs
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select private.teacher_active_toddler_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

alter policy "toddler daily logs teacher insert"
  on public.toddler_daily_logs
  with check (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select private.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  );

alter policy "toddler daily logs teacher update"
  on public.toddler_daily_logs
  using (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select private.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  )
  with check (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select private.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  );

alter policy "toddler daily logs teacher delete"
  on public.toddler_daily_logs
  using (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select private.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  );

drop function public.teacher_active_toddler_classroom_ids();
