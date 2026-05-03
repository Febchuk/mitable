-- Phase 6 follow-up: curriculum_events table.
--
-- The Activity tab needs a unified feed of teacher events about a child:
--   * whole-child events  → existing whole_child_observations (axis notes)
--   * curriculum events   → THIS new table (subtopic notes / status moves)
--
-- curriculum_events captures any teacher entry about a subtopic — whether
-- it's just a comment ("returned to brown stair three times this week") or
-- a status transition ("first presentation, ordered them by length →
-- Introduced"). When transition_to_status is set, the route handler also
-- updates student_progress + writes a student_progress_history row, so
-- the existing projection stays the source of truth for "current state".
-- The events table is purely the append-only log for the activity feed.
--
-- RLS shape mirrors whole_child_observations exactly.

create table public.curriculum_events (
  id                     uuid primary key default gen_random_uuid(),
  student_id             uuid not null references public.students(id),
  subtopic_id            uuid not null references public.curriculum_subtopics(id),
  comment                text not null,
  transition_to_status   text check (transition_to_status in ('introduced', 'practicing', 'mastered')),
  author_user_id         uuid not null references public.users(id),
  created_at             timestamptz not null default now()
);

create index curriculum_events_student_created_idx
  on public.curriculum_events(student_id, created_at desc);
create index curriculum_events_student_subtopic_idx
  on public.curriculum_events(student_id, subtopic_id, created_at desc);

alter table public.curriculum_events enable row level security;

create policy "teacher rw curriculum_events" on public.curriculum_events
  for all
  using (student_id in (select public.teacher_visible_student_ids()))
  with check (student_id in (select public.teacher_visible_student_ids()));

create policy "admin rw curriculum_events" on public.curriculum_events
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

create policy "guardian read curriculum_events" on public.curriculum_events
  for select
  using (student_id in (select public.guardian_visible_student_ids()));
