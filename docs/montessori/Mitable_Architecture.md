# Mitable — Architecture

Prototype architecture for the Montessori reporting app. Privacy-first, local-first, with AI-assisted capture for teachers and AI-assisted configuration for admins.

## 1. Stack

### Device (PWA)

| Layer              | Choice                           | Notes                                                    |
| ------------------ | -------------------------------- | -------------------------------------------------------- |
| Framework          | Next.js (App Router)             | Deployed as a PWA via `next-pwa` or Serwist              |
| On-device ML       | `transformers.js` in Web Workers | Whisper-tiny for teacher dictation, Tesseract.js for OCR |
| Fuzzy matching     | Fuse.js                          | Roster-based name and activity resolution                |
| Local storage      | Dexie (IndexedDB)                | Roster cache, command log, projections                   |
| Encryption at rest | Web Crypto API                   | Roster encrypted in IndexedDB                            |
| Validation         | Zod                              | All schema boundaries                                    |

### Server

| Layer | Choice                              | Notes                                                                 |
| ----- | ----------------------------------- | --------------------------------------------------------------------- |
| API   | Next.js route handlers (`route.ts`) | Stateless LLM proxy, no PII storage                                   |
| LLM   | Anthropic Claude                    | Haiku for command parsing, Sonnet for report drafting and admin agent |
| Auth  | Supabase Auth (JWT)                 | Same auth used for API and database                                   |

### Database

| Layer            | Choice                      | Notes                                                                          |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------ |
| System of record | Supabase (Postgres)         | Roster, command log, projections, audit log                                    |
| Access control   | Postgres Row-Level Security | Keyed to `school_id`, `users.role`, and active `classroom_teacher_assignments` |

### Privacy invariants

1. **Audio and photos never leave the device.** Discarded immediately after on-device transcription/OCR.
2. **References to existing entities are tokenized before LLM calls.** Names become `[STUDENT_017]` style tokens; the model reasons in token-space.
3. **Creation flows are single-turn and isolated.** New student/class/activity data goes to the LLM once, for field extraction only, never as part of a conversational context.
4. **Commands are append-only and immutable once approved.** Edits and undos are new commands referencing the original.

## 2. Architecture diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEVICE  (Next.js PWA)                                              │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │  Floating AI chat (bottom-right, on every route)            │  │
│   │  ─────────────────────────────────────────────────────────  │  │
│   │  mic / camera / text input                                  │  │
│   │           │                                                 │  │
│   │           ▼                                                 │  │
│   │  Web workers (Whisper + Tesseract)                          │  │
│   │           │                                                 │  │
│   │           ▼                                                 │  │
│   │  Tokenizer (Fuse.js + local roster)                         │  │
│   │           │                                                 │  │
│   │           ▼                                                 │  │
│   │  LLM client → /api/parse-command (tokenized payload)        │  │
│   │           │                                                 │  │
│   │           ▼                                                 │  │
│   │  Tool calls returned → de-tokenized                         │  │
│   │           │                                                 │  │
│   │           ▼                                                 │  │
│   │  Inline review cards in chat thread                         │  │
│   │  approve / edit / reject (no separate review page)          │  │
│   └────────────────────────┬────────────────────────────────────┘  │
│                            │                                        │
│                            ▼                                        │
│   ┌──────────────────────────────────────────┐                     │
│   │  Dexie (IndexedDB)                       │                     │
│   │  roster · guardians · curriculum         │                     │
│   │  commands · projections                  │                     │
│   │  encrypted at rest (Web Crypto)          │                     │
│   └──────────────┬───────────────────────────┘                     │
│                  │                                                  │
│                  ▼                                                  │
│   ┌──────────────────────┐                                         │
│   │  Sync layer          │ push cmds · pull roster                 │
│   └──────────┬───────────┘                                         │
└──────────────│──────────────────────────────────────────────────────┘
               │
   ════════════│══════════════════════════════════════════════════════
   network     │  boundary — tokenized payloads only;
   no audio    │  no images; no PII for existing entities
   ════════════│══════════════════════════════════════════════════════
               │
