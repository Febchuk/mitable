-- =============================================================================
-- 0040 — Classroom student groups ("teams" within a classroom)
-- =============================================================================
--
-- Lets an admin split a single classroom's roster into named, colored groups
-- (e.g. Red / Blue / Yellow team). Teachers can then filter the Progress grid
-- to one group at a time instead of always seeing the whole class.
--
-- Model: a child belongs to at most one group within a given classroom. Groups
-- are admin-authored config; teachers only read them. The membership table
-- denormalizes classroom_id so the one-group-per-child rule and the RLS checks
-- can both key on it directly (same shape as student_classroom_enrollments).

-- 1. Groups -------------------------------------------------------------------
create table public.classroom_groups (
  id           uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  name         text not null,
  -- Design-token key (terracotta | sage | butter | blue | clay). Kept as text
  -- so the palette can grow without a migration; the app validates the value.
  color        text not null default 'terracotta',
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Case-insensitive unique group name within a classroom.
create unique index classroom_groups_name_unique
  on public.classroom_groups (classroom_id, lower(name));

create index classroom_groups_classroom_idx
  on public.classroom_groups (classroom_id, sort_order);

create trigger classroom_groups_set_updated_at
  before update on public.classroom_groups
  for each row execute function public.tg_iep_set_updated_at();

-- 2. Membership ---------------------------------------------------------------
create table public.classroom_group_members (
  id           uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  group_id     uuid not null references public.classroom_groups(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- One group per child per classroom.
create unique index classroom_group_members_one_per_classroom
  on public.classroom_group_members (classroom_id, student_id);

create index classroom_group_members_group_idx
  on public.classroom_group_members (group_id);

-- 3. RLS ----------------------------------------------------------------------
-- Same pattern as classroom_teacher_assignments / speech_targets: teachers read
-- within their actively-assigned classrooms; admins have full CRUD within their
-- school. All cross-table checks route through the SECURITY DEFINER helpers
-- introduced in 0009/0010/0011 so the policy graph stays acyclic.

alter table public.classroom_groups        enable row level security;
alter table public.classroom_group_members enable row level security;

create policy "teacher read classroom_groups" on public.classroom_groups
  for select
  using (classroom_id in (select public.teacher_active_classroom_ids()));

create policy "admin rw classroom_groups" on public.classroom_groups
  for all
  using (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  )
  with check (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  );

create policy "teacher read classroom_group_members" on public.classroom_group_members
  for select
  using (classroom_id in (select public.teacher_active_classroom_ids()));

create policy "admin rw classroom_group_members" on public.classroom_group_members
  for all
  using (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  )
  with check (
    public.current_user_is_admin()
    and classroom_id in (select public.school_classroom_ids())
  );
