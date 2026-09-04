-- Keep the deployed policy aligned with the original migration: a teacher can
-- remove only a comment tied to a term in their own school.

alter policy "elementary term grade comments school delete"
  on public.elementary_term_grade_comments
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