┌──────────────│──────────────────────────────────────────────────────┐
│  NEXT.JS API (route handlers, stateless)                            │
│              ▼                                                       │
│   ┌─────────────────────────┐    ┌──────────────────────────────┐  │
│   │  /api/parse-command     │    │  /api/draft-report           │  │
│   │  Claude Haiku, tools    │    │  Claude Sonnet, tools        │  │
│   └─────────────────────────┘    └──────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────┐    ┌──────────────────────────────┐  │
│   │  /api/admin/agent       │    │  /api/admin/create           │  │
│   │  Claude Sonnet, tools   │    │  plain CRUD (form submit)    │  │
│   └─────────────────────────┘    └──────────────────────────────┘  │
│                                                                     │
│   ┌─────────────────────────┐                                      │
│   │  /api/sync/commands     │  ──── only endpoint that writes ──── │
│   │  validates + inserts    │       to Supabase                    │
│   └────────────┬────────────┘                                      │
└────────────────│────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SUPABASE  (Postgres + Auth + RLS)                                  │
│                                                                     │
│   schools · users · classrooms · students · guardians               │
│   classroom_teacher_assignments · student_classroom_enrollments     │
│   student_guardians                                                 │
│   curricula · curriculum_topics · curriculum_subtopics              │
│   commands (append-only)                                            │
│   attendance_records · student_progress · student_progress_history  │
│   reports · report_review_actions · report_recipients · audit_log   │
│                                                                     │
│   RLS: users see own school · teachers scoped via assignments       │
│   Commands immutable (no UPDATE / DELETE policies)                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data flow summary

**Teacher capture:** Floating AI chat (bottom-right, present on every authenticated route) accepts mic/camera/text input → worker (Whisper or Tesseract for voice/photo) → tokenizer (Fuse.js + local roster) → LLM client → `/api/parse-command` → tool calls returned as tokenized commands → de-tokenize → rendered as inline review cards inside the chat thread → teacher approves/edits/rejects each card → write to Dexie → sync layer pushes to Supabase. There is no separate review page; review happens in the chat where the proposal was made.

**Admin configuration:** Admin types/dictates intent → tokenizer replaces references to existing entities → `/api/admin/agent` runs a small tool-use loop with read + reference tools → tokenized changes returned → de-tokenize → diff preview → admin approves → writes flow through `/api/sync/commands` (for record changes) or `/api/admin/create` (for new entities, plain CRUD).

**Report drafting:** Triggered explicitly per student per period → `/api/draft-report` runs a 3-5 turn loop with read-only tools (fetches approved commands for the period) → emits tokenized narrative → de-tokenized client-side → `reports` row written in `draft` status, then advanced through the review workflow (`draft → submitted_for_review → in_review → approved → sent`) before `report_recipients` are notified. Teacher-owned daily reports may short-circuit from `draft` to `approved` after teacher review; admin-bound reports run the full workflow.

## 3. Data model

### Supabase (system of record)

