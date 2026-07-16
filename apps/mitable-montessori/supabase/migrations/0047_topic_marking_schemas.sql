alter table public.curriculum_topics
  add column if not exists marking_schema text not null default 'ipm'
  check (marking_schema in ('ipm', 'five_level'));

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
      'na'
    )
  );

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
      'excellent'
    )
  );

comment on column public.curriculum_topics.marking_schema is
  'Progress scale used by every subtopic in this topic: ipm or five_level.';
