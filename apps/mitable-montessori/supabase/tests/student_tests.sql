-- Run after the student tests migration with a privileged SQL connection:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/student_tests.sql
-- Uses a new synthetic school and random IDs only. Every fixture is rolled back.
begin;

create temp table fx (name text primary key, id uuid not null) on commit drop;
grant select on fx to authenticated;

create function pg_temp.act_as(p_name text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', (select id from fx where name = p_name), 'role', 'authenticated')::text,
    true
  );
end;
$$;

create function pg_temp.act_as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
end;
$$;

create function pg_temp.check_true(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAILED: %', p_message;
  end if;
  raise notice 'ok: %', p_message;
end;
$$;

create function pg_temp.check_denied(p_sql text, p_message text) returns void language plpgsql as $$
declare
  v_rows integer;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
  exception when others then
    raise notice 'ok: % (%)', p_message, sqlstate;
    return;
  end;
  if v_rows > 0 then
    raise exception 'FAILED: % changed % rows', p_message, v_rows;
  end if;
  raise notice 'ok: % (no rows)', p_message;
end;
$$;

do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'school', 'other_school', 'room', 'other_room', 'admin', 'teacher', 'other_teacher',
    'student', 'classmate', 'other_student', 'parent', 'parent_row', 'student_row', 'classmate_row',
    'other_student_row', 'test', 'draft', 'other_test', 'mc', 'written', 'number', 'draft_q',
    'other_q'
  ]
  loop
    insert into fx values (v_name, gen_random_uuid());
  end loop;
end;
$$;

create function pg_temp.fx(p_name text) returns uuid language sql as $$
  select id from fx where name = p_name;
$$;

insert into auth.users (id, email)
select id, name || '@students.mitable.invalid' from fx
 where name in ('admin', 'teacher', 'other_teacher', 'student', 'classmate', 'other_student', 'parent');

insert into schools (id, name, timezone) values
  (pg_temp.fx('school'), 'Synthetic School', 'Africa/Lagos'),
  (pg_temp.fx('other_school'), 'Other School', 'Africa/Lagos');

insert into users (id, school_id, role, email, status, first_name) values
  (pg_temp.fx('admin'), pg_temp.fx('school'), 'admin', 'admin@example.test', 'active', 'A'),
  (pg_temp.fx('teacher'), pg_temp.fx('school'), 'teacher', 'teacher@example.test', 'active', 'T'),
  (pg_temp.fx('other_teacher'), pg_temp.fx('other_school'), 'teacher', 'other@example.test', 'active', 'O');

insert into classrooms (id, school_id, name) values
  (pg_temp.fx('room'), pg_temp.fx('school'), 'Room'),
  (pg_temp.fx('other_room'), pg_temp.fx('other_school'), 'Other Room');

insert into classroom_teacher_assignments (classroom_id, teacher_user_id, start_date) values
  (pg_temp.fx('room'), pg_temp.fx('teacher'), current_date),
  (pg_temp.fx('other_room'), pg_temp.fx('other_teacher'), current_date);

insert into students (id, school_id, first_name, last_name, notes) values
  (pg_temp.fx('student_row'), pg_temp.fx('school'), 'Sam', 'Student', 'private note'),
  (pg_temp.fx('classmate_row'), pg_temp.fx('school'), 'Cal', 'Classmate', null),
  (pg_temp.fx('other_student_row'), pg_temp.fx('other_school'), 'Ola', 'Other', null);

insert into student_classroom_enrollments (student_id, classroom_id, start_date) values
  (pg_temp.fx('student_row'), pg_temp.fx('room'), current_date),
  (pg_temp.fx('classmate_row'), pg_temp.fx('room'), current_date),
  (pg_temp.fx('other_student_row'), pg_temp.fx('other_room'), current_date);

insert into student_logins (student_id, school_id, auth_user_id, login_code) values
  (pg_temp.fx('student_row'), pg_temp.fx('school'), pg_temp.fx('student'), 'STUDENT1'),
  (pg_temp.fx('classmate_row'), pg_temp.fx('school'), pg_temp.fx('classmate'), 'CLASSMT1'),
  (pg_temp.fx('other_student_row'), pg_temp.fx('other_school'), pg_temp.fx('other_student'), 'OTHER001');