```sql
-- Organizational
schools (
  id           uuid primary key,
  name         text not null,
  timezone     text not null,
  status       text not null default 'active',  -- 'active' | 'inactive'
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
)

-- Unified user table — admins and teachers share one identity surface, role-gated
users (
  id              uuid primary key,                 -- matches auth.users.id
  school_id       uuid references schools,
  role            text not null,                    -- 'admin' | 'teacher'
  first_name      text,
  last_name       text,
  email           text not null,
  phone           text,
  password_hash   text,                             -- null when using external auth
  status          text not null default 'invited', -- 'invited' | 'active' | 'disabled'
  last_login_at   timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (school_id, email)
)

classrooms (
  id             uuid primary key,
  school_id      uuid references schools,
  curriculum_id  uuid references curricula,        -- nullable during setup
  name           text not null,
  code           text,
  status         text not null default 'active',   -- 'active' | 'archived'
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
)

-- Multiple teachers per classroom, with role and date range
classroom_teacher_assignments (
  id                uuid primary key,
  classroom_id      uuid references classrooms,
  teacher_user_id   uuid references users,
  classroom_role    text,                          -- 'lead' | 'support' | 'assistant' | null
  start_date        date not null,
  end_date          date,
  created_at        timestamptz default now()
)
-- Only one active assignment per (classroom, teacher) at a time
create unique index classroom_teacher_active_unique
  on classroom_teacher_assignments (classroom_id, teacher_user_id)
  where end_date is null;

-- Roster (real PII lives here)
students (
  id              uuid primary key,
  school_id       uuid references schools,
  first_name      text not null,
  last_name       text not null,
  preferred_name  text,
  birth_date      date,
  nicknames       text[] default '{}',             -- supports fuzzy matching
  notes           text,                            -- e.g. allergies, accommodations
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  archived_at     timestamptz                      -- soft delete
)

-- Students move classrooms over time; one active primary at a time
student_classroom_enrollments (
  id            uuid primary key,
  student_id    uuid references students,
  classroom_id  uuid references classrooms,
  start_date    date not null,
  end_date      date,
  is_primary    boolean not null default true,
  created_at    timestamptz default now()
)
-- Constraint: only one active primary enrollment per student
create unique index student_active_primary_enrollment_unique
  on student_classroom_enrollments (student_id)
  where end_date is null and is_primary = true;

-- Guardians as first-class contacts, decoupled from auth identity
guardians (
  id                         uuid primary key,
  school_id                  uuid references schools,
  first_name                 text not null,
  last_name                  text not null,
  email                      text,
  phone                      text,
  preferred_contact_method   text,                 -- 'email' | 'phone' | 'either'
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now()
)

student_guardians (
  id                  uuid primary key,
  student_id          uuid references students,
  guardian_id         uuid references guardians,
  relationship        text,                        -- 'mother' | 'father' | 'guardian' | 'other'
  is_primary_contact  boolean not null default false,
  receives_reports    boolean not null default true,
  created_at          timestamptz default now()
)

-- Per-school customizable curriculum (Montessori is the default framework)
curricula (
  id                  uuid primary key,
  school_id           uuid references schools,
  name                text not null,
  framework           text not null default 'Montessori',
  description         text,
  is_active           boolean not null default true,
  created_by_user_id  uuid references users,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
)

curriculum_topics (
  id             uuid primary key,
  curriculum_id  uuid references curricula,
  name           text not null,
  sort_order     int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz default now()
)

curriculum_subtopics (
  id          uuid primary key,
  topic_id    uuid references curriculum_topics,
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  aliases     text[] default '{}',                -- supports fuzzy matching
  created_at  timestamptz default now()
)

-- Command log (heart of the system, append-only)
-- All teacher and admin AI-driven mutations originate here; derived projections rebuild from this log.
commands (
  id              uuid primary key,
  client_id       text not null unique,           -- idempotency key from device
  school_id       uuid references schools,
  user_id         uuid references users,          -- the teacher or admin who issued the command
  classroom_id    uuid references classrooms,     -- snapshot of classroom at issue time
  source          text not null,                  -- 'voice' | 'photo' | 'text'
  raw_transcript  text,                           -- what the user said/wrote
  command_type    text not null,                  -- 'attendance' | 'progress' | 'note' | 'retract' | admin types
  payload         jsonb not null,                 -- typed by command_type
  created_at      timestamptz default now(),
  approved_at     timestamptz not null,
  retracts_id     uuid references commands        -- non-null for retract commands
)

-- Derived projections (rebuildable from commands; convenience views for queries)
attendance_records (
  id                  uuid primary key,
  student_id          uuid references students,
  classroom_id        uuid references classrooms,
  attendance_date     date not null,
  status              text not null,              -- 'present' | 'absent'
  comment             text,
  marked_by_user_id   uuid references users,
  source_command_id   uuid references commands,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (student_id, attendance_date)
)

-- Current state of each student × subtopic (one row per pairing per classroom)
student_progress (
  id                       uuid primary key,
  student_id               uuid references students,
  classroom_id             uuid references classrooms,
  curriculum_subtopic_id   uuid references curriculum_subtopics,
  status                   text not null,          -- 'introduced' | 'practicing' | 'mastered' | 'na'
  comment                  text,
  updated_by_user_id       uuid references users,
  source_command_id        uuid references commands,
  updated_at               timestamptz default now(),
  unique (student_id, curriculum_subtopic_id, classroom_id)
)

-- Projection-level audit. Redundant with the commands log but cheap, and gives admin queries
-- an obvious place to look for "who changed what, when".
student_progress_history (
  id                       uuid primary key,
  student_progress_id      uuid references student_progress,
  student_id               uuid references students,
  curriculum_subtopic_id   uuid references curriculum_subtopics,
  previous_status          text,
  new_status               text,
  comment                  text,
  changed_by_user_id       uuid references users,
  changed_at               timestamptz default now()
)

-- Reports replace the old `report_drafts` table; full review workflow
reports (
  id                   uuid primary key,
  student_id           uuid references students,
  classroom_id         uuid references classrooms,
  report_type          text not null,             -- 'daily' | 'major'
  period_start         date,
  period_end           date,
  report_date          date,
  status               text not null default 'draft',
                                                  -- 'draft' | 'submitted_for_review' | 'in_review'
                                                  -- | 'changes_requested' | 'approved' | 'sent'
  title                text,
  body                 text,
  created_by_user_id   uuid references users,     -- the teacher who drafted
  approved_by_user_id  uuid references users,
  approved_at          timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
)

report_review_actions (
  id                  uuid primary key,
  report_id           uuid references reports,
  action_by_user_id   uuid references users,
  action_type         text not null,              -- 'submitted' | 'commented' | 'edited'
                                                  -- | 'approved' | 'requested_changes' | 'sent'
  notes               text,
  created_at          timestamptz default now()
)

report_recipients (
  id               uuid primary key,
  report_id        uuid references reports,
  guardian_id      uuid references guardians,
  email_snapshot   text,                          -- guardian email at time of send (point-in-time copy)
  delivery_status  text not null default 'pending',  -- 'pending' | 'sent' | 'failed'
  sent_at          timestamptz,
  created_at       timestamptz default now()
)

-- General audit log for cross-cutting actions not covered by report_review_actions
-- or student_progress_history (e.g., admin agent invocations, role changes, archives).
audit_log (
  id           uuid primary key,
  actor_id     uuid references users,
  actor_role   text,                              -- 'admin' | 'teacher' | 'system'
  action       text not null,                     -- 'create_student' | 'archive_topic' | etc.
  target_table text,
  target_id    uuid,
  prompt       text,                              -- natural-language input that triggered the action (admin AI)
  metadata     jsonb,
  occurred_at  timestamptz default now()
)
```

