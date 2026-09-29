-- SEN daily reports are deliberately separate from a child's classroom
-- enrollment and Montessori progress. A child remains enrolled in their real
-- classroom; an SEN report group is a companion reporting list for that room.

-- Expose SEN as a Progress mode on classrooms that have an SEN report group.
alter table public.classrooms
  drop constraint if exists classrooms_program_types_known;

alter table public.classrooms
  add constraint classrooms_program_types_known
    check (
      cardinality(program_types) > 0
      and program_types <@ array['montessori', 'iep', 'session_notes', 'sen']::text[]
    );

create table public.sen_report_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sen_report_templates_name_check check (length(btrim(name)) between 1 and 160),
  constraint sen_report_templates_description_check check (
    description is null or length(description) <= 2000
  ),
  unique (school_id, name)
);

create table public.sen_report_metrics (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.sen_report_templates(id) on delete cascade,
  section text not null check (section in ('skill', 'maladaptive_behavior')),
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(btrim(label)) between 1 and 160),
  sort_order integer not null default 0,
  scale_type text not null check (scale_type in ('performance', 'frequency')),
  score_labels text[] not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sen_report_metrics_score_labels_check check (cardinality(score_labels) = 5),
  unique (template_id, metric_key)
);

create index sen_report_metrics_template_section_idx
  on public.sen_report_metrics (template_id, section, sort_order);

create table public.sen_report_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  template_id uuid not null references public.sen_report_templates(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  is_active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sen_report_groups_active_classroom_template_key
  on public.sen_report_groups (classroom_id, template_id)
  where is_active;

create index sen_report_groups_school_classroom_idx
  on public.sen_report_groups (school_id, classroom_id)
  where is_active;

create table public.sen_report_group_members (
  id uuid primary key default gen_random_uuid(),
  sen_report_group_id uuid not null references public.sen_report_groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  joined_on date not null default current_date,
  left_on date,
  created_at timestamptz not null default now(),
  constraint sen_report_group_members_dates_check check (left_on is null or left_on >= joined_on),
  unique (sen_report_group_id, student_id)
);

create index sen_report_group_members_active_group_idx
  on public.sen_report_group_members (sen_report_group_id, student_id)
  where left_on is null;

create table public.sen_daily_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  sen_report_group_id uuid not null references public.sen_report_groups(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  report_date date not null,
  remarks text,
  class_teacher_signed_by_user_id uuid references public.users(id) on delete set null,
  class_teacher_signed_at timestamptz,
  facilitator_signed_by_user_id uuid references public.users(id) on delete set null,
  facilitator_signed_at timestamptz,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sen_daily_reports_remarks_check check (remarks is null or length(remarks) <= 4000),
  constraint sen_daily_reports_class_teacher_signature_check check (
    (class_teacher_signed_by_user_id is null) = (class_teacher_signed_at is null)
  ),
  constraint sen_daily_reports_facilitator_signature_check check (
    (facilitator_signed_by_user_id is null) = (facilitator_signed_at is null)
  ),
  unique (sen_report_group_id, student_id, report_date)
);

create index sen_daily_reports_group_date_idx
  on public.sen_daily_reports (sen_report_group_id, report_date desc);
create index sen_daily_reports_student_date_idx
  on public.sen_daily_reports (student_id, report_date desc);

create table public.sen_daily_report_scores (
  id uuid primary key default gen_random_uuid(),
  sen_daily_report_id uuid not null references public.sen_daily_reports(id) on delete cascade,
  metric_id uuid not null references public.sen_report_metrics(id) on delete restrict,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sen_daily_report_id, metric_id)
);

create index sen_daily_report_scores_report_idx
  on public.sen_daily_report_scores (sen_daily_report_id);

create function public.tg_sen_report_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.tg_sen_report_group_validate_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = new.classroom_id
      and classroom.school_id = new.school_id
  ) then
    raise exception 'SEN report group classroom must belong to the same school';
  end if;

  if not exists (
    select 1
    from public.sen_report_templates template
    where template.id = new.template_id
      and template.school_id = new.school_id
  ) then
    raise exception 'SEN report template must belong to the same school';
  end if;

  return new;