insert into guardians (id, school_id, first_name, last_name, email, auth_user_id) values
  (pg_temp.fx('parent_row'), pg_temp.fx('school'), 'Pat', 'Parent', 'parent@example.test', pg_temp.fx('parent'));
insert into student_guardians (student_id, guardian_id, relationship) values
  (pg_temp.fx('student_row'), pg_temp.fx('parent_row'), 'mother');

insert into tests (id, school_id, classroom_id, subject, title, status) values
  (pg_temp.fx('test'), pg_temp.fx('school'), pg_temp.fx('room'), 'Maths', 'Published', 'draft'),
  (pg_temp.fx('draft'), pg_temp.fx('school'), pg_temp.fx('room'), 'Maths', 'Draft', 'draft'),
  (pg_temp.fx('other_test'), pg_temp.fx('other_school'), pg_temp.fx('other_room'), 'Maths', 'Other', 'draft');

insert into test_questions (id, test_id, position, kind, prompt, options, points) values
  (pg_temp.fx('mc'), pg_temp.fx('test'), 0, 'multiple_choice', 'Pick', '["A","B"]', 2),
  (pg_temp.fx('written'), pg_temp.fx('test'), 1, 'long_answer', 'Explain', null, 5),
  (pg_temp.fx('number'), pg_temp.fx('test'), 2, 'number', 'Add', null, 1),
  (pg_temp.fx('draft_q'), pg_temp.fx('draft'), 0, 'short_answer', 'Secret draft', null, 1),
  (pg_temp.fx('other_q'), pg_temp.fx('other_test'), 0, 'short_answer', 'Other', null, 1);

insert into test_answer_keys (question_id, correct_option) values (pg_temp.fx('mc'), 1);
insert into test_answer_keys (question_id, correct_number) values (pg_temp.fx('number'), 4);

update tests set status = 'published' where id in (pg_temp.fx('test'), pg_temp.fx('other_test'));

-- Student while the test is open
select pg_temp.act_as('student');
select pg_temp.check_true(public.current_student_id() = pg_temp.fx('student_row'), 'student resolves to their own student row');
select pg_temp.check_true((select count(*) from tests) = 1, 'student sees only the published test in their classroom');
select pg_temp.check_true((select count(*) from test_questions) = 3, 'student sees the questions of that test');
select pg_temp.check_true((select count(*) from test_answer_keys) = 0, 'student cannot read answer keys');
select pg_temp.check_true((select count(*) from students) = 0, 'student cannot read the students table');
select pg_temp.check_true((select count(*) from student_logins) = 0, 'student cannot read logins');
select pg_temp.check_true((select display_name from public.current_student_profile()) = 'Sam', 'student gets their own display name');

insert into test_submissions (id, test_id, student_id)
values (gen_random_uuid(), pg_temp.fx('test'), pg_temp.fx('student_row'));
select pg_temp.act_as_admin();
insert into fx select 'submission', id from test_submissions where student_id = pg_temp.fx('student_row');
insert into test_submissions (id, test_id, student_id) values
  (gen_random_uuid(), pg_temp.fx('test'), pg_temp.fx('classmate_row'));
insert into fx select 'classmate_sub', id from test_submissions where student_id = pg_temp.fx('classmate_row');

select pg_temp.act_as('student');
select pg_temp.check_denied(format($q$insert into test_submissions (test_id, student_id, status, submitted_at) values (%L, %L, 'submitted', now())$q$, pg_temp.fx('draft'), pg_temp.fx('student_row')), 'student cannot start a draft test');
select pg_temp.check_denied(format($q$insert into test_submissions (test_id, student_id) values (%L, %L)$q$, pg_temp.fx('other_test'), pg_temp.fx('student_row')), 'student cannot start another school''s test');
select pg_temp.check_denied(format($q$insert into test_submissions (test_id, student_id) values (%L, %L)$q$, pg_temp.fx('test'), pg_temp.fx('other_student_row')), 'student cannot start a test as someone else');
select pg_temp.check_denied(format($q$update test_submissions set status = 'submitted', submitted_at = now() where id = %L$q$, pg_temp.fx('submission')), 'student cannot change a submission directly');
select pg_temp.check_denied(format($q$delete from test_submissions where id = %L$q$, pg_temp.fx('submission')), 'student cannot delete a submission');
select pg_temp.check_denied(format($q$insert into test_answers (submission_id, question_id, answer_text) values (%L, %L, 'x')$q$, pg_temp.fx('classmate_sub'), pg_temp.fx('written')), 'student cannot answer on a classmate''s submission');
select pg_temp.check_denied(format($q$insert into test_answers (submission_id, question_id, answer_text) values (%L, %L, 'x')$q$, pg_temp.fx('submission'), pg_temp.fx('draft_q')), 'student cannot answer a question from another test');
select pg_temp.check_denied(format($q$insert into test_marks (submission_id, question_id, points) values (%L, %L, 5)$q$, pg_temp.fx('submission'), pg_temp.fx('written')), 'student cannot mark themselves');
select pg_temp.check_denied(format($q$update tests set status = 'closed' where id = %L$q$, pg_temp.fx('test')), 'student cannot close a test');
select pg_temp.check_denied($q$select public.save_test_questions((select id from fx where name = 'test'), '[]'::jsonb)$q$, 'student cannot rewrite questions');