### Row-Level Security

```sql
-- Read scope: any school member (admin or teacher) sees their school's data
create policy "scoped read students" on students
  for select using (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- Teachers can only insert commands for classrooms they're actively assigned to
create policy "teachers insert own commands" on commands
  for insert with check (
    user_id = auth.uid()
    and classroom_id in (
      select classroom_id from classroom_teacher_assignments
      where teacher_user_id = auth.uid() and end_date is null
    )
  );

-- Commands are immutable (the append-only invariant)
create policy "no command updates" on commands for update using (false);
create policy "no command deletes" on commands for delete using (false);

-- Admins write the roster, classrooms, curriculum, and guardians within their school
create policy "admins write roster" on students
  for all using (
    school_id = (auth.jwt() ->> 'school_id')::uuid
    and (auth.jwt() ->> 'role') = 'admin'
  );

-- Equivalent admin-write policies exist for: classrooms, classroom_teacher_assignments,
-- student_classroom_enrollments, guardians, student_guardians, curricula,
-- curriculum_topics, curriculum_subtopics.

-- Parents (guardians) see only the students they're linked to and only `sent` reports
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
```

Soft deletes via `archived_at` columns and `status = 'archived'` rather than `DELETE`. Recovery is always possible.

### Dexie (local-first mirror on device)