end;
$$;

create function public.tg_sen_report_member_validate_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sen_report_groups report_group
    join public.students student on student.id = new.student_id
    join public.student_classroom_enrollments enrollment
      on enrollment.student_id = new.student_id
     and enrollment.classroom_id = report_group.classroom_id
     and enrollment.start_date <= new.joined_on
     and (enrollment.end_date is null or enrollment.end_date >= new.joined_on)
    where report_group.id = new.sen_report_group_id
      and student.school_id = report_group.school_id
  ) then
    raise exception 'SEN learners must be enrolled in the group''s classroom on their join date';
  end if;

  return new;
end;
$$;

create function public.tg_sen_daily_report_validate_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sen_report_groups report_group
    join public.students student on student.id = new.student_id
    join public.sen_report_group_members member
      on member.sen_report_group_id = report_group.id
     and member.student_id = new.student_id
     and member.joined_on <= new.report_date
     and (member.left_on is null or member.left_on >= new.report_date)
    join public.student_classroom_enrollments enrollment
      on enrollment.student_id = new.student_id
     and enrollment.classroom_id = report_group.classroom_id
     and enrollment.start_date <= new.report_date
     and (enrollment.end_date is null or enrollment.end_date >= new.report_date)
    where report_group.id = new.sen_report_group_id
      and report_group.school_id = new.school_id
      and student.school_id = new.school_id
  ) then
    raise exception 'SEN daily reports must belong to an enrolled SEN learner in the matching classroom';
  end if;

  return new;
end;
$$;

create function public.tg_sen_daily_report_score_validate_metric()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.sen_daily_reports report
    join public.sen_report_groups report_group on report_group.id = report.sen_report_group_id
    join public.sen_report_metrics metric
      on metric.id = new.metric_id
     and metric.template_id = report_group.template_id
    where report.id = new.sen_daily_report_id
  ) then
    raise exception 'SEN score metric must belong to the report group''s template';
  end if;

  return new;
end;
$$;

create trigger sen_report_templates_set_updated_at
  before update on public.sen_report_templates
  for each row execute function public.tg_sen_report_set_updated_at();
create trigger sen_report_groups_set_updated_at
  before update on public.sen_report_groups
  for each row execute function public.tg_sen_report_set_updated_at();
create trigger sen_daily_reports_set_updated_at
  before update on public.sen_daily_reports
  for each row execute function public.tg_sen_report_set_updated_at();
create trigger sen_daily_report_scores_set_updated_at
  before update on public.sen_daily_report_scores
  for each row execute function public.tg_sen_report_set_updated_at();

create trigger sen_report_groups_validate_scope
  before insert or update on public.sen_report_groups
  for each row execute function public.tg_sen_report_group_validate_scope();
create trigger sen_report_group_members_validate_scope
  before insert or update on public.sen_report_group_members
  for each row execute function public.tg_sen_report_member_validate_scope();
create trigger sen_daily_reports_validate_scope
  before insert or update on public.sen_daily_reports
  for each row execute function public.tg_sen_daily_report_validate_scope();
create trigger sen_daily_report_scores_validate_metric
  before insert or update on public.sen_daily_report_scores
  for each row execute function public.tg_sen_daily_report_score_validate_metric();

alter table public.sen_report_templates enable row level security;
alter table public.sen_report_metrics enable row level security;
alter table public.sen_report_groups enable row level security;
alter table public.sen_report_group_members enable row level security;
alter table public.sen_daily_reports enable row level security;
alter table public.sen_daily_report_scores enable row level security;

create policy "sen report templates read"
  on public.sen_report_templates for select
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or id in (
        select report_group.template_id
        from public.sen_report_groups report_group
        where report_group.classroom_id in (select public.teacher_active_classroom_ids())
      )
    )
  );

create policy "sen report templates admin write"
  on public.sen_report_templates for all
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  )
  with check (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  );

create policy "sen report metrics read"
  on public.sen_report_metrics for select
  to authenticated
  using (
    template_id in (
      select template.id
      from public.sen_report_templates template
      where template.school_id = (select public.current_user_school_id())
    )
  );

