-- Synthetic fixtures only; run after the assessment component migration.
begin;
set local role service_role;
do $$
declare
  v_school uuid := gen_random_uuid();
  v_room uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_term uuid := gen_random_uuid();
  v_grade uuid := gen_random_uuid();
  v_feedback uuid := gen_random_uuid();
begin
  insert into public.schools(id,name,timezone) values(v_school,'SYNTHETIC assessment rollback test','Africa/Lagos');
  insert into public.classrooms(id,school_id,name,code) values(v_room,v_school,'Synthetic elementary','Lower Elementary');
  insert into public.students(id,school_id,first_name,last_name) values(v_student,v_school,'Synthetic','Learner');
  insert into public.school_terms(id,school_id,name,start_date,end_date) values(v_term,v_school,'Synthetic term','2026-09-01','2026-12-31');
  insert into public.elementary_exam_grades(id,school_id,classroom_id,student_id,term_id,subject,assessment_name,percentage,grade_label)
    values(v_grade,v_school,v_room,v_student,v_term,'Mathematics','Term assessment',86.5,'B+');
  assert (select percentage=86.5 and ca_score is null and class_participation_score is null and afl_score is null from public.elementary_exam_grades where id=v_grade), 'legacy total must remain valid without inferred scores';
  update public.elementary_exam_grades set ca_score=36,class_participation_score=19,afl_score=38,percentage=93,grade_label='' where id=v_grade;
  assert (select percentage=93 and grade_label='' from public.elementary_exam_grades where id=v_grade), 'components must support subject totals without letter grades';
  begin
    update public.elementary_exam_grades set ca_score=41,percentage=98 where id=v_grade;
    raise exception 'Expected rejection of CA over 40';
  exception when check_violation then null; end;
  begin
    update public.elementary_exam_grades set class_participation_score=21,percentage=95 where id=v_grade;
    raise exception 'Expected rejection of participation over 20';
  exception when check_violation then null; end;
  begin
    update public.elementary_exam_grades set afl_score=41,percentage=96 where id=v_grade;
    raise exception 'Expected rejection of AFL over 40';
  exception when check_violation then null; end;
  begin
    update public.elementary_exam_grades set afl_score=null where id=v_grade;
    raise exception 'Expected rejection of an incomplete breakdown';
  exception when check_violation then null; end;
  begin
    update public.elementary_exam_grades set percentage=99 where id=v_grade;
    raise exception 'Expected rejection of a mismatched total';
  exception when check_violation then null; end;
  update public.elementary_exam_grades set ca_score=31.5,class_participation_score=18,afl_score=17,percentage=66.5 where id=v_grade;
  assert (select percentage=66.5 from public.elementary_exam_grades where id=v_grade), 'decimal scores must remain exact';
  update public.elementary_exam_grades set ca_score=0,class_participation_score=0,afl_score=0,percentage=0 where id=v_grade;
  assert (select percentage=0 and ca_score=0 from public.elementary_exam_grades where id=v_grade), 'zero is a real score';
  insert into public.elementary_term_grade_comments(id,school_id,classroom_id,student_id,term_id,comment,overall_grade_label)
    values(v_feedback,v_school,v_room,v_student,v_term,'','B');
  assert (select overall_grade_label='B' and comment='' from public.elementary_term_grade_comments where id=v_feedback), 'overall grade may be saved before the comment';
  begin
    update public.elementary_term_grade_comments set overall_grade_label='A*' where id=v_feedback;
    raise exception 'Expected rejection of an unsupported overall grade';
  exception when check_violation then null; end;
  begin
    update public.elementary_term_grade_comments set overall_grade_label=null where id=v_feedback;
    raise exception 'Expected rejection of wholly empty feedback';
  exception when check_violation then null; end;
  assert (select relrowsecurity from pg_class where oid='public.elementary_exam_grades'::regclass), 'grade RLS remains enabled';
  assert (select relrowsecurity from pg_class where oid='public.elementary_term_grade_comments'::regclass), 'feedback RLS remains enabled';
  raise notice 'Assessment component regression checks passed';
end;
$$;
rollback;
