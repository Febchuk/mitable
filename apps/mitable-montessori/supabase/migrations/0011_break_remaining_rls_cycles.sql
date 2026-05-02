-- Phase 4/5 follow-up #3: break the remaining RLS cycles by routing every
-- cross-table sub-select through SECURITY DEFINER helpers.
--
-- After 0009 + 0010 fixed two cycles each, pullSync still 500s because
-- Postgres evaluates ALL policies on a table per row — including ones
-- that wouldn't apply to the current role. The remaining cycle:
--
--   0002 "guardians see linked students" on students
--     sub-selects student_guardians
--   0006 "admins write student_guardians" on student_guardians
--     sub-selects students
--
-- Even when a teacher reads students, Postgres parses both predicates and
-- detects the loop. Same fix as 0009/0010: hide the cross-table read inside
-- a SECURITY DEFINER function so the policy walker doesn't recurse.
--
-- We also re-route the admin and guardian policies that traverse other
-- tables, so the policy graph becomes acyclic by construction.

-- ============================================================
-- 1. SECURITY DEFINER helpers
-- ============================================================

-- Returns the school_id of the current auth user from public.users.
-- Used by admin policies that previously inlined a school_id sub-select
-- against the JWT claim — the function works even when the JWT lacks the
-- school_id claim (custom_access_token_hook not registered).
create or replace function public.current_user_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select school_id from public.users where id = auth.uid();
$$;

-- Returns true if the current auth user is an admin (per public.users).
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role from public.users where id = auth.uid()) = 'admin', false);
$$;

-- Returns the guardian_id linked to the current auth user, or null.
create or replace function public.current_guardian_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.guardians where auth_user_id = auth.uid();
$$;

-- Returns the student_ids linked to the current guardian session.
create or replace function public.guardian_visible_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select student_id
    from public.student_guardians
   where guardian_id = public.current_guardian_id();
$$;

-- Returns the student_ids the current guardian receives reports for
-- (subset of guardian_visible_student_ids() with receives_reports = true).
create or replace function public.guardian_report_visible_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select student_id
    from public.student_guardians
   where guardian_id = public.current_guardian_id()
     and receives_reports = true;
$$;

revoke execute on function public.current_user_school_id() from public;
grant  execute on function public.current_user_school_id()
       to authenticated, anon, service_role;
revoke execute on function public.current_user_is_admin() from public;
grant  execute on function public.current_user_is_admin()
       to authenticated, anon, service_role;
revoke execute on function public.current_guardian_id() from public;
grant  execute on function public.current_guardian_id()
       to authenticated, anon, service_role;
revoke execute on function public.guardian_visible_student_ids() from public;
grant  execute on function public.guardian_visible_student_ids()
       to authenticated, anon, service_role;
revoke execute on function public.guardian_report_visible_student_ids() from public;
grant  execute on function public.guardian_report_visible_student_ids()
       to authenticated, anon, service_role;

-- ============================================================
-- 2. Replace recursion-prone policies
-- ============================================================

-- 2a. Guardian-side reads on students go through guardian_visible_student_ids().
drop policy if exists "guardians see linked students" on students;
create policy "guardians see linked students" on students
  for select
  using (id in (select public.guardian_visible_student_ids()));

-- 2b. Admin policies on student_guardians + student_classroom_enrollments
-- key on auth.uid() via current_user_is_admin() + current_user_school_id()
-- instead of inlining a sub-select into students/classrooms.
drop policy if exists "admins write student_guardians" on student_guardians;
create policy "admins write student_guardians" on student_guardians
  for all
  using (
    public.current_user_is_admin()
    and student_id in (
      select id from public.students
      where school_id = public.current_user_school_id()
    )
  )
  with check (
    public.current_user_is_admin()
    and student_id in (
      select id from public.students
      where school_id = public.current_user_school_id()
    )
  );

-- The above still references students. To make the sub-select inside the
-- admin policy not trigger the students RLS recursion, wrap it in another
-- helper that bypasses RLS.
create or replace function public.school_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.students
  where school_id = public.current_user_school_id();
$$;
revoke execute on function public.school_student_ids() from public;
grant  execute on function public.school_student_ids()
       to authenticated, anon, service_role;

drop policy if exists "admins write student_guardians" on student_guardians;
create policy "admins write student_guardians" on student_guardians
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

-- Likewise for admins write enrollments — sub-select on classrooms wrapped
-- in a helper.
create or replace function public.school_classroom_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.classrooms
  where school_id = public.current_user_school_id();
$$;
revoke execute on function public.school_classroom_ids() from public;
grant  execute on function public.school_classroom_ids()
       to authenticated, anon, service_role;

drop policy if exists "admins write student_classroom_enrollments" on student_classroom_enrollments;
create policy "admins write student_classroom_enrollments" on student_classroom_enrollments
  for all
  using (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  )
  with check (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  );

-- 2c. Same treatment for the guardian-side attendance + progress + sent
-- report policies from 0007. They sub-select student_guardians; route
-- through guardian_visible_student_ids() / guardian_report_visible_student_ids().
drop policy if exists "guardians see linked attendance" on attendance_records;
create policy "guardians see linked attendance" on attendance_records
  for select
  using (student_id in (select public.guardian_visible_student_ids()));

drop policy if exists "guardians see linked progress" on student_progress;
create policy "guardians see linked progress" on student_progress
  for select
  using (student_id in (select public.guardian_visible_student_ids()));

drop policy if exists "guardians see sent reports v2" on reports;
create policy "guardians see sent reports v2" on reports
  for select
  using (
    status = 'sent'
    and student_id in (select public.guardian_report_visible_student_ids())
  );

-- 2d. The 0005 fix already reshaped student_guardians SELECT to key on
-- guardians.school_id, so it's flat. Keep it; nothing to do here.

-- 2e. Also reshape the admin curriculum policies from 0006 so they don't
-- chain through curricula → curriculum_topics → curriculum_subtopics.
-- Each policy now keys on current_user_is_admin() + a flat school_id check
-- via helpers.
create or replace function public.school_curriculum_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.curricula
  where school_id = public.current_user_school_id();
$$;
revoke execute on function public.school_curriculum_ids() from public;
grant  execute on function public.school_curriculum_ids()
       to authenticated, anon, service_role;

create or replace function public.school_topic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.curriculum_topics
  where curriculum_id in (select public.school_curriculum_ids());
$$;
revoke execute on function public.school_topic_ids() from public;
grant  execute on function public.school_topic_ids()
       to authenticated, anon, service_role;

drop policy if exists "admins write curriculum_topics" on curriculum_topics;
create policy "admins write curriculum_topics" on curriculum_topics
  for all
  using (
    public.current_user_is_admin()
    and curriculum_id in (select public.school_curriculum_ids())
  )
  with check (
    public.current_user_is_admin()
    and curriculum_id in (select public.school_curriculum_ids())
  );

drop policy if exists "admins write curriculum_subtopics" on curriculum_subtopics;
create policy "admins write curriculum_subtopics" on curriculum_subtopics
  for all
  using (
    public.current_user_is_admin()
    and topic_id in (select public.school_topic_ids())
  )
  with check (
    public.current_user_is_admin()
    and topic_id in (select public.school_topic_ids())
  );

-- 2f. Same for classroom_teacher_assignments admin write — was keyed only
-- on role, but routed through classrooms by 0006. Make it flat.
drop policy if exists "admins write classroom_teacher_assignments" on classroom_teacher_assignments;
create policy "admins write classroom_teacher_assignments" on classroom_teacher_assignments
  for all
  using (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  )
  with check (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  );