insert into test_answers (submission_id, question_id, selected_option)
values (pg_temp.fx('submission'), pg_temp.fx('mc'), 1);
insert into test_answers (submission_id, question_id, answer_text)
values (pg_temp.fx('submission'), pg_temp.fx('written'), 'First try');
update test_answers set answer_text = 'Second try' where question_id = pg_temp.fx('written');
select pg_temp.check_true((select answer_text from test_answers where question_id = pg_temp.fx('written')) = 'Second try', 'student can change an answer before submitting');

-- Classmate
select pg_temp.act_as('classmate');
select pg_temp.check_true((select count(*) from test_submissions) = 1, 'classmate sees only their own submission');
select pg_temp.check_true((select count(*) from test_answers) = 0, 'classmate cannot read another student''s answers');
select pg_temp.check_denied(format($q$select public.submit_test(%L)$q$, pg_temp.fx('submission')), 'classmate cannot submit another student''s test');

-- Parent: no access to anything in a test, even for their own child
select pg_temp.act_as('parent');
select pg_temp.check_true((select count(*) from tests) = 0, 'parent cannot read tests');
select pg_temp.check_true((select count(*) from test_questions) = 0, 'parent cannot read questions');
select pg_temp.check_true((select count(*) from test_answer_keys) = 0, 'parent cannot read answer keys');
select pg_temp.check_true((select count(*) from test_submissions) = 0, 'parent cannot read their child''s submission');
select pg_temp.check_true((select count(*) from test_answers) = 0, 'parent cannot read their child''s answers');
select pg_temp.check_true((select count(*) from test_marks) = 0, 'parent cannot read marks');
select pg_temp.check_true((select count(*) from student_logins) = 0, 'parent cannot read their child''s login');
select pg_temp.check_denied(format($q$update test_answers set answer_text = 'parent edit' where submission_id = %L$q$, pg_temp.fx('submission')), 'parent cannot edit their child''s answers');
select pg_temp.check_denied(format($q$insert into test_answers (submission_id, question_id, answer_text) values (%L, %L, 'parent')$q$, pg_temp.fx('submission'), pg_temp.fx('number')), 'parent cannot add an answer');
select pg_temp.check_denied(format($q$select public.submit_test(%L)$q$, pg_temp.fx('submission')), 'parent cannot submit for their child');

-- Student submits
select pg_temp.act_as('student');
select public.submit_test(pg_temp.fx('submission'));
select pg_temp.check_true((select status from test_submissions where id = pg_temp.fx('submission')) = 'submitted', 'student can submit');
select pg_temp.check_true((select count(*) from test_answers) = 0, 'student cannot read answers after submitting');
select pg_temp.check_true((select count(*) from test_questions) = 0, 'student cannot read questions after submitting');
select pg_temp.check_denied(format($q$update test_answers set answer_text = 'changed' where submission_id = %L$q$, pg_temp.fx('submission')), 'student cannot edit after submitting');
select pg_temp.check_denied(format($q$insert into test_answers (submission_id, question_id, answer_number) values (%L, %L, 4)$q$, pg_temp.fx('submission'), pg_temp.fx('number')), 'student cannot add an answer after submitting');
select pg_temp.check_denied(format($q$select public.submit_test(%L)$q$, pg_temp.fx('submission')), 'student cannot submit twice');

-- Teachers
select pg_temp.act_as('teacher');
select pg_temp.check_true((select count(*) from tests) = 2, 'teacher sees tests in their classroom');
select pg_temp.check_true((select count(*) from test_answer_keys) = 2, 'teacher can read the answer keys');
select pg_temp.check_true((select answer_text from test_answers where question_id = pg_temp.fx('written')) = 'Second try', 'teacher sees the submitted answer');
do $$
declare
  v_created uuid;
begin
  insert into tests (school_id, classroom_id, subject, title)
  values (pg_temp.fx('school'), pg_temp.fx('room'), 'Maths', 'New')
  returning id into v_created;
  perform pg_temp.check_true(v_created is not null, 'teacher can create a test and read it back');
end;
$$;
select pg_temp.check_denied(format($q$update test_answers set answer_text = 'teacher edit' where submission_id = %L$q$, pg_temp.fx('submission')), 'teacher cannot change a student''s answer');
select pg_temp.check_denied(format($q$select public.save_test_questions(%L, '[]'::jsonb)$q$, pg_temp.fx('test')), 'teacher cannot edit questions after publishing');
select pg_temp.check_denied(format($q$delete from tests where id = %L$q$, pg_temp.fx('test')), 'teacher cannot delete a published test');
select pg_temp.check_denied(format($q$update tests set status = 'draft' where id = %L$q$, pg_temp.fx('test')), 'a published test cannot return to draft');
select pg_temp.check_denied(format($q$insert into test_marks (submission_id, question_id, points) values (%L, %L, 1)$q$, pg_temp.fx('classmate_sub'), pg_temp.fx('written')), 'teacher cannot mark a test still in progress');
insert into test_marks (submission_id, question_id, points) values (pg_temp.fx('submission'), pg_temp.fx('written'), 4);
select public.save_test_questions(pg_temp.fx('draft'), '[{"kind":"multiple_choice","prompt":"New","options":["A","B"],"points":2,"correctOption":1,"correctNumber":null},{"kind":"number","prompt":"Sum","options":null,"points":1,"correctOption":null,"correctNumber":0}]'::jsonb);
select pg_temp.check_true((select count(*) from test_questions where test_id = pg_temp.fx('draft')) = 2, 'teacher can replace a draft''s questions');
select pg_temp.check_true((select count(*) from test_answer_keys k join test_questions q on q.id = k.question_id where q.test_id = pg_temp.fx('draft')) = 2, 'saving a draft stores its answer keys, including a key of zero');

select pg_temp.act_as('student');
select pg_temp.check_true((select count(*) from test_marks) = 0, 'student cannot read their marks');
select pg_temp.act_as('parent');
select pg_temp.check_true((select count(*) from test_marks) = 0, 'parent cannot read their child''s marks');

select pg_temp.act_as('other_teacher');
select pg_temp.check_true((select count(*) from tests) = 1, 'teacher at another school sees only their own test');
select pg_temp.check_true((select count(*) from test_submissions) = 0, 'teacher at another school sees no submissions');
select pg_temp.check_true((select count(*) from test_marks) = 0, 'teacher at another school sees no marks');
select pg_temp.check_denied(format($q$insert into tests (school_id, classroom_id, subject, title) values (%L, %L, 'x', 'x')$q$, pg_temp.fx('school'), pg_temp.fx('room')), 'teacher cannot create a test in another school');
select pg_temp.check_denied(format($q$select public.save_test_questions(%L, '[]'::jsonb)$q$, pg_temp.fx('draft')), 'teacher cannot edit another school''s draft');

select pg_temp.act_as('admin');
select pg_temp.check_true((select count(*) from tests) = 3, 'admin sees every test in their school');
select pg_temp.check_true((select count(*) from test_marks) = 1, 'admin sees marks in their school');

-- A student login must reach nothing else in the app.
select pg_temp.act_as('student');
do $$
declare
  v_table text;
  v_count bigint;
  v_visible text[] := array[]::text[];
begin
  for v_table in
    select tablename from pg_tables where schemaname = 'public'
       and tablename not in ('tests', 'test_questions', 'test_submissions', 'test_answers')
  loop
    begin
      execute format('select count(*) from public.%I', v_table) into v_count;
      if v_count > 0 then
        v_visible := v_visible || v_table;
      end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'tables a student login can read: %', v_visible;
  if cardinality(v_visible) > 0 then
    raise warning 'review: a student login can read rows in %', v_visible;
  end if;
end;
$$;

select pg_temp.act_as_admin();
rollback;
