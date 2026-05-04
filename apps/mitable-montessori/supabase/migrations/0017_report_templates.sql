-- =============================================================================
-- 0017 — Report templates + reports schema extensions for the new-report flow
--
-- 1. New `report_templates` table (school-scoped, admin-managed, teacher-readable)
-- 2. Extend `reports`:
--    - allow report_type='incident' (in addition to daily/major)
--    - sections jsonb: structured sections used by the editor surface
--    - template_id: nullable reference to the template used at creation
-- 3. Seed 5 starter templates per existing school via a function (idempotent).
-- =============================================================================

create table report_templates (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id) on delete cascade,
  name                text not null,
  description         text,
  kind                text not null check (kind in ('Daily', 'Major', 'Incident')),
  sections            text[] not null default '{}',
  icon_tone           text not null default 'clay'
                       check (icon_tone in ('clay', 'butter', 'blue', 'sage')),
  is_active           boolean not null default true,
  created_by_user_id  uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index report_templates_school_active_idx
  on report_templates (school_id, is_active);

-- Trigger: keep updated_at fresh
create or replace function tg_report_templates_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger report_templates_set_updated_at
  before update on report_templates
  for each row execute function tg_report_templates_set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

alter table report_templates enable row level security;

-- Teachers + admins read templates in their school
create policy report_templates_read on report_templates
  for select
  using (school_id::text = auth.jwt() ->> 'school_id');

-- Admins write
create policy report_templates_admin_insert on report_templates
  for insert
  with check (
    school_id::text = auth.jwt() ->> 'school_id'
    and auth.jwt() ->> 'role' = 'admin'
  );
create policy report_templates_admin_update on report_templates
  for update
  using (
    school_id::text = auth.jwt() ->> 'school_id'
    and auth.jwt() ->> 'role' = 'admin'
  )
  with check (
    school_id::text = auth.jwt() ->> 'school_id'
    and auth.jwt() ->> 'role' = 'admin'
  );
create policy report_templates_admin_delete on report_templates
  for delete
  using (
    school_id::text = auth.jwt() ->> 'school_id'
    and auth.jwt() ->> 'role' = 'admin'
  );

-- =============================================================================
-- Extend reports
-- =============================================================================

alter table reports
  drop constraint if exists reports_report_type_check;
alter table reports
  add constraint reports_report_type_check
  check (report_type in ('daily', 'major', 'incident'));

alter table reports
  add column if not exists sections jsonb,
  add column if not exists template_id uuid references report_templates(id);

create index if not exists reports_template_id_idx on reports (template_id);

-- =============================================================================
-- Idempotent seeder for the 5 starter templates per school.
-- Call manually after creating a school, or via the seed.ts script.
-- =============================================================================

create or replace function seed_default_report_templates(p_school_id uuid)
returns void language plpgsql as $$
begin
  insert into report_templates (school_id, name, description, kind, sections, icon_tone)
  values
    (p_school_id, 'Sunflower daily',    'Morning · Language · Math · Afternoon · Social',
     'Daily',    array['Morning','Language','Math','Afternoon','Social'], 'clay'),
    (p_school_id, 'Spring milestone',   'Term summary across areas',
     'Major',    array['Overview','Math','Language','Social','Family note'], 'butter'),
    (p_school_id, 'Incident — minor',   'What happened · Care given · Follow-up',
     'Incident', array['What happened','Care given','Follow-up'], 'blue'),
    (p_school_id, 'First-week intro',   'Settling in · First works · Family questions',
     'Major',    array['Settling in','First works','Family questions'], 'sage'),
    (p_school_id, 'Quick check-in',     'One paragraph · Family-only',
     'Daily',    array['Today'], 'clay')
  on conflict do nothing;
end;
$$;

-- Seed for any schools that already exist.
do $$
declare
  s record;
begin
  for s in select id from schools loop
    perform seed_default_report_templates(s.id);
  end loop;
end $$;
