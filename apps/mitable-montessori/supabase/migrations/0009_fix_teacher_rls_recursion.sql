-- Phase 4 follow-up: break the RLS recursion 0008 introduced.
--
-- 0008 added "teacher reads own classrooms" on classrooms with a sub-select
-- into classroom_teacher_assignments. The 0002 baseline already had
-- "scoped read classroom_teachers" on classroom_teacher_assignments with a
-- sub-select into classrooms. Postgres evaluates *all* applicable policies
-- per row, so the two form a cycle the moment a teacher's session reads
-- either table — pullSync hits a 500.
--
-- Fix: wrap the teacher's "actively-assigned classroom_ids" lookup in a
-- SECURITY DEFINER function. SECURITY DEFINER functions bypass RLS inside
-- their bodies, so calling the helper from a policy doesn't re-trigger the
-- policy walker on classroom_teacher_assignments. Same security: the
-- function captures auth.uid() from the caller, so users can only ever see
-- their own assignments through it.

create or replace function public.teacher_active_classroom_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select classroom_id
    from public.classroom_teacher_assignments
   where teacher_user_id = auth.uid()
     and end_date is null;
$$;

revoke execute on function public.teacher_active_classroom_ids() from public;
grant  execute on function public.teacher_active_classroom_ids()
       to authenticated, anon, service_role;

-- Rewrite every 0008 policy that traversed classroom_teacher_assignments to
-- call the helper instead. "teacher reads own assignments" (on
-- classroom_teacher_assignments itself) and "teacher reads own profile" (on
-- users) stay as-is — they're not part of the cycle.

drop policy if exists "teacher reads own classrooms" on classrooms;
create policy "teacher reads own classrooms"
  on classrooms
  for select
  using (id in (select public.teacher_active_classroom_ids()));

drop policy if exists "teacher reads classroom curricula" on curricula;
create policy "teacher reads classroom curricula"
  on curricula
  for select
  using (
    id in (
      select curriculum_id from public.classrooms
      where curriculum_id is not null
        and id in (select public.teacher_active_classroom_ids())
    )
  );

drop policy if exists "teacher reads classroom topics" on curriculum_topics;
create policy "teacher reads classroom topics"
  on curriculum_topics
  for select
  using (
    curriculum_id in (
      select curriculum_id from public.classrooms
      where curriculum_id is not null
        and id in (select public.teacher_active_classroom_ids())
    )
  );

drop policy if exists "teacher reads classroom subtopics" on curriculum_subtopics;
create policy "teacher reads classroom subtopics"
  on curriculum_subtopics
  for select
  using (
    topic_id in (
      select id from public.curriculum_topics
      where curriculum_id in (
        select curriculum_id from public.classrooms
        where curriculum_id is not null
          and id in (select public.teacher_active_classroom_ids())
      )
    )
  );

drop policy if exists "teacher reads enrolled students" on students;
create policy "teacher reads enrolled students"
  on students
  for select
  using (
    id in (
      select student_id from public.student_classroom_enrollments
      where end_date is null
        and classroom_id in (select public.teacher_active_classroom_ids())
    )
  );

drop policy if exists "teacher reads classroom enrollments" on student_classroom_enrollments;
create policy "teacher reads classroom enrollments"
  on student_classroom_enrollments
  for select
  using (classroom_id in (select public.teacher_active_classroom_ids()));

drop policy if exists "teacher reads classroom student_guardians" on student_guardians;
create policy "teacher reads classroom student_guardians"
  on student_guardians
  for select
  using (
    student_id in (
      select student_id from public.student_classroom_enrollments
      where end_date is null
        and classroom_id in (select public.teacher_active_classroom_ids())
    )
  );
