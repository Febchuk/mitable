-- Phase 4 admin RLS expansion. Per the IMPLEMENTATION_PLAN.md §3.3, admins
-- write the roster, classrooms, curriculum, and guardians within their school.
-- The 0002_rls migration set teacher-side policies; this layer adds admin
-- writes scoped by JWT `school_id` + `role = 'admin'`.

-- Macro pattern, repeated for each admin-writable table:
--   create policy "admins write <table>" on <table> for all using (
--     school_id = (auth.jwt() ->> 'school_id')::uuid
--     and (auth.jwt() ->> 'role') = 'admin'
--   );
--
-- For tables without a direct school_id column (joins), we route through the
-- relevant parent (classroom_teacher_assignments → classrooms.school_id, etc.).

-- students: written via update_student / archive_student; admins control the
-- whole roster within their school.
drop policy if exists "admins write students" on students;
create policy "admins write students" on students for all using (
  school_id = (auth.jwt() ->> 'school_id')::uuid
  and (auth.jwt() ->> 'role') = 'admin'
);

-- guardians: same scope.
drop policy if exists "admins write guardians" on guardians;
create policy "admins write guardians" on guardians for all using (
  school_id = (auth.jwt() ->> 'school_id')::uuid
  and (auth.jwt() ->> 'role') = 'admin'
);

-- classrooms: same scope.
drop policy if exists "admins write classrooms" on classrooms;
create policy "admins write classrooms" on classrooms for all using (
  school_id = (auth.jwt() ->> 'school_id')::uuid
  and (auth.jwt() ->> 'role') = 'admin'
);

-- curricula: same scope.
drop policy if exists "admins write curricula" on curricula;
create policy "admins write curricula" on curricula for all using (
  school_id = (auth.jwt() ->> 'school_id')::uuid
  and (auth.jwt() ->> 'role') = 'admin'
);

-- curriculum_topics: routed through curricula.school_id.
drop policy if exists "admins write curriculum_topics" on curriculum_topics;
create policy "admins write curriculum_topics" on curriculum_topics for all using (
  curriculum_id in (
    select id from curricula
    where school_id = (auth.jwt() ->> 'school_id')::uuid
  )
  and (auth.jwt() ->> 'role') = 'admin'
);

-- curriculum_subtopics: routed through curriculum_topics → curricula.
drop policy if exists "admins write curriculum_subtopics" on curriculum_subtopics;
create policy "admins write curriculum_subtopics" on curriculum_subtopics for all using (
  topic_id in (
    select id from curriculum_topics
    where curriculum_id in (
      select id from curricula
      where school_id = (auth.jwt() ->> 'school_id')::uuid
    )
  )
  and (auth.jwt() ->> 'role') = 'admin'
);

-- classroom_teacher_assignments: routed through classrooms.
drop policy if exists "admins write classroom_teacher_assignments" on classroom_teacher_assignments;
create policy "admins write classroom_teacher_assignments" on classroom_teacher_assignments for all using (
  classroom_id in (
    select id from classrooms
    where school_id = (auth.jwt() ->> 'school_id')::uuid
  )
  and (auth.jwt() ->> 'role') = 'admin'
);

-- student_classroom_enrollments: routed through classrooms.
drop policy if exists "admins write student_classroom_enrollments" on student_classroom_enrollments;
create policy "admins write student_classroom_enrollments" on student_classroom_enrollments for all using (
  classroom_id in (
    select id from classrooms
    where school_id = (auth.jwt() ->> 'school_id')::uuid
  )
  and (auth.jwt() ->> 'role') = 'admin'
);

-- student_guardians: routed through students.
drop policy if exists "admins write student_guardians" on student_guardians;
create policy "admins write student_guardians" on student_guardians for all using (
  student_id in (
    select id from students
    where school_id = (auth.jwt() ->> 'school_id')::uuid
  )
  and (auth.jwt() ->> 'role') = 'admin'
);

-- users (admin invites): admins can insert/update teachers and other admins
-- within their school.
drop policy if exists "admins write users" on users;
create policy "admins write users" on users for all using (
  school_id = (auth.jwt() ->> 'school_id')::uuid
  and (auth.jwt() ->> 'role') = 'admin'
);

-- audit_log: read-only for admins (their school only). The audit row is
-- inserted server-side via service role on every admin action.
drop policy if exists "admins read audit_log" on audit_log;
create policy "admins read audit_log" on audit_log for select using (
  (auth.jwt() ->> 'school_id')::uuid is not null
  and (auth.jwt() ->> 'role') = 'admin'
  and actor_id in (select id from users where school_id = (auth.jwt() ->> 'school_id')::uuid)
);
