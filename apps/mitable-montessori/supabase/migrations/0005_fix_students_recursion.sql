-- Fixes "infinite recursion detected in policy for relation \"students\""
--
-- The recursion comes from two SELECT policies on `students`:
--   1. "scoped read students"          — direct school_id check (fine).
--   2. "guardians see linked students" — sub-selects from student_guardians,
--      whose own SELECT policy sub-selects from students, looping forever.
--
-- Fix: scope `student_guardians` via `guardians.school_id` (a flat,
-- non-recursive policy) rather than via `students.school_id`. That removes
-- the cycle without weakening the school-scoping invariant.

drop policy if exists "scoped read student_guardians" on student_guardians;

create policy "scoped read student_guardians" on student_guardians
  for select using (
    guardian_id in (
      select id from guardians where school_id = (auth.jwt() ->> 'school_id')::uuid
    )
  );
