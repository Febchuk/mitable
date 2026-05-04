-- =============================================================================
-- 0018 — Fix the "infinite recursion in policy for relation reports" error
--
-- The original `scoped read reports` policy from 0002_rls.sql sub-selects
-- from `students`, which (since 0010) is itself RLS-protected by a policy
-- that calls a helper. When a SELECT on `reports` triggers RLS evaluation
-- of the sub-select, the planner re-enters the students policy under
-- conditions that loop. Migrations 0009-0011 fixed the same kind of cycle
-- for students/enrollments/guardians; this one applies the same medicine
-- to reports + report_review_actions + report_recipients.
--
-- Fix: replace the in-policy sub-select with the existing
-- `public.school_student_ids()` helper (security definer, bypasses RLS).
-- =============================================================================

-- ----- reports ------------------------------------------------------------
drop policy if exists "scoped read reports" on reports;
create policy "scoped read reports" on reports
  for select using (
    student_id in (select public.school_student_ids())
  );

-- ----- report_review_actions ----------------------------------------------
drop policy if exists "scoped read review_actions" on report_review_actions;
create policy "scoped read review_actions" on report_review_actions
  for select using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );

-- ----- report_recipients --------------------------------------------------
drop policy if exists "scoped read recipients" on report_recipients;
create policy "scoped read recipients" on report_recipients
  for select using (
    report_id in (
      select r.id from public.reports r
      where r.student_id in (select public.school_student_ids())
    )
  );

-- =============================================================================
-- Writes: teachers + admins need to insert/update/delete reports for students
-- in their school. The original write policies (if any) lived in 0002_rls.sql
-- as part of the same migration, but the new-report flow needs a write path
-- that the existing policies don't necessarily cover (PATCH for save, INSERT
-- for create). Add explicit write policies that key on the same helper.
-- =============================================================================

drop policy if exists "scoped write reports" on reports;
create policy "scoped write reports" on reports
  for all
  to authenticated
  using (student_id in (select public.school_student_ids()))
  with check (student_id in (select public.school_student_ids()));
