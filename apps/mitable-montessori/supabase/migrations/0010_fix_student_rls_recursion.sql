-- Phase 4 follow-up #2: break the second RLS cycle exposed after 0009.
--
-- 0009 fixed the classroom_teacher_assignments ↔ classrooms cycle by
-- introducing teacher_active_classroom_ids(). After applying it, pullSync
-- now hits a new cycle:
--
--   "teacher reads enrolled students" on students    (from 0009)
--     sub-selects student_classroom_enrollments
--   "scoped read enrollments" on student_classroom_enrollments  (from 0002)
--     sub-selects students
--
-- Same SECURITY DEFINER trick: hide the cross-table sub-select inside a
-- function whose body bypasses RLS, so the policy walker doesn't recurse.

create or replace function public.teacher_visible_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.student_id
    from public.student_classroom_enrollments e
   where e.end_date is null
     and e.classroom_id in (select public.teacher_active_classroom_ids());
$$;

revoke execute on function public.teacher_visible_student_ids() from public;
grant  execute on function public.teacher_visible_student_ids()
       to authenticated, anon, service_role;

-- Rewrite the three 0009 teacher policies that traverse
-- student_classroom_enrollments to call the helper instead. The
-- "teacher reads classroom enrollments" policy already calls
-- teacher_active_classroom_ids() directly — redeclared here so the file
-- is self-contained and safe to re-run.

drop policy if exists "teacher reads enrolled students" on students;
create policy "teacher reads enrolled students"
  on students
  for select
  using (id in (select public.teacher_visible_student_ids()));

drop policy if exists "teacher reads classroom enrollments" on student_classroom_enrollments;
create policy "teacher reads classroom enrollments"
  on student_classroom_enrollments
  for select
  using (classroom_id in (select public.teacher_active_classroom_ids()));

drop policy if exists "teacher reads classroom student_guardians" on student_guardians;
create policy "teacher reads classroom student_guardians"
  on student_guardians
  for select
  using (student_id in (select public.teacher_visible_student_ids()));
