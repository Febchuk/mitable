-- TLP assessment breakdown: CA /40, class participation /20, AFL /40.
-- Existing total-only records retain their totals and have no inferred breakdown.
alter table public.elementary_exam_grades
  add column ca_score numeric(5,2),
  add column class_participation_score numeric(5,2),
  add column afl_score numeric(5,2),
  drop constraint elementary_exam_grades_grade_label_check,
  add constraint elementary_exam_grades_grade_label_check check (length(btrim(grade_label)) <= 80),
  add constraint elementary_exam_grades_components_check check (
    (ca_score is null and class_participation_score is null and afl_score is null)
    or (
      ca_score is not null and class_participation_score is not null and afl_score is not null
      and ca_score between 0 and 40
      and class_participation_score between 0 and 20
      and afl_score between 0 and 40
      and percentage = ca_score + class_participation_score + afl_score
    )
  );

-- A letter grade describes the overall result, rather than each subject.
alter table public.elementary_term_grade_comments
  add column overall_grade_label text,
  drop constraint elementary_term_grade_comments_comment_check,
  add constraint elementary_term_grade_comments_comment_check check (length(btrim(comment)) <= 4000),
  add constraint elementary_term_grade_comments_overall_grade_check
    check (overall_grade_label is null or overall_grade_label in ('A','B','C','D')),
  add constraint elementary_term_grade_comments_feedback_check
    check (length(btrim(comment)) > 0 or overall_grade_label is not null);

comment on column public.elementary_exam_grades.ca_score is 'Continuous assessment score out of 40; null for legacy total-only results.';
comment on column public.elementary_exam_grades.class_participation_score is 'Class participation score out of 20; null for legacy total-only results.';
comment on column public.elementary_exam_grades.afl_score is 'Assessment for learning score out of 40; null for legacy total-only results.';
comment on column public.elementary_term_grade_comments.overall_grade_label is 'Teacher-selected letter grade for the cumulative term result. No thresholds are inferred.';
