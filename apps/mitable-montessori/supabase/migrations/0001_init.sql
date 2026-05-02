-- Mitable Montessori — initial schema
-- 17 tables: tenancy, roster, curriculum, command log, projections, reports, audit.

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. Organizational
-- =============================================================================

create table schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 2. Identity (admins + teachers share one table, role-gated)
-- =============================================================================

create table users (
  id              uuid primary key,                    -- matches auth.users.id
  school_id       uuid not null references schools(id),
  role            text not null check (role in ('admin', 'teacher')),
  first_name      text,
  last_name       text,
  email           text not null,
  phone           text,
  password_hash   text,
  status          text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  privacy_acknowledged_at timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (school_id, email)
);

-- =============================================================================
-- 3. Curriculum (must come before classrooms because classrooms.curriculum_id refs it)
-- =============================================================================

create table curricula (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references schools(id),
  name                text not null,
  framework           text not null default 'Montessori',
  description         text,
  is_active           boolean not null default true,
  created_by_user_id  uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table curriculum_topics (
  id             uuid primary key default gen_random_uuid(),
  curriculum_id  uuid not null references curricula(id),
  name           text not null,
  sort_order     int  not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table curriculum_subtopics (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references curriculum_topics(id),
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  aliases     text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- 4. Classrooms + teacher assignments
-- =============================================================================

create table classrooms (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id),
  curriculum_id  uuid references curricula(id),
  name           text not null,
  code           text,
  status         text not null default 'active' check (status in ('active', 'archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table classroom_teacher_assignments (
  id               uuid primary key default gen_random_uuid(),
  classroom_id     uuid not null references classrooms(id),
  teacher_user_id  uuid not null references users(id),
  classroom_role   text check (classroom_role in ('lead', 'support', 'assistant')),
  start_date       date not null,
  end_date         date,
  created_at       timestamptz not null default now()
);

create unique index classroom_teacher_active_unique
  on classroom_teacher_assignments (classroom_id, teacher_user_id)
  where end_date is null;

-- =============================================================================
-- 5. Roster + guardians
-- =============================================================================

create table students (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id),
  first_name      text not null,
  last_name       text not null,
  preferred_name  text,
  birth_date      date,
  nicknames       text[] not null default '{}',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);

create table student_classroom_enrollments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id),
  classroom_id  uuid not null references classrooms(id),
  start_date    date not null,
  end_date      date,
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now()
);

create unique index student_active_primary_enrollment_unique
  on student_classroom_enrollments (student_id)
  where end_date is null and is_primary = true;

create table guardians (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references schools(id),
  first_name               text not null,
  last_name                text not null,
  email                    text,
  phone                    text,
  preferred_contact_method text check (preferred_contact_method in ('email', 'phone', 'either')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table student_guardians (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references students(id),
  guardian_id         uuid not null references guardians(id),
  relationship        text check (relationship in ('mother', 'father', 'guardian', 'other')),
  is_primary_contact  boolean not null default false,
  receives_reports    boolean not null default true,
  created_at          timestamptz not null default now()
);

-- =============================================================================
-- 6. Command log (append-only, idempotent via client_id)
-- =============================================================================

create table commands (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null unique,
  school_id       uuid not null references schools(id),
  user_id         uuid not null references users(id),
  classroom_id    uuid not null references classrooms(id),
  source          text not null check (source in ('voice', 'photo', 'text')),
  raw_transcript  text,
  command_type    text not null,
  payload         jsonb not null,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz not null,
  retracts_id     uuid references commands(id)
);

create index commands_school_created_idx on commands (school_id, created_at desc);
create index commands_user_created_idx   on commands (user_id, created_at desc);

-- =============================================================================
-- 7. Derived projections
-- =============================================================================

create table attendance_records (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references students(id),
  classroom_id       uuid not null references classrooms(id),
  attendance_date    date not null,
  status             text not null check (status in ('present', 'absent')),
  comment            text,
  marked_by_user_id  uuid references users(id),
  source_command_id  uuid references commands(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (student_id, attendance_date)
);

create table student_progress (
  id                     uuid primary key default gen_random_uuid(),
  student_id             uuid not null references students(id),
  classroom_id           uuid not null references classrooms(id),
  curriculum_subtopic_id uuid not null references curriculum_subtopics(id),
  status                 text not null check (status in ('introduced', 'practicing', 'mastered', 'na')),
  comment                text,
  updated_by_user_id     uuid references users(id),
  source_command_id      uuid references commands(id),
  updated_at             timestamptz not null default now(),
  unique (student_id, curriculum_subtopic_id, classroom_id)
);

create table student_progress_history (
  id                     uuid primary key default gen_random_uuid(),
  student_progress_id    uuid references student_progress(id),
  student_id             uuid not null references students(id),
  curriculum_subtopic_id uuid not null references curriculum_subtopics(id),
  previous_status        text,
  new_status             text,
  comment                text,
  changed_by_user_id     uuid references users(id),
  changed_at             timestamptz not null default now()
);

-- =============================================================================
-- 8. Reports + workflow
-- =============================================================================

create table reports (
  id                   uuid primary key default gen_random_uuid(),
  student_id           uuid not null references students(id),
  classroom_id         uuid not null references classrooms(id),
  report_type          text not null check (report_type in ('daily', 'major')),
  period_start         date,
  period_end           date,
  report_date          date,
  status               text not null default 'draft'
                         check (status in ('draft', 'submitted_for_review', 'in_review',
                                           'changes_requested', 'approved', 'sent')),
  title                text,
  body                 text,
  created_by_user_id   uuid references users(id),
  approved_by_user_id  uuid references users(id),
  approved_at          timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table report_review_actions (
  id                uuid primary key default gen_random_uuid(),
  report_id         uuid not null references reports(id),
  action_by_user_id uuid not null references users(id),
  action_type       text not null
                     check (action_type in ('submitted', 'commented', 'edited',
                                            'approved', 'requested_changes', 'sent')),
  notes             text,
  created_at        timestamptz not null default now()
);

create table report_recipients (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references reports(id),
  guardian_id     uuid not null references guardians(id),
  email_snapshot  text,
  delivery_status text not null default 'pending'
                    check (delivery_status in ('pending', 'sent', 'failed')),
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- 9. Audit log
-- =============================================================================

create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references users(id),
  actor_role   text check (actor_role in ('admin', 'teacher', 'system')),
  action       text not null,
  target_table text,
  target_id    uuid,
  prompt       text,
  metadata     jsonb,
  occurred_at  timestamptz not null default now()
);

create index audit_log_occurred_idx on audit_log (occurred_at desc);

-- =============================================================================
-- 10. Per-school crypto salt (used to derive Dexie at-rest encryption key)
-- =============================================================================

create table school_crypto_salts (
  school_id  uuid primary key references schools(id),
  salt       text not null,
  created_at timestamptz not null default now()
);
