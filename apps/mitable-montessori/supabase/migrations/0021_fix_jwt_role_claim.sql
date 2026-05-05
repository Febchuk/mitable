-- ============================================================================
-- 0021: Stop overwriting the standard JWT `role` claim
-- ============================================================================
--
-- Problem: 0004_jwt_claims.sql's custom_access_token_hook overwrites the
-- standard `role` claim with the user's app role ("admin" / "teacher").
-- PostgREST reads the `role` claim to call `SET ROLE` on Postgres before
-- running queries — and Postgres has no role named "teacher" (only the
-- standard `anon`, `authenticated`, `service_role`). With the legacy HS256
-- key system this somehow worked; with the new ES256 publishable+secret
-- keys it triggers `role "teacher" does not exist` (SQLSTATE 22023) on
-- every authenticated SELECT.
--
-- Fix: make the hook write `user_role` instead of `role`. Then drop every
-- RLS policy that read `auth.jwt() ->> 'role' = 'admin'` and recreate it
-- using public.current_user_is_admin() — which queries public.users
-- directly (already SECURITY DEFINER, doesn't depend on JWT claim shape).
--
-- This eliminates the entire class of "JWT claim drift breaks RLS" issues.

-- ----------------------------------------------------------------------------
-- 1. Replace the access-token hook
-- ----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id   uuid;
  v_school_id uuid;
  v_role      text;
  claims      jsonb;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  claims    := event -> 'claims';

  select school_id, role
    into v_school_id, v_role
    from public.users
   where id = v_user_id;

  if v_school_id is not null then
    claims := jsonb_set(claims, '{school_id}', to_jsonb(v_school_id::text));
  end if;
  -- IMPORTANT: write to `user_role`, NOT `role`. Postgres / PostgREST
  -- reserve `role` for the DB role used by SET ROLE.
  if v_role is not null then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Recreate every admin policy that previously checked the JWT `role`
-- ----------------------------------------------------------------------------
-- Strategy: drop the policy by name then recreate using
-- public.current_user_is_admin(). Where the policy also constrained on
-- school_id via `auth.jwt() ->> 'school_id'`, we keep that constraint
-- (the school_id claim is unaffected — only `role` was the problem).
-- For school_id we now use public.current_user_school_id() helper to
-- match the established pattern from migration 0011.

-- 0002 policies ---------------------------------------------------------------
drop policy if exists "admins read audit" on audit_log;
create policy "admins read audit" on audit_log
  for select using (
    public.current_user_school_id() is not null
    and public.current_user_is_admin()
  );

drop policy if exists "admins write students" on students;
create policy "admins write students" on students
  for all using (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  ) with check (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  );

drop policy if exists "admins write classrooms" on classrooms;
create policy "admins write classrooms" on classrooms
  for all using (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  ) with check (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  );

drop policy if exists "admins write classroom_teachers" on classroom_teacher_assignments;
create policy "admins write classroom_teachers" on classroom_teacher_assignments
  for all using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "admins write enrollments" on student_classroom_enrollments;
create policy "admins write enrollments" on student_classroom_enrollments
  for all using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "admins write guardians" on guardians;
create policy "admins write guardians" on guardians
  for all using (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  ) with check (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  );

drop policy if exists "admins write curricula" on curricula;
create policy "admins write curricula" on curricula
  for all using (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  ) with check (
    school_id = public.current_user_school_id()
    and public.current_user_is_admin()
  );

drop policy if exists "admins write topics" on curriculum_topics;
create policy "admins write topics" on curriculum_topics
  for all using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "admins write subtopics" on curriculum_subtopics;
create policy "admins write subtopics" on curriculum_subtopics
  for all using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- 0006 admin_rls policies (note: 0011 already replaced some of these with
-- helper-based versions; the drops are idempotent so safe to drop+recreate)
drop policy if exists "admins write users" on users;
create policy "admins write users" on users
  for all using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  ) with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

drop policy if exists "admins read audit_log" on audit_log;
create policy "admins read audit_log" on audit_log
  for select using (
    public.current_user_is_admin()
    and actor_id in (
      select id from public.users where school_id = public.current_user_school_id()
    )
  );

-- 0007 guardian_invitations — note: this table has no direct school_id;
-- scope through invited_by_user_id joined to users.school_id.
drop policy if exists "admins write invitations" on guardian_invitations;
create policy "admins write invitations" on guardian_invitations
  for all using (
    public.current_user_is_admin()
    and invited_by_user_id in (
      select id from public.users where school_id = public.current_user_school_id()
    )
  ) with check (
    public.current_user_is_admin()
    and invited_by_user_id in (
      select id from public.users where school_id = public.current_user_school_id()
    )
  );

-- 0017 report_templates
drop policy if exists report_templates_admin_insert on report_templates;
create policy report_templates_admin_insert on report_templates
  for insert
  with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

drop policy if exists report_templates_admin_update on report_templates;
create policy report_templates_admin_update on report_templates
  for update
  using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  )
  with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

drop policy if exists report_templates_admin_delete on report_templates;
create policy report_templates_admin_delete on report_templates
  for delete
  using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

-- 0019 / 0020 teacher_invitations (0020 superseded 0019; drop both names)
drop policy if exists "admins write teacher invitations" on teacher_invitations;
drop policy if exists "admins read teacher invitations" on teacher_invitations;
drop policy if exists "admins insert teacher invitations" on teacher_invitations;
drop policy if exists "admins update teacher invitations" on teacher_invitations;
drop policy if exists "admins delete teacher invitations" on teacher_invitations;

create policy "admins read teacher invitations" on teacher_invitations
  for select using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

create policy "admins insert teacher invitations" on teacher_invitations
  for insert
  with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

create policy "admins update teacher invitations" on teacher_invitations
  for update
  using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  )
  with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

create policy "admins delete teacher invitations" on teacher_invitations
  for delete
  using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );
