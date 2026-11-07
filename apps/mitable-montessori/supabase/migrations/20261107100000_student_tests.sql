-- Student tests: teachers write tests for a classroom, students sit them from
-- their own login, and teachers mark them. Answer keys and marks are in their
-- own staff-only tables because row level security can't hide single columns.

create table public.student_logins (
  student_id uuid primary key references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  login_code text not null unique,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 160),
  instructions text check (instructions is null or length(instructions) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tests_classroom_id_idx on public.tests (classroom_id);

create table public.test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  position integer not null check (position >= 0),
  kind text not null check (kind in ('multiple_choice', 'short_answer', 'long_answer', 'number')),
  prompt text not null check (length(btrim(prompt)) between 1 and 4000),
  options jsonb,
  points numeric(6, 2) not null default 1 check (points > 0),
  unique (test_id, position),
  check (
    (kind = 'multiple_choice' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2)
    or (kind <> 'multiple_choice' and options is null)
  )
);

create table public.test_answer_keys (
  question_id uuid primary key references public.test_questions(id) on delete cascade,
  correct_option integer check (correct_option >= 0),
  correct_number numeric
);

create table public.test_submissions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (test_id, student_id),
  check ((status = 'submitted') = (submitted_at is not null))
);
create index test_submissions_student_id_idx on public.test_submissions (student_id);

create table public.test_answers (
  submission_id uuid not null references public.test_submissions(id) on delete cascade,
  question_id uuid not null references public.test_questions(id) on delete cascade,
  selected_option integer check (selected_option >= 0),
  answer_text text check (answer_text is null or length(answer_text) <= 20000),
  answer_number numeric,
  updated_at timestamptz not null default now(),
  primary key (submission_id, question_id)
);
create index test_answers_question_id_idx on public.test_answers (question_id);

create table public.test_marks (
  submission_id uuid not null references public.test_submissions(id) on delete cascade,
  question_id uuid not null references public.test_questions(id) on delete cascade,
  points numeric(6, 2) not null check (points >= 0),
  comment text check (comment is null or length(comment) <= 4000),
  marked_by_user_id uuid references public.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (submission_id, question_id)
);
create index test_marks_question_id_idx on public.test_marks (question_id);

create function public.tg_tests_guard_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Questions lock on publish, so a test can't go back to being editable.
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'A published test cannot return to draft';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger tests_guard_status
  before update on public.tests
  for each row execute function public.tg_tests_guard_status();

create function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select login.student_id
    from public.student_logins login
    join public.students student on student.id = login.student_id
   where login.auth_user_id = auth.uid()
     and student.archived_at is null;
$$;

create function public.student_can_see_test(p_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.tests test
      join public.student_classroom_enrollments enrollment
        on enrollment.classroom_id = test.classroom_id
     where test.id = p_test_id
       and test.status = 'published'
       and enrollment.end_date is null
       and enrollment.student_id = public.current_student_id()
  );
$$;

-- Questions and answers disappear once submitted, so nobody using the student's
-- login can read the work afterwards.
create function public.student_can_answer_test(p_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.student_can_see_test(p_test_id)
    and not exists (
      select 1
        from public.test_submissions submission
       where submission.test_id = p_test_id
         and submission.student_id = public.current_student_id()
         and submission.status = 'submitted'
    );
$$;

create function public.staff_can_manage_test(p_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.tests test
     where test.id = p_test_id
       and test.school_id = public.current_user_school_id()
       and (
         public.current_user_is_admin()
         or test.classroom_id in (select public.teacher_active_classroom_ids())
       )
  );
$$;

create function public.test_is_draft(p_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tests where id = p_test_id and status = 'draft');
$$;

create function public.staff_can_manage_submission(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.test_submissions submission
     where submission.id = p_submission_id
       and public.staff_can_manage_test(submission.test_id)
  );
$$;

create function public.submission_is_submitted(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.test_submissions where id = p_submission_id and status = 'submitted'
  );
$$;

create function public.student_owns_open_submission(p_submission_id uuid, p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.test_submissions submission
      join public.test_questions question on question.test_id = submission.test_id
     where submission.id = p_submission_id
       and question.id = p_question_id
       and submission.student_id = public.current_student_id()
       and submission.status = 'in_progress'
       and public.student_can_answer_test(submission.test_id)
  );
$$;

-- Students can't read the students table, which holds notes and birth dates.
create function public.current_student_profile()
returns table (student_id uuid, display_name text, school_name text, login_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select student.id,
         coalesce(nullif(btrim(student.preferred_name), ''), student.first_name),
         school.name,
         login.login_code
    from public.student_logins login
    join public.students student on student.id = login.student_id
    join public.schools school on school.id = student.school_id
   where login.auth_user_id = auth.uid()
     and student.archived_at is null;
$$;

create function public.submit_test(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.test_submissions submission
     set status = 'submitted',
         submitted_at = now()
   where submission.id = p_submission_id
     and submission.student_id = public.current_student_id()
     and submission.status = 'in_progress'
     and public.student_can_see_test(submission.test_id);
  if not found then
    raise exception 'This test can no longer be submitted';
  end if;
end;
$$;

-- Runs as the caller, so row level security decides who may change the test,
-- and the delete and inserts succeed or fail together.
create function public.save_test_questions(p_test_id uuid, p_questions jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_question jsonb;
  v_question_id uuid;
  v_position integer := 0;
begin
  if not exists (select 1 from public.tests where id = p_test_id and status = 'draft') then
    raise exception 'Only a draft test can be edited';
  end if;

  delete from public.test_questions where test_id = p_test_id;

  for v_question in select value from jsonb_array_elements(p_questions)
  loop
    insert into public.test_questions (test_id, position, kind, prompt, options, points)
    values (
      p_test_id,
      v_position,
      v_question ->> 'kind',
      v_question ->> 'prompt',
      nullif(v_question -> 'options', 'null'::jsonb),
      (v_question ->> 'points')::numeric
    )
    returning id into v_question_id;

    if v_question ->> 'correctOption' is not null or v_question ->> 'correctNumber' is not null then
      insert into public.test_answer_keys (question_id, correct_option, correct_number)
      values (
        v_question_id,
        (v_question ->> 'correctOption')::integer,
        (v_question ->> 'correctNumber')::numeric
      );
    end if;

    v_position := v_position + 1;
  end loop;
end;
$$;

do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'current_student_id()',
    'student_can_see_test(uuid)',
    'student_can_answer_test(uuid)',
    'staff_can_manage_test(uuid)',
    'test_is_draft(uuid)',
    'staff_can_manage_submission(uuid)',
    'submission_is_submitted(uuid)',
    'student_owns_open_submission(uuid, uuid)',
    'current_student_profile()',
    'submit_test(uuid)',
    'save_test_questions(uuid, jsonb)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', v_function);
    execute format('grant execute on function public.%s to authenticated, service_role', v_function);
  end loop;
end;
$$;

alter table public.student_logins enable row level security;
alter table public.tests enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_answer_keys enable row level security;
alter table public.test_submissions enable row level security;
alter table public.test_answers enable row level security;
alter table public.test_marks enable row level security;

-- Logins are written only by the server, with the service role.
create policy "student logins staff read"
  on public.student_logins for select to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or student_id in (select public.teacher_visible_student_ids())
    )
  );

-- Checks the row's own columns: a helper that looks the test up by id can't see
-- a row inserted in the same statement, which would break insert ... returning.
create policy "tests staff read"
  on public.tests for select to authenticated
  using (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or classroom_id in (select public.teacher_active_classroom_ids())
    )
  );

create policy "tests staff insert"
  on public.tests for insert to authenticated
  with check (
    status = 'draft'
    and school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or classroom_id in (select public.teacher_active_classroom_ids())
    )
  );

create policy "tests staff update"
  on public.tests for update to authenticated
  using (public.staff_can_manage_test(id))
  with check (
    school_id = (select public.current_user_school_id())
    and (
      (select public.current_user_is_admin())
      or classroom_id in (select public.teacher_active_classroom_ids())
    )
  );

create policy "tests staff delete drafts"
  on public.tests for delete to authenticated
  using (status = 'draft' and public.staff_can_manage_test(id));

create policy "tests student read"
  on public.tests for select to authenticated
  using (public.student_can_see_test(id));

create policy "questions staff read"
  on public.test_questions for select to authenticated
  using (public.staff_can_manage_test(test_id));

create policy "questions staff insert while draft"
  on public.test_questions for insert to authenticated
  with check (public.staff_can_manage_test(test_id) and public.test_is_draft(test_id));

create policy "questions staff delete while draft"
  on public.test_questions for delete to authenticated
  using (public.staff_can_manage_test(test_id) and public.test_is_draft(test_id));

create policy "questions student read while answering"
  on public.test_questions for select to authenticated
  using (public.student_can_answer_test(test_id));

create policy "answer keys staff read"
  on public.test_answer_keys for select to authenticated
  using (
    exists (
      select 1 from public.test_questions question
       where question.id = question_id
         and public.staff_can_manage_test(question.test_id)
    )
  );

create policy "answer keys staff insert while draft"
  on public.test_answer_keys for insert to authenticated
  with check (
    exists (
      select 1 from public.test_questions question
       where question.id = question_id
         and public.staff_can_manage_test(question.test_id)
         and public.test_is_draft(question.test_id)
    )
  );

create policy "submissions staff read"
  on public.test_submissions for select to authenticated
  using (public.staff_can_manage_test(test_id));

create policy "submissions student read own"
  on public.test_submissions for select to authenticated
  using (student_id = (select public.current_student_id()));

create policy "submissions student start"
  on public.test_submissions for insert to authenticated
  with check (
    student_id = (select public.current_student_id())
    and status = 'in_progress'
    and submitted_at is null
    and public.student_can_answer_test(test_id)
  );

create policy "answers staff read"
  on public.test_answers for select to authenticated
  using (public.staff_can_manage_submission(submission_id));

create policy "answers student read while open"
  on public.test_answers for select to authenticated
  using (public.student_owns_open_submission(submission_id, question_id));

create policy "answers student insert while open"
  on public.test_answers for insert to authenticated
  with check (public.student_owns_open_submission(submission_id, question_id));

create policy "answers student update while open"
  on public.test_answers for update to authenticated
  using (public.student_owns_open_submission(submission_id, question_id))
  with check (public.student_owns_open_submission(submission_id, question_id));

create policy "marks staff read"
  on public.test_marks for select to authenticated
  using (public.staff_can_manage_submission(submission_id));

create policy "marks staff insert"
  on public.test_marks for insert to authenticated
  with check (
    public.staff_can_manage_submission(submission_id)
    and public.submission_is_submitted(submission_id)
  );

create policy "marks staff update"
  on public.test_marks for update to authenticated
  using (public.staff_can_manage_submission(submission_id))
  with check (
    public.staff_can_manage_submission(submission_id)
    and public.submission_is_submitted(submission_id)
  );
