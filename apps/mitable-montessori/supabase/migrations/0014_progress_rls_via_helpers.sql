-- Phase 6 follow-up: rewrite the SELECT policies on student_progress and
-- student_progress_history so they don't depend on the `school_id` JWT
-- claim, matching the pattern used by curriculum_events,
-- whole_child_observations, and axis_assessments.
--
-- The original policies in 0002 inline `(auth.jwt() ->> 'school_id')::uuid`,
-- which silently filters every row to zero when the JWT hook isn't
-- registered. Symptom: the Child Detail "Curriculum" tab shows empty
-- state even though seed inserts 12 progress rows per child.
--
-- Replacement uses the SECURITY DEFINER helpers from 0010/0011, same as
-- every other student-scoped table.

drop policy if exists "scoped read progress" on public.student_progress;
create policy "teacher read progress" on public.student_progress
  for select
  using (student_id in (select public.teacher_visible_student_ids()));
create policy "admin read progress" on public.student_progress
  for select
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );
create policy "guardian read progress (via helper)" on public.student_progress
  for select
  using (student_id in (select public.guardian_visible_student_ids()));

drop policy if exists "scoped read progress_history" on public.student_progress_history;
create policy "teacher read progress_history" on public.student_progress_history
  for select
  using (student_id in (select public.teacher_visible_student_ids()));
create policy "admin read progress_history" on public.student_progress_history
  for select
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );
create policy "guardian read progress_history (via helper)" on public.student_progress_history
  for select
  using (student_id in (select public.guardian_visible_student_ids()));
