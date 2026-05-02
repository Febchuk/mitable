-- Teacher self-read RLS. The 0002 baseline gates classroom_teacher_assignments
-- + classrooms behind `auth.jwt() ->> 'school_id'`, which only exists if the
-- custom_access_token_hook (0004) is registered in Supabase Studio. Until
-- that hook is wired, teachers can't read their own assignment → the
-- "No active classroom" header.
--
-- This migration adds parallel SELECT policies keyed on `auth.uid()` directly
-- so the teacher app works the moment the user is authenticated, regardless
-- of JWT claim setup. Once the hook is registered, both policies coexist
-- harmlessly (RLS is OR-ed across applicable policies).

-- A teacher can read their own classroom_teacher_assignments rows.
drop policy if exists "teacher reads own assignments" on classroom_teacher_assignments;
create policy "teacher reads own assignments"
  on classroom_teacher_assignments
  for select
  using (teacher_user_id = auth.uid());

-- A teacher can read classrooms they're actively assigned to.
drop policy if exists "teacher reads own classrooms" on classrooms;
create policy "teacher reads own classrooms"
  on classrooms
  for select
  using (
    id in (
      select classroom_id from classroom_teacher_assignments
      where teacher_user_id = auth.uid()
        and end_date is null
    )
  );

-- A teacher can read their own users row (so the layout's getCurrentUserContext
-- works without depending on the school_id JWT claim).
drop policy if exists "teacher reads own profile" on users;
create policy "teacher reads own profile"
  on users
  for select
  using (id = auth.uid());

-- A teacher can read curricula assigned to any of their active classrooms,
-- plus the topics + subtopics under those curricula.
drop policy if exists "teacher reads classroom curricula" on curricula;
create policy "teacher reads classroom curricula"
  on curricula
  for select
  using (
    id in (
      select curriculum_id from classrooms
      where curriculum_id is not null
        and id in (
          select classroom_id from classroom_teacher_assignments
          where teacher_user_id = auth.uid() and end_date is null
        )
    )
  );

drop policy if exists "teacher reads classroom topics" on curriculum_topics;
create policy "teacher reads classroom topics"
  on curriculum_topics
  for select
  using (
    curriculum_id in (
      select curriculum_id from classrooms
      where curriculum_id is not null
        and id in (
          select classroom_id from classroom_teacher_assignments
          where teacher_user_id = auth.uid() and end_date is null
        )
    )
  );

drop policy if exists "teacher reads classroom subtopics" on curriculum_subtopics;
create policy "teacher reads classroom subtopics"
  on curriculum_subtopics
  for select
  using (
    topic_id in (
      select id from curriculum_topics
      where curriculum_id in (
        select curriculum_id from classrooms
        where curriculum_id is not null
          and id in (
            select classroom_id from classroom_teacher_assignments
            where teacher_user_id = auth.uid() and end_date is null
          )
      )
    )
  );

-- A teacher can read students enrolled in their active classrooms (matches
-- the 0002 baseline scope but keyed on auth.uid() rather than the JWT claim).
drop policy if exists "teacher reads enrolled students" on students;
create policy "teacher reads enrolled students"
  on students
  for select
  using (
    id in (
      select student_id from student_classroom_enrollments
      where end_date is null
        and classroom_id in (
          select classroom_id from classroom_teacher_assignments
          where teacher_user_id = auth.uid() and end_date is null
        )
    )
  );

-- And the enrollments themselves, so the pull sync can hydrate Dexie.
drop policy if exists "teacher reads classroom enrollments" on student_classroom_enrollments;
create policy "teacher reads classroom enrollments"
  on student_classroom_enrollments
  for select
  using (
    classroom_id in (
      select classroom_id from classroom_teacher_assignments
      where teacher_user_id = auth.uid() and end_date is null
    )
  );

-- Teachers also need to read student_guardians for the students in their
-- classrooms (used by the report send flow + future parent-link UX).
drop policy if exists "teacher reads classroom student_guardians" on student_guardians;
create policy "teacher reads classroom student_guardians"
  on student_guardians
  for select
  using (
    student_id in (
      select student_id from student_classroom_enrollments
      where end_date is null
        and classroom_id in (
          select classroom_id from classroom_teacher_assignments
          where teacher_user_id = auth.uid() and end_date is null
        )
    )
  );
