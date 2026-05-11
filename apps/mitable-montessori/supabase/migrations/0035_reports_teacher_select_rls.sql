-- =============================================================================
-- 0035 — Teachers could not SELECT reports under RLS
--
-- "scoped read reports" (0018) only allowed student_id in school_student_ids(),
-- i.e. students whose school_id matches public.users.school_id for auth.uid().
-- Many teacher accounts have school_id unset on users (0008 documents this);
-- they still see curriculum_events / whole_child_observations via
-- teacher_visible_student_ids(). Align reports SELECT with the same pattern.
-- =============================================================================

drop policy if exists "scoped read reports" on reports;

create policy "teacher read reports" on reports
  for select
  using (student_id in (select public.teacher_visible_student_ids()));

create policy "admin read reports" on reports
  for select
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );
