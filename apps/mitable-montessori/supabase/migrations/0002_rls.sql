-- Day-one RLS policies. Phase 1 needs read on roster/curriculum and insert on commands.
-- Admin write + guardian read policies are present but unused until Phases 4 and 5.

alter table schools                       enable row level security;
alter table users                         enable row level security;
alter table classrooms                    enable row level security;
alter table classroom_teacher_assignments enable row level security;
alter table students                      enable row level security;
alter table student_classroom_enrollments enable row level security;
alter table guardians                     enable row level security;
alter table student_guardians             enable row level security;
alter table curricula                     enable row level security;
alter table curriculum_topics             enable row level security;
alter table curriculum_subtopics          enable row level security;
alter table commands                      enable row level security;
alter table attendance_records            enable row level security;
alter table student_progress              enable row level security;
alter table student_progress_history      enable row level security;
alter table reports                       enable row level security;
alter table report_review_actions         enable row level security;
alter table report_recipients             enable row level security;
alter table audit_log                     enable row level security;
alter table school_crypto_salts           enable row level security;

-- =============================================================================
-- 1. Self-read: any authenticated user can read their own users row
-- =============================================================================

create policy "users read self" on users
  for select using (id = auth.uid());

create policy "users update self privacy" on users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- =============================================================================
-- 2. School-scoped reads on roster/curriculum (any school member)
-- =============================================================================

create policy "scoped read schools" on schools
  for select using (id = (auth.jwt() ->> 'school_id')::uuid);

create policy "scoped read classrooms" on classrooms
  for select using (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy "scoped read classroom_teachers" on classroom_teacher_assignments
  for select using (
    classroom_id in (
      select id from classrooms where school_id = (auth.jwt() ->> 'school_id')::uuid
    )
  );

create policy "scoped read students" on students
  for select using (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy "scoped read enrollments" on student_classroom_enrollments
  for select using (
    student_id in (
      select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid
    )
  );

create policy "scoped read guardians" on guardians
  for select using (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy "scoped read student_guardians" on student_guardians
  for select using (
    student_id in (
      select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid
    )
  );

create policy "scoped read curricula" on curricula
  for select using (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy "scoped read curriculum_topics" on curriculum_topics
  for select using (
    curriculum_id in (
      select id from curricula where school_id = (auth.jwt() ->> 'school_id')::uuid
    )
  );

create policy "scoped read curriculum_subtopics" on curriculum_subtopics
  for select using (
    topic_id in (
      select id from curriculum_topics
      where curriculum_id in (
        select id from curricula where school_id = (auth.jwt() ->> 'school_id')::uuid
      )
    )
  );

create policy "scoped read salts" on school_crypto_salts
  for select using (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- =============================================================================
-- 3. Commands: teachers can insert for their actively-assigned classrooms;
--    school members can read their school's commands; commands are immutable.
-- =============================================================================

create policy "scoped read commands" on commands
  for select using (school_id = (auth.jwt() ->> 'school_id')::uuid);

create policy "teachers insert own commands" on commands
  for insert with check (
    user_id = auth.uid()
    and classroom_id in (
      select classroom_id from classroom_teacher_assignments
      where teacher_user_id = auth.uid() and end_date is null
    )
  );

create policy "no command updates" on commands for update using (false);
create policy "no command deletes" on commands for delete using (false);

-- =============================================================================
-- 4. Projections: school-scoped reads
-- =============================================================================

create policy "scoped read attendance" on attendance_records
  for select using (
    student_id in (select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid)
  );

create policy "scoped read progress" on student_progress
  for select using (
    student_id in (select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid)
  );

create policy "scoped read progress_history" on student_progress_history
  for select using (
    student_id in (select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid)
  );

-- Projections are written by the AFTER INSERT trigger in 0003 (security definer),
-- so no INSERT/UPDATE policies are needed for normal usage.

-- =============================================================================
-- 5. Reports: school-scoped reads (sufficient for Phase 1; Phase 3+ adds writes)
-- =============================================================================

create policy "scoped read reports" on reports
  for select using (
    student_id in (select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid)
  );

create policy "scoped read review_actions" on report_review_actions
  for select using (
    report_id in (select id from reports where student_id in (
      select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid
    ))
  );

create policy "scoped read recipients" on report_recipients
  for select using (
    report_id in (select id from reports where student_id in (
      select id from students where school_id = (auth.jwt() ->> 'school_id')::uuid
    ))
  );

-- =============================================================================
-- 6. Audit log: admins read all; everyone may insert their own audit rows
--    (server inserts via service role bypass RLS anyway)
-- =============================================================================

create policy "admins read audit" on audit_log
  for select using (
    (auth.jwt() ->> 'school_id') is not null
    and (auth.jwt() ->> 'role') = 'admin'
  );

-- =============================================================================
-- 7. Admin write policies (Phase 4 — bodies in place but no admin UI yet)
-- =============================================================================

create policy "admins write students" on students
  for all using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  ) with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  );

create policy "admins write classrooms" on classrooms
  for all using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  ) with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  );

create policy "admins write classroom_teachers" on classroom_teacher_assignments
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

create policy "admins write enrollments" on student_classroom_enrollments
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

create policy "admins write guardians" on guardians
  for all using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  ) with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  );

create policy "admins write student_guardians" on student_guardians
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

create policy "admins write curricula" on curricula
  for all using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  ) with check (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  );

create policy "admins write topics" on curriculum_topics
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

create policy "admins write subtopics" on curriculum_subtopics
  for all using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

-- =============================================================================
-- 8. Guardian read policies (Phase 5 — bodies in place but no parent app yet)
-- =============================================================================

create policy "guardians see linked students" on students
  for select using (
    id in (
      select student_id from student_guardians
      where guardian_id = (auth.jwt() ->> 'guardian_id')::uuid
    )
  );

create policy "guardians see sent reports" on reports
  for select using (
    status = 'sent'
    and id in (
      select report_id from report_recipients
      where guardian_id = (auth.jwt() ->> 'guardian_id')::uuid
    )
  );
