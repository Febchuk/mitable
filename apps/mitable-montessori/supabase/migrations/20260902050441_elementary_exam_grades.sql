-- Traditional elementary exam results, entered by teachers and snapshotted
-- into end-of-term reports.

create table public.elementary_exam_grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  term_id uuid not null references public.school_terms(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject text not null,
  assessment_name text not null default 'End-of-term exam',
  percentage numeric(5, 2) not null,
  grade_label text not null,
  comments text,
  recorded_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint elementary_exam_grades_percentage_check
    check (percentage >= 0 and percentage <= 100),
  constraint elementary_exam_grades_subject_check
    check (length(btrim(subject)) between 1 and 120),
  constraint elementary_exam_grades_assessment_name_check
    check (length(btrim(assessment_name)) between 1 and 160),
  constraint elementary_exam_grades_grade_label_check
    check (length(btrim(grade_label)) between 1 and 80),
  constraint elementary_exam_grades_comments_check
    check (comments is null or length(comments) <= 4000),
  constraint elementary_exam_grades_unique_result
    unique (term_id, student_id, subject, assessment_name)
);

create index elementary_exam_grades_school_classroom_term_idx
  on public.elementary_exam_grades (school_id, classroom_id, term_id);
create index elementary_exam_grades_student_id_idx
  on public.elementary_exam_grades (student_id);
create index elementary_exam_grades_recorded_by_user_id_idx
  on public.elementary_exam_grades (recorded_by_user_id);

create function public.tg_elementary_exam_grades_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger elementary_exam_grades_set_updated_at
  before update on public.elementary_exam_grades
  for each row execute function public.tg_elementary_exam_grades_set_updated_at();

alter table public.elementary_exam_grades enable row level security;

create policy "elementary exam grades school read"
  on public.elementary_exam_grades for select
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

create policy "elementary exam grades school insert"
  on public.elementary_exam_grades for insert
  to authenticated
  with check (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

create policy "elementary exam grades school update"
  on public.elementary_exam_grades for update
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  )
  with check (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

create policy "elementary exam grades school delete"
  on public.elementary_exam_grades for delete
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

revoke all on table public.elementary_exam_grades from anon;
grant select, insert, update, delete on table public.elementary_exam_grades to authenticated;
grant all on table public.elementary_exam_grades to service_role;

-- Persist the reporting period and exact school term on each report. This
-- makes the end-of-term grade snapshot explicit even when a template changes.
alter table public.reports
  add column reporting_period text,
  add column term_id uuid references public.school_terms(id) on delete set null,
  add constraint reports_reporting_period_check check (
    reporting_period is null or reporting_period in (
      'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'end_of_term'
    )
  );

create index reports_term_id_idx on public.reports (term_id);

update public.reports r
set reporting_period = t.reporting_period
from public.report_templates t
where r.template_id = t.id
  and t.reporting_period is not null;