create policy "sen report metrics admin write"
  on public.sen_report_metrics for all
  to authenticated
  using (
    template_id in (
      select template.id
      from public.sen_report_templates template
      where template.school_id = (select public.current_user_school_id())
        and (select public.current_user_is_admin())
    )
  )
  with check (
    template_id in (
      select template.id
      from public.sen_report_templates template
      where template.school_id = (select public.current_user_school_id())
        and (select public.current_user_is_admin())
    )
  );

create policy "sen report groups read"
  on public.sen_report_groups for select
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or classroom_id in (select public.teacher_active_classroom_ids())
    )
  );

create policy "sen report groups admin write"
  on public.sen_report_groups for all
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  )
  with check (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  );

create policy "sen report group members read"
  on public.sen_report_group_members for select
  to authenticated
  using (
    sen_report_group_id in (
      select report_group.id
      from public.sen_report_groups report_group
      where report_group.school_id = (select public.current_user_school_id())
        and (
          (select public.current_user_is_admin())
          or report_group.classroom_id in (select public.teacher_active_classroom_ids())
        )
    )
  );

create policy "sen report group members admin write"
  on public.sen_report_group_members for all
  to authenticated
  using (
    sen_report_group_id in (
      select report_group.id
      from public.sen_report_groups report_group
      where report_group.school_id = (select public.current_user_school_id())
        and (select public.current_user_is_admin())
    )
  )
  with check (
    sen_report_group_id in (
      select report_group.id
      from public.sen_report_groups report_group
      where report_group.school_id = (select public.current_user_school_id())
        and (select public.current_user_is_admin())
    )
  );

create policy "sen daily reports staff read"
  on public.sen_daily_reports for select
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and sen_report_group_id in (
      select report_group.id
      from public.sen_report_groups report_group
      where (select public.current_user_is_admin())
         or report_group.classroom_id in (select public.teacher_active_classroom_ids())
    )
  );

create policy "sen daily reports staff insert"
  on public.sen_daily_reports for insert
  to authenticated
  with check (
    school_id = (select public.current_user_school_id())
    and sen_report_group_id in (
      select report_group.id
      from public.sen_report_groups report_group
      where (select public.current_user_is_admin())
         or report_group.classroom_id in (select public.teacher_active_classroom_ids())
    )
    and created_by_user_id = (select auth.uid())
  );

create policy "sen daily reports staff update"
  on public.sen_daily_reports for update
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and sen_report_group_id in (
      select report_group.id
      from public.sen_report_groups report_group
      where (select public.current_user_is_admin())
         or report_group.classroom_id in (select public.teacher_active_classroom_ids())
    )
  )
  with check (
    school_id = (select public.current_user_school_id())
    and sen_report_group_id in (
      select report_group.id
      from public.sen_report_groups report_group
      where (select public.current_user_is_admin())
         or report_group.classroom_id in (select public.teacher_active_classroom_ids())
    )
  );

create policy "sen daily reports admin delete"
  on public.sen_daily_reports for delete
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (select public.current_user_is_admin())
  );

create policy "sen daily report scores staff read"
  on public.sen_daily_report_scores for select
  to authenticated
  using (
    sen_daily_report_id in (select id from public.sen_daily_reports)
  );

create policy "sen daily report scores staff write"
  on public.sen_daily_report_scores for all
  to authenticated
  using (
    sen_daily_report_id in (select id from public.sen_daily_reports)
  )
  with check (
    sen_daily_report_id in (select id from public.sen_daily_reports)
  );

revoke all on table public.sen_report_templates from anon;
revoke all on table public.sen_report_metrics from anon;
revoke all on table public.sen_report_groups from anon;
revoke all on table public.sen_report_group_members from anon;
revoke all on table public.sen_daily_reports from anon;
revoke all on table public.sen_daily_report_scores from anon;
grant select, insert, update, delete on table public.sen_report_templates to authenticated;
grant select, insert, update, delete on table public.sen_report_metrics to authenticated;
grant select, insert, update, delete on table public.sen_report_groups to authenticated;
grant select, insert, update, delete on table public.sen_report_group_members to authenticated;
grant select, insert, update, delete on table public.sen_daily_reports to authenticated;
grant select, insert, update, delete on table public.sen_daily_report_scores to authenticated;
grant all on table public.sen_report_templates to service_role;
grant all on table public.sen_report_metrics to service_role;
grant all on table public.sen_report_groups to service_role;
grant all on table public.sen_report_group_members to service_role;
grant all on table public.sen_daily_reports to service_role;
grant all on table public.sen_daily_report_scores to service_role;

