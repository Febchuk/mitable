-- Introduce curriculum subjects between curricula and topics.
-- Backfills a synthetic "General" subject per curriculum so existing topics retain
-- a non-null subject_id, then tightens the column to NOT NULL.

-- =============================================================================
-- 1. Table
-- =============================================================================

create table curriculum_subjects (
  id             uuid primary key default gen_random_uuid(),
  curriculum_id  uuid not null references curricula(id) on delete cascade,
  name           text not null,
  sort_order     int  not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index curriculum_subjects_curriculum_idx
  on curriculum_subjects (curriculum_id, sort_order);

-- =============================================================================
-- 2. FK column on topics (nullable while we backfill)
-- =============================================================================

alter table curriculum_topics
  add column subject_id uuid references curriculum_subjects(id);

-- =============================================================================
-- 3. Backfill: one "General" subject per curriculum, link existing topics to it
-- =============================================================================

with inserted as (
  insert into curriculum_subjects (curriculum_id, name, sort_order)
  select id, 'General', 0 from curricula
  returning id, curriculum_id
)
update curriculum_topics t
set subject_id = i.id
from inserted i
where t.curriculum_id = i.curriculum_id
  and t.subject_id is null;

-- =============================================================================
-- 4. Tighten: subject_id is required going forward
-- =============================================================================

alter table curriculum_topics
  alter column subject_id set not null;

create index curriculum_topics_subject_idx
  on curriculum_topics (subject_id, sort_order);

-- =============================================================================
-- 5. RLS — mirror curriculum_topics policies
-- =============================================================================

alter table curriculum_subjects enable row level security;

create policy "scoped read curriculum_subjects" on curriculum_subjects
  for select using (
    curriculum_id in (
      select id from curricula where school_id = (auth.jwt() ->> 'school_id')::uuid
    )
  );

create policy "admins write subjects" on curriculum_subjects
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');
