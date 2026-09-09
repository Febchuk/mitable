-- Add an explicit "Not applicable" (N/A) progress status.
--
-- Background: a blank/unmarked subtopic already resolves to 'na' ("Not started"),
-- which teachers said reads as if the subtopic was *missed*. 'not_applicable' is a
-- distinct value teachers can deliberately set so it no longer looks skipped.
--
-- This is additive and reversible — a plain CHECK constraint (not a Postgres enum
-- type), so a later migration can simply drop 'not_applicable' from the list.

alter table public.student_progress
  drop constraint if exists student_progress_status_check;

alter table public.student_progress
  add constraint student_progress_status_check
  check (
    status in (
      'introduced',
      'practicing',
      'mastered',
      'none',
      'minimum',
      'satisfactory',
      'good',
      'excellent',
      'na',
      'not_applicable'
    )
  );

-- Keep the curriculum activity log in step, in case a progression event ever
-- records a move to N/A (the progress-grid path itself does not write here).
alter table public.curriculum_events
  drop constraint if exists curriculum_events_transition_to_status_check;

alter table public.curriculum_events
  add constraint curriculum_events_transition_to_status_check
  check (
    transition_to_status in (
      'introduced',
      'practicing',
      'mastered',
      'none',
      'minimum',
      'satisfactory',
      'good',
      'excellent',
      'not_applicable'
    )
  );
