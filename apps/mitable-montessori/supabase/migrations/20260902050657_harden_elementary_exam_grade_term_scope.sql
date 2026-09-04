-- Prevent a direct authenticated client from attaching a grade to another
-- school's term, even if it somehow learns that term's UUID.

create function public.current_school_term_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.school_terms
  where school_id = public.current_user_school_id();
$$;

revoke execute on function public.current_school_term_ids() from public;
grant execute on function public.current_school_term_ids() to authenticated, service_role;

alter policy "elementary exam grades school read"
  on public.elementary_exam_grades
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

alter policy "elementary exam grades school insert"
  on public.elementary_exam_grades
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

alter policy "elementary exam grades school update"
  on public.elementary_exam_grades
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

alter policy "elementary exam grades school delete"
  on public.elementary_exam_grades
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
