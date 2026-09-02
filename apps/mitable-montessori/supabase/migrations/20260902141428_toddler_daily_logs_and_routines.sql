-- Configurable toddler routines and one structured daily log per child/day.
-- Labels are snapshotted in the log so historical reports do not change when
-- an administrator later renames or archives a choice.

create table public.toddler_routine_options (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  category text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint toddler_routine_options_category_check check (
    category in (
      'mood', 'nap', 'participation', 'toileting', 'meal_response',
      'outdoor_response', 'activity', 'material'
    )
  ),
  constraint toddler_routine_options_label_check
    check (length(btrim(label)) between 1 and 120)
);

create unique index toddler_routine_options_school_category_label_uidx
  on public.toddler_routine_options (school_id, category, lower(btrim(label)));
create index toddler_routine_options_school_category_active_idx
  on public.toddler_routine_options (school_id, category, is_active, sort_order, label);

create table public.toddler_daily_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  log_date date not null,
  mood text,
  nap text,
  participation text,
  toileting_entries jsonb not null default '[]'::jsonb,
  feeding_entries jsonb not null default '[]'::jsonb,
  outdoor_play_entries jsonb not null default '[]'::jsonb,
  activity_option_ids uuid[] not null default '{}',
  activity_labels text[] not null default '{}',
  material_option_ids uuid[] not null default '{}',
  material_labels text[] not null default '{}',
  other_notes text,
  teacher_comments text,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint toddler_daily_logs_unique_student_day
    unique (classroom_id, student_id, log_date),
  constraint toddler_daily_logs_mood_check
    check (mood is null or length(mood) <= 120),
  constraint toddler_daily_logs_nap_check
    check (nap is null or length(nap) <= 120),
  constraint toddler_daily_logs_participation_check
    check (participation is null or length(participation) <= 120),
  constraint toddler_daily_logs_toileting_array_check
    check (jsonb_typeof(toileting_entries) = 'array'),
  constraint toddler_daily_logs_feeding_array_check
    check (jsonb_typeof(feeding_entries) = 'array'),
  constraint toddler_daily_logs_outdoor_array_check
    check (jsonb_typeof(outdoor_play_entries) = 'array'),
  constraint toddler_daily_logs_other_notes_check
    check (other_notes is null or length(other_notes) <= 4000),
  constraint toddler_daily_logs_teacher_comments_check
    check (teacher_comments is null or length(teacher_comments) <= 4000),
  constraint toddler_daily_logs_activity_snapshots_check
    check (cardinality(activity_option_ids) = cardinality(activity_labels)),
  constraint toddler_daily_logs_material_snapshots_check
    check (cardinality(material_option_ids) = cardinality(material_labels))
);

create index toddler_daily_logs_school_classroom_date_idx
  on public.toddler_daily_logs (school_id, classroom_id, log_date desc);
create index toddler_daily_logs_student_date_idx
  on public.toddler_daily_logs (student_id, log_date desc);
create index toddler_daily_logs_created_by_user_id_idx
  on public.toddler_daily_logs (created_by_user_id);
create index toddler_daily_logs_updated_by_user_id_idx
  on public.toddler_daily_logs (updated_by_user_id);

create trigger toddler_routine_options_set_updated_at
  before update on public.toddler_routine_options
  for each row execute function public.tg_iep_set_updated_at();
create trigger toddler_daily_logs_set_updated_at
  before update on public.toddler_daily_logs
  for each row execute function public.tg_iep_set_updated_at();

-- Keeps the Toddler-only rule in the database instead of trusting the UI.
create function public.teacher_active_toddler_classroom_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.classroom_id
  from public.classroom_teacher_assignments a
  join public.classrooms c on c.id = a.classroom_id
  where a.teacher_user_id = auth.uid()
    and a.end_date is null
    and c.school_id = public.current_user_school_id()
    and lower(coalesce(c.code, '')) = 'toddler';
$$;

revoke execute on function public.teacher_active_toddler_classroom_ids() from public;
grant execute on function public.teacher_active_toddler_classroom_ids()
  to authenticated, service_role;

alter table public.toddler_routine_options enable row level security;
alter table public.toddler_daily_logs enable row level security;

create policy "toddler routine options school read"
  on public.toddler_routine_options for select to authenticated
  using (school_id = (select public.current_user_school_id()));

create policy "toddler routine options admin insert"
  on public.toddler_routine_options for insert to authenticated
  with check (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  );
create policy "toddler routine options admin update"
  on public.toddler_routine_options for update to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  )
  with check (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  );
create policy "toddler routine options admin delete"
  on public.toddler_routine_options for delete to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  );

create policy "toddler daily logs school read"
  on public.toddler_daily_logs for select to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_toddler_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );
create policy "toddler daily logs teacher insert"
  on public.toddler_daily_logs for insert to authenticated
  with check (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select public.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  );
create policy "toddler daily logs teacher update"
  on public.toddler_daily_logs for update to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select public.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  )
  with check (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select public.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  );
create policy "toddler daily logs teacher delete"
  on public.toddler_daily_logs for delete to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and not (select public.current_user_is_admin())
    and classroom_id in (select public.teacher_active_toddler_classroom_ids())
    and student_id in (select public.teacher_visible_student_ids())
  );

revoke all on table public.toddler_routine_options from anon;
revoke all on table public.toddler_daily_logs from anon;
grant select, insert, update, delete on table public.toddler_routine_options to authenticated;
grant select, insert, update, delete on table public.toddler_daily_logs to authenticated;
grant all on table public.toddler_routine_options to service_role;
grant all on table public.toddler_daily_logs to service_role;

insert into public.toddler_routine_options (school_id, category, label, sort_order)
select s.id, defaults.category, defaults.label, defaults.sort_order
from public.schools s
cross join (values
  ('mood', 'Cheerful', 10),
  ('mood', 'Settled', 20),
  ('mood', 'Tired', 30),
  ('mood', 'Upset', 40),
  ('nap', 'Slept', 10),
  ('nap', 'Slept briefly', 20),
  ('nap', 'Did not sleep', 30),
  ('participation', 'Interactive', 10),
  ('participation', 'Engaged', 20),
  ('participation', 'Quiet', 30),
  ('participation', 'Needed support', 40),
  ('toileting', 'Wee', 10),
  ('toileting', 'Poo', 20),
  ('toileting', 'Dry', 30),
  ('toileting', 'Did not wee', 40),
  ('toileting', 'Did not poo', 50),
  ('meal_response', 'Ate well', 10),
  ('meal_response', 'Ate some', 20),
  ('meal_response', 'Did not eat', 30),
  ('outdoor_response', 'Enjoyed', 10),
  ('outdoor_response', 'Indifferent', 20),
  ('outdoor_response', 'Wanted out', 30),
  ('activity', 'Coloring', 10),
  ('activity', 'Art & Craft', 20),
  ('activity', 'Painting', 30),
  ('activity', 'Storytime', 40),
  ('activity', 'Music & Movement', 50),
  ('activity', 'Manipulative', 60),
  ('material', 'Roller Coaster', 10),
  ('material', 'Building Lego', 20),
  ('material', 'Stringing', 30),
  ('material', 'Stacking', 40)
) as defaults(category, label, sort_order)
on conflict do nothing;
