-- One report-level comment per elementary student, classroom, and term.
-- Individual exam records remain subject-specific; this comment is the single
-- narrative that accompanies their combined result in an end-of-term report.

create table public.elementary_term_grade_comments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  term_id uuid not null references public.school_terms(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  comment text not null,
  recorded_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint elementary_term_grade_comments_comment_check
    check (length(btrim(comment)) between 1 and 4000),
  constraint elementary_term_grade_comments_unique_student_term
    unique (term_id, classroom_id, student_id)
);

create index elementary_term_grade_comments_school_classroom_term_idx
  on public.elementary_term_grade_comments (school_id, classroom_id, term_id);
create index elementary_term_grade_comments_student_id_idx
  on public.elementary_term_grade_comments (student_id);

create trigger elementary_term_grade_comments_set_updated_at
  before update on public.elementary_term_grade_comments
  for each row execute function public.tg_elementary_exam_grades_set_updated_at();

alter table public.elementary_term_grade_comments enable row level security;

create policy "elementary term grade comments school read"
  on public.elementary_term_grade_comments for select
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and term_id in (select public.current_school_term_ids())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

create policy "elementary term grade comments school insert"
  on public.elementary_term_grade_comments for insert
  to authenticated
  with check (
    school_id = (select public.current_user_school_id())
    and term_id in (select public.current_school_term_ids())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

create policy "elementary term grade comments school update"
  on public.elementary_term_grade_comments for update
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and term_id in (select public.current_school_term_ids())
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
    and term_id in (select public.current_school_term_ids())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

create policy "elementary term grade comments school delete"
  on public.elementary_term_grade_comments for delete
  to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and term_id in (select public.current_school_term_ids())
    and (
      (select public.current_user_is_admin())
      or (
        classroom_id in (select public.teacher_active_classroom_ids())
        and student_id in (select public.teacher_visible_student_ids())
      )
    )
  );

revoke all on table public.elementary_term_grade_comments from anon;
grant select, insert, update, delete on table public.elementary_term_grade_comments to authenticated;
grant all on table public.elementary_term_grade_comments to service_role;