-- The Learning Place's first SEN reporting group. No pupils are pre-enrolled:
-- the administrator chooses only the children who require this daily report.
insert into public.sen_report_templates (school_id, name, description)
select school.id,
       'SEN Daily Report',
       'Daily skills and maladaptive-behaviour report based on The Learning Place paper form.'
from public.schools school
where school.id in (
  select classroom.school_id
  from public.classrooms classroom
  where classroom.name = 'Asia (Blue Team)'
)
on conflict (school_id, name) do update
set description = excluded.description,
    is_active = true;

with template as (
  select template.id
  from public.sen_report_templates template
  join public.classrooms classroom on classroom.school_id = template.school_id
  where classroom.name = 'Asia (Blue Team)'
    and template.name = 'SEN Daily Report'
)
insert into public.sen_report_metrics (
  template_id, section, metric_key, label, sort_order, scale_type, score_labels
)
select template.id,
       metric.section,
       metric.metric_key,
       metric.label,
       metric.sort_order,
       metric.scale_type,
       metric.score_labels
from template
cross join (
  values
    ('skill', 'fine_motor', 'Fine Motor', 1, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('skill', 'gross_motor', 'Gross Motor', 2, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('skill', 'communication', 'Communication', 3, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('skill', 'cognitive', 'Cognitive', 4, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('skill', 'social', 'Social', 5, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('skill', 'feeding', 'Feeding', 6, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('skill', 'play_time', 'Play Time', 7, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('skill', 'co_operation', 'Co-Operation', 8, 'performance', array['None', 'Minimum', 'Satisfactory', 'Good', 'Excellent']::text[]),
    ('maladaptive_behavior', 'tantrum', 'Tantrum', 1, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[]),
    ('maladaptive_behavior', 'self_talk', 'Self-Talk', 2, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[]),
    ('maladaptive_behavior', 'escape', 'Escape', 3, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[]),
    ('maladaptive_behavior', 'meltdown', 'Meltdown', 4, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[]),
    ('maladaptive_behavior', 'self_stimulation', 'Self Stimulation', 5, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[]),
    ('maladaptive_behavior', 'aggression', 'Aggression', 6, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[]),
    ('maladaptive_behavior', 'self_injurious_behavior', 'Self-Injurious Behavior', 7, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[]),
    ('maladaptive_behavior', 'disruption', 'Disruption', 8, 'frequency', array['Continuous', 'Frequent', 'Occasional', 'Limited', 'None']::text[])
) as metric(section, metric_key, label, sort_order, scale_type, score_labels)
on conflict (template_id, metric_key) do update
set section = excluded.section,
    label = excluded.label,
    sort_order = excluded.sort_order,
    scale_type = excluded.scale_type,
    score_labels = excluded.score_labels,
    is_active = true;

insert into public.sen_report_groups (school_id, classroom_id, template_id, name)
select classroom.school_id,
       classroom.id,
       template.id,
       'SEN — Asia (Blue Team)'
from public.classrooms classroom
join public.sen_report_templates template
  on template.school_id = classroom.school_id
 and template.name = 'SEN Daily Report'
where classroom.name = 'Asia (Blue Team)'
on conflict (classroom_id, template_id) where is_active do update
set name = excluded.name,
    is_active = true;

update public.classrooms classroom
set program_types = array_append(classroom.program_types, 'sen')
where classroom.id in (
  select report_group.classroom_id
  from public.sen_report_groups report_group
  join public.sen_report_templates template on template.id = report_group.template_id
  where template.name = 'SEN Daily Report'
    and report_group.is_active
)
and not ('sen' = any(classroom.program_types));
