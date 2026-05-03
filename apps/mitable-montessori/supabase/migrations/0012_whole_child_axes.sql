-- Phase 6: whole-child assessment data model.
--
-- Three new tables back the Child Detail "Whole child" tab:
--   * axes — global per-school catalog of developmental dimensions
--     (Concentration, Self-Correction, etc.). 7 rows seeded per school.
--   * axis_assessments — current level per (student, axis). Append-only
--     versioning via ended_at: a new assessment supersedes the old one,
--     which gets ended_at set. Only one active row per (student, axis).
--   * whole_child_observations — teacher notes that move (or confirm) an
--     axis. from_level/to_level are nullable; both null = "confirms current".
--     source_observation_id optionally links back to the curriculum-side
--     observation (a row in commands) that prompted the note.
--
-- All three follow the same RLS shape as student_progress / commands:
--   * teachers read+write within their classrooms via teacher_visible_student_ids()
--   * admins read+write within their school via school_student_ids()
--   * guardians read for their linked children via guardian_visible_student_ids()
--   * axes (no student_id) is read by anyone in the school, written by admins.

-- ============================================================
-- 1. axes — global catalog
-- ============================================================
create table public.axes (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id),
  key           text not null,
  label         text not null,
  descriptors   jsonb not null,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (school_id, key)
);

create index axes_school_idx on public.axes(school_id) where is_active = true;

alter table public.axes enable row level security;

create policy "all in school read axes" on public.axes
  for select
  using (school_id = public.current_user_school_id());

create policy "admins write axes" on public.axes
  for all
  using (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  )
  with check (
    public.current_user_is_admin()
    and school_id = public.current_user_school_id()
  );

-- ============================================================
-- 2. axis_assessments — current + historical level per (student, axis)
-- ============================================================
create table public.axis_assessments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id),
  axis_key      text not null,
  level         text not null check (level in ('Emerging', 'Practicing', 'Deepening', 'Leading')),
  assessed_at   timestamptz not null default now(),
  ended_at      timestamptz,
  -- Set after section 3 creates whole_child_observations.
  source_observation_id uuid,
  author_user_id uuid references public.users(id),
  created_at    timestamptz not null default now()
);

-- Only one active assessment per (student, axis_key)
create unique index axis_assessments_active_uniq
  on public.axis_assessments(student_id, axis_key)
  where ended_at is null;

create index axis_assessments_student_idx on public.axis_assessments(student_id);

alter table public.axis_assessments enable row level security;

create policy "teacher rw axis_assessments" on public.axis_assessments
  for all
  using (student_id in (select public.teacher_visible_student_ids()))
  with check (student_id in (select public.teacher_visible_student_ids()));

create policy "admin rw axis_assessments" on public.axis_assessments
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

create policy "guardian read axis_assessments" on public.axis_assessments
  for select
  using (student_id in (select public.guardian_visible_student_ids()));

-- ============================================================
-- 3. whole_child_observations — teacher notes that shape the assessment
-- ============================================================
create table public.whole_child_observations (
  id                     uuid primary key default gen_random_uuid(),
  student_id             uuid not null references public.students(id),
  axis_key               text not null,
  from_level             text check (from_level in ('Emerging', 'Practicing', 'Deepening', 'Leading')),
  to_level               text check (to_level in ('Emerging', 'Practicing', 'Deepening', 'Leading')),
  note                   text not null,
  source_observation_id  uuid references public.commands(id),
  author_user_id         uuid not null references public.users(id),
  created_at             timestamptz not null default now()
);

-- A note that moves a level must specify both ends; a "confirming" note has both null.
alter table public.whole_child_observations
  add constraint whole_child_obs_levels_both_or_neither
  check (
    (from_level is null and to_level is null)
    or (from_level is not null and to_level is not null)
  );

create index wco_student_created_idx on public.whole_child_observations(student_id, created_at desc);
create index wco_axis_idx on public.whole_child_observations(student_id, axis_key, created_at desc);

alter table public.whole_child_observations enable row level security;

create policy "teacher rw whole_child_observations" on public.whole_child_observations
  for all
  using (student_id in (select public.teacher_visible_student_ids()))
  with check (student_id in (select public.teacher_visible_student_ids()));

create policy "admin rw whole_child_observations" on public.whole_child_observations
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

create policy "guardian read whole_child_observations" on public.whole_child_observations
  for select
  using (student_id in (select public.guardian_visible_student_ids()));

-- Now that whole_child_observations exists, attach the FK from axis_assessments.
alter table public.axis_assessments
  add constraint axis_assessments_source_obs_fk
  foreign key (source_observation_id)
  references public.whole_child_observations(id)
  on delete set null;

-- ============================================================
-- 4. Seed the 7 axes for every existing school
-- ============================================================
insert into public.axes (school_id, key, label, descriptors, sort_order)
select
  s.id,
  axis.key,
  axis.label,
  axis.descriptors::jsonb,
  axis.sort_order
from public.schools s
cross join (values
  ('concentration', 'Concentration', 0, '{
    "Emerging":"Brief, needs adult to redirect.",
    "Practicing":"Sustained on familiar work; some resets after distraction.",
    "Deepening":"Holds focus through full work cycle, resists interruption.",
    "Leading":"Returns to a chosen work over days; protects own focus."
  }'),
  ('material-progression', 'Material Progression', 1, '{
    "Emerging":"Repeats first presentation; new materials feel uncertain.",
    "Practicing":"Moves through familiar shelf at her own pace.",
    "Deepening":"Builds on prior work; seeks logical next step.",
    "Leading":"Bridges areas — uses Sensorial to inform Math choices."
  }'),
  ('self-correction', 'Self-Correction', 2, '{
    "Emerging":"Notices error only when adult points it out.",
    "Practicing":"Catches obvious mismatches; sometimes asks for help.",
    "Deepening":"Finds and fixes error in same work cycle.",
    "Leading":"Uses material''s own control of error fluently; explains it."
  }'),
  ('independence', 'Independence', 3, '{
    "Emerging":"Looks to adult for each step.",
    "Practicing":"Sets up familiar work; returns it to the shelf.",
    "Deepening":"Chooses, completes, and restores work without prompting.",
    "Leading":"Helps a younger child set up their own work."
  }'),
  ('choice-quality', 'Choice Quality', 4, '{
    "Emerging":"Chooses by proximity or peer; abandons quickly.",
    "Practicing":"Picks work she knows well; occasional stretch choice.",
    "Deepening":"Chooses with intent — names goal before starting.",
    "Leading":"Plans a work cycle across multiple materials."
  }'),
  ('error-resilience', 'Error Resilience', 5, '{
    "Emerging":"Frustrated by mistakes; may abandon the work.",
    "Practicing":"Tries again with encouragement.",
    "Deepening":"Retries unprompted; treats error as information.",
    "Leading":"Welcomes hard work; chooses materials at the edge of skill."
  }'),
  ('motivation', 'Motivation', 6, '{
    "Emerging":"Works when adult invites; rarely initiates.",
    "Practicing":"Initiates work she enjoys; flat on stretch tasks.",
    "Deepening":"Initiates broadly; curious about new presentations.",
    "Leading":"Articulates own goals; pursues work across days."
  }')
) as axis(key, label, sort_order, descriptors)
on conflict (school_id, key) do nothing;