```typescript
db.version(1).stores({
  // Mirrors of server data, pulled on app load
  roster: "id, [firstName+lastName]", // students
  enrollments: "id, studentId, classroomId, isPrimary", // active classroom membership
  classrooms: "id, curriculumId",
  classroomTeachers: "id, classroomId, teacherUserId", // active assignments

  guardians: "id, [firstName+lastName]",
  studentGuardians: "id, studentId, guardianId, receivesReports",

  curricula: "id, schoolId, isActive",
  curriculumTopics: "id, curriculumId, sortOrder",
  curriculumSubtopics: "id, topicId, sortOrder",

  // Local-only state
  commands: "id, status, createdAt, syncedAt", // status: 'pending' | 'approved' | 'retracted'
  attendanceProj: "[studentId+date]",
  progressProj: "[studentId+subtopicId+classroomId]",
  reports: "id, studentId, status",
  reportRecipients: "id, reportId, guardianId, deliveryStatus",

  // Sync bookkeeping
  syncMeta: "key", // 'roster_pulled_at', 'curriculum_pulled_at', etc.
});
```

The roster (and the guardians table, which also holds PII) is encrypted at rest using Web Crypto API; the encryption key is derived from the user's session and held only in memory.

### Command payload shapes (Zod)

```typescript
const StudentToken = z.string().regex(/^\[STUDENT_\d+\]$/);
const SubtopicToken = z.string().regex(/^\[SUBTOPIC_\d+\]$/);
const ClassroomToken = z.string().regex(/^\[CLASSROOM_\d+\]$/);
const UserToken = z.string().regex(/^\[USER_\d+\]$/);
const GuardianToken = z.string().regex(/^\[GUARDIAN_\d+\]$/);
const CurriculumToken = z.string().regex(/^\[CURRICULUM_\d+\]$/);
const TopicToken = z.string().regex(/^\[TOPIC_\d+\]$/);

// Teacher commands
const AttendancePayload = z.object({
  student_token: StudentToken,
  classroom_token: ClassroomToken,
  status: z.enum(["present", "absent"]),
  date: z.string().date(),
  comment: z.string().optional(),
});

const ProgressPayload = z.object({
  student_token: StudentToken,
  subtopic_token: SubtopicToken,
  classroom_token: ClassroomToken,
  status: z.enum(["introduced", "practicing", "mastered", "na"]),
  comment: z.string().optional(),
});

const NotePayload = z.object({
  student_token: StudentToken,
  text: z.string(),
});

// Admin commands — reference existing entities only. Creation flows are non-LLM.
const TransferStudentPayload = z.object({
  student_token: StudentToken,
  new_classroom_token: ClassroomToken,
  start_date: z.string().date(),
});

const ArchiveStudentPayload = z.object({
  student_token: StudentToken,
  reason: z.string().optional(),
});

const AssignTeacherToClassroomPayload = z.object({
  classroom_token: ClassroomToken,
  teacher_token: UserToken,
  classroom_role: z.enum(["lead", "support", "assistant"]).optional(),
  start_date: z.string().date(),
});

const AssignCurriculumToClassroomPayload = z.object({
  classroom_token: ClassroomToken,
  curriculum_token: CurriculumToken,
});

const LinkGuardianToStudentPayload = z.object({
  student_token: StudentToken,
  guardian_token: GuardianToken,
  relationship: z.enum(["mother", "father", "guardian", "other"]),
  is_primary_contact: z.boolean().default(false),
  receives_reports: z.boolean().default(true),
});

const RenameSubtopicPayload = z.object({
  subtopic_token: SubtopicToken,
  new_name: z.string().min(1),
});

// Report workflow commands — write directly into the `reports` lifecycle.
const SubmitReportForReviewPayload = z.object({
  report_id: z.string().uuid(),
});

const RequestReportChangesPayload = z.object({
  report_id: z.string().uuid(),
  notes: z.string(),
});

const ApproveReportPayload = z.object({
  report_id: z.string().uuid(),
});

const SendReportPayload = z.object({
  report_id: z.string().uuid(),
  guardian_tokens: z.array(GuardianToken).min(1),
});

// Retract — used for undo, references original command
const RetractPayload = z.object({
  command_id: z.string().uuid(),
  reason: z.string().optional(),
});
```

