-- =============================================================================
-- 0039 — Speech program: per-student targets + classrooms.program_types
-- =============================================================================

-- Allow "speech" on classrooms (IEP-style secondary program).
alter table public.classrooms
  drop constraint if exists classrooms_program_types_known;

alter table public.classrooms
  add constraint classrooms_program_types_known
  check (
    cardinality(program_types) > 0
    and program_types <@ array['montessori', 'iep', 'speech']::text[]
  );

-- Per-child ordered targets (admin-authored; teachers read for Progress + reports).
create table public.speech_targets (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  label        text not null,
  position     int not null default 0,
  archived_at  timestamptz,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index speech_targets_student_idx
  on public.speech_targets (student_id, position)
  where archived_at is null;

create index speech_targets_school_idx
  on public.speech_targets (school_id)
  where archived_at is null;

create trigger speech_targets_set_updated_at
  before update on public.speech_targets
  for each row execute function public.tg_iep_set_updated_at();

alter table public.speech_targets enable row level security;

-- Teachers: read targets for visible students. Admins: full CRUD within school.
create policy "teacher read speech_targets" on public.speech_targets
  for select
  using (student_id in (select public.teacher_visible_student_ids()));

create policy "admin rw speech_targets" on public.speech_targets
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );
