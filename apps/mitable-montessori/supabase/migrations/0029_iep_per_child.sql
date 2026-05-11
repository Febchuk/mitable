-- =============================================================================
-- 0029 — Per-child IEP plan + state + comments
--
-- Mirrors the curriculum mental model (subject → topic → subtopic) but
-- per-child instead of per-class:
--
--   iep_domains (per child)
--     └── iep_items (per child, under one domain)
--           ├── iep_item_states  (1:1, current rating/completion/prompt)
--           └── iep_comments     (1:N, newest-first thread)
--
-- Field set is fixed for v1 — every item carries rating/completion/prompt.
-- Items live on the child, not on a school-wide library, because IEPs are
-- inherently individualised. Soft-delete via `archived_at` so old comments
-- and state keep referencing the original row.
-- =============================================================================

-- ---------- iep_domains ----------------------------------------------------
create table public.iep_domains (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  name         text not null,
  position     int not null default 0,
  archived_at  timestamptz,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index iep_domains_student_idx
  on public.iep_domains (student_id, position)
  where archived_at is null;

-- ---------- iep_items -------------------------------------------------------
create table public.iep_items (
  id           uuid primary key default gen_random_uuid(),
  domain_id    uuid not null references public.iep_domains(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  name         text not null,
  position     int not null default 0,
  archived_at  timestamptz,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index iep_items_domain_idx
  on public.iep_items (domain_id, position)
  where archived_at is null;
create index iep_items_student_idx on public.iep_items (student_id);

-- ---------- iep_item_states (1:1 with iep_items) ---------------------------
-- student_id is denormalised so RLS can use teacher_visible_student_ids() /
-- school_student_ids() helpers directly without a join.
create table public.iep_item_states (
  item_id          uuid primary key references public.iep_items(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  rating           smallint check (rating is null or rating between 1 and 5),
  success_count    smallint check (success_count is null or success_count between 0 and 10),
  prompting_code   text check (prompting_code is null or prompting_code in ('N','G','V','H','F')),
  updated_by       uuid references public.users(id),
  updated_at       timestamptz not null default now()
);

create index iep_item_states_student_idx on public.iep_item_states (student_id);

-- ---------- iep_comments (1:N under iep_items) -----------------------------
create table public.iep_comments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.iep_items(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  body        text not null,
  author_id   uuid references public.users(id),
  created_at  timestamptz not null default now()
);

create index iep_comments_item_idx on public.iep_comments (item_id, created_at desc);
create index iep_comments_student_idx on public.iep_comments (student_id, created_at desc);

-- ---------- updated_at triggers --------------------------------------------
create or replace function public.tg_iep_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger iep_domains_set_updated_at
  before update on public.iep_domains
  for each row execute function public.tg_iep_set_updated_at();
create trigger iep_items_set_updated_at
  before update on public.iep_items
  for each row execute function public.tg_iep_set_updated_at();

-- =============================================================================
-- RLS — same pattern as axis_assessments / whole_child_observations:
--   teachers rw within their classrooms via teacher_visible_student_ids()
--   admins   rw within school via school_student_ids() + admin check
-- =============================================================================

alter table public.iep_domains enable row level security;
alter table public.iep_items enable row level security;
alter table public.iep_item_states enable row level security;
alter table public.iep_comments enable row level security;

-- iep_domains: school-scoped, plus admin-only writes (admins author the plan).
create policy "teacher read iep_domains" on public.iep_domains
  for select
  using (student_id in (select public.teacher_visible_student_ids()));
create policy "admin rw iep_domains" on public.iep_domains
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

-- iep_items: same shape as iep_domains (admin-managed structure).
create policy "teacher read iep_items" on public.iep_items
  for select
  using (student_id in (select public.teacher_visible_student_ids()));
create policy "admin rw iep_items" on public.iep_items
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

-- iep_item_states + iep_comments: teachers can read AND write — they capture
-- progress in the field. Admins can also write within their school.
create policy "teacher rw iep_item_states" on public.iep_item_states
  for all
  using (student_id in (select public.teacher_visible_student_ids()))
  with check (student_id in (select public.teacher_visible_student_ids()));
create policy "admin rw iep_item_states" on public.iep_item_states
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );

create policy "teacher rw iep_comments" on public.iep_comments
  for all
  using (student_id in (select public.teacher_visible_student_ids()))
  with check (student_id in (select public.teacher_visible_student_ids()));
create policy "admin rw iep_comments" on public.iep_comments
  for all
  using (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  )
  with check (
    public.current_user_is_admin()
    and student_id in (select public.school_student_ids())
  );