### Tokenization invariant

Tokens are device-local. The mapping `[STUDENT_017] ↔ "Maya Chen"` exists only in Dexie. The server never receives or stores the mapping. Server-side commands store `student_id` (the real UUID), which the client looks up locally before tokenizing for LLM calls.

The token namespace covers every entity that carries PII or that an LLM might be asked to reason about:

| Token            | Resolves to               | PII?                              |
| ---------------- | ------------------------- | --------------------------------- |
| `[STUDENT_n]`    | `students.id`             | yes (name, DOB, notes)            |
| `[GUARDIAN_n]`   | `guardians.id`            | yes (name, email, phone)          |
| `[USER_n]`       | `users.id`                | yes (admin/teacher names, emails) |
| `[CLASSROOM_n]`  | `classrooms.id`           | low (room name)                   |
| `[CURRICULUM_n]` | `curricula.id`            | none                              |
| `[TOPIC_n]`      | `curriculum_topics.id`    | none                              |
| `[SUBTOPIC_n]`   | `curriculum_subtopics.id` | none                              |

Guardians, like students, are tokenized for every LLM call. `[GUARDIAN_n]` resolves locally; the model never sees the parent's name or contact information. When a report is sent, `report_recipients.email_snapshot` captures the guardian's email at send-time as a point-in-time copy, so future guardian email changes don't rewrite delivery history.

The single exception: creation endpoints (`/api/admin/create`) accept plaintext PII for that one call only, with no surrounding conversational context, and write directly to the database without going through the agent loop. This applies equally to creating students, guardians, users, and curricula.

### Schema decision notes

Deliberate choices made when reconciling the proposed 17-table model with the existing privacy-first architecture:

- **Kept the append-only `commands` log alongside `student_progress` / `student_progress_history`.** The proposed schema treats `student_progress` mutations as the source of truth with `student_progress_history` as the audit trail. Here, the `commands` log remains the source of truth and `student_progress` / `attendance_records` / `student_progress_history` are _derived projections_ rebuilt from commands. The history table is technically redundant with the command log but is cheap to maintain and gives admin queries an obvious place to look.
- **Adopted `present | absent` only for attendance** (dropped the existing design's `late`). Matches the proposed schema exactly; the trade-off is recorded in the implementation plan's decision log.
- **Unified `users` table replaces the prior `teachers` table.** `role` is a column, not a separate table. Admins and teachers share one identity surface; capability checks happen in RLS and middleware via `users.role`.
- **Multi-teacher classrooms via `classroom_teacher_assignments`** (replaces `classes.teacher_id`). RLS for command insertion now joins through this table to determine "is this user actively assigned to this classroom?".
- **Student transfers via `student_classroom_enrollments`** (replaces `students.class_id`). History is preserved; the active primary enrollment is enforced via a partial unique index. `commands.classroom_id` is a snapshot taken at command issue time.
- **`guardians` is a first-class table, decoupled from auth.** A guardian record can exist before the parent claims an account. Parent-app login still uses Supabase Auth; the JWT carries `guardian_id` once claimed.
- **Per-school customizable curriculum** (`curricula → curriculum_topics → curriculum_subtopics`). The trackable unit is the subtopic, replacing the flat `activities` table from the prior design. Each classroom is assigned one curriculum.
- **Reports run a full review workflow** (`draft → submitted_for_review → in_review → changes_requested → approved → sent`). Teacher-owned daily reports may short-circuit `draft → approved` after teacher review; admin-bound reports run the full lifecycle. `report_review_actions` captures every transition.
- **`audit_log` retained as the cross-cutting log.** `report_review_actions` and `student_progress_history` cover specific domains; `audit_log` covers everything else (admin agent invocations, role changes, archive operations).
