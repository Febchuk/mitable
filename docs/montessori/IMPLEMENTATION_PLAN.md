# Mitable — Implementation Plan

Companion to the Montessori Prototype PRD. Translates the agreed architecture into a concrete sequence of work, with checkpoints, risks, and decision gates.

---

## 1. Architecture Recap

The system has three runtime zones and one strict privacy invariant.

**Runtime zones**

- **Device (PWA)** — Next.js App Router app running on phone, tablet, or desktop. Handles capture, on-device ML, tokenization, review, and local-first storage.
- **API (route handlers)** — Stateless Next.js route handlers that proxy tokenized text to Claude and forward approved commands to Supabase. No PII storage; no logging of request payloads.
- **System of record (Supabase)** — Postgres + Auth + RLS. Holds the canonical roster, curriculum, command log, derived projections, and audit log.

**Stack**

| Layer          | Choice                                                                                |
| -------------- | ------------------------------------------------------------------------------------- |
| Framework      | Next.js (App Router), deployed to Vercel                                              |
| PWA shell      | next-pwa or Serwist                                                                   |
| On-device ASR  | transformers.js with Whisper-tiny in a Web Worker                                     |
| On-device OCR  | Tesseract.js in a Web Worker                                                          |
| Fuzzy matching | Fuse.js against locally cached roster                                                 |
| Local storage  | Dexie (IndexedDB), with Web Crypto for roster-at-rest encryption                      |
| LLM            | Anthropic SDK — Haiku for command parsing, Sonnet for report drafting and admin agent |
| Validation     | Zod everywhere                                                                        |
| Backend        | Supabase Postgres + Auth + RLS                                                        |

**Privacy invariant**

Tokenize everything except the moment of creation. Reads return tokens. Writes that reference existing entities take tokens. Writes that create new entities take plaintext PII, scoped to that one call, with no surrounding agent context.

**Three honest claims this lets us make**

1. Audio and photos never leave the device.
2. When AI processes observations or admin actions, existing student, guardian, and staff names are anonymized before reaching the model.
3. When new student, guardian, or staff records are created, that data is sent to the model once for field extraction only — never combined with other records, never retained.

---

## 2. Three Apps, One Codebase

| App         | Users                 | Primary surface       | AI pattern                                                                                              |
| ----------- | --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| Teacher app | Teachers, specialists | Mobile/tablet PWA     | Single-turn tool use (Haiku) for command parsing; small agent loop (Sonnet) for report drafting         |
| Admin app   | School admins         | Desktop web           | Multi-turn agent loop (Sonnet) over read + reference tools; creation via constrained extraction-to-form |
| Parent app  | Parents               | Mobile web, read-only | None in v1                                                                                              |

All three live in one Next.js repo, behind separate route prefixes (`/`, `/admin`, `/parents`), separate auth scopes, and separate UI shells. Shared components and shared data layer; isolated agent logic.

---

## 3. Data Model

### 3.1 Supabase schema (canonical)

The full DDL lives in `Mitable_Architecture.md` §3 and is the single source of truth. Summary of the 17 tables and how they group:

```
-- Tenancy and identity
schools                            (id, name, timezone, status, …)
users                              (id, school_id, role admin|teacher, first_name, last_name, email, phone, status, …)

-- Classroom membership
classrooms                         (id, school_id, curriculum_id?, name, code, status, …)
classroom_teacher_assignments      (classroom_id, teacher_user_id, classroom_role, start_date, end_date)
                                   -- unique active per (classroom, teacher) where end_date is null

-- Roster (PII)
students                           (id, school_id, first_name, last_name, preferred_name, birth_date, nicknames, notes, archived_at, …)
student_classroom_enrollments      (student_id, classroom_id, start_date, end_date, is_primary)
                                   -- unique active primary per student
guardians                          (id, school_id, first_name, last_name, email, phone, preferred_contact_method, …)
student_guardians                  (student_id, guardian_id, relationship, is_primary_contact, receives_reports)

-- Curriculum (per-school customizable; Montessori is the default framework)
curricula                          (id, school_id, name, framework, is_active, created_by_user_id, …)
curriculum_topics                  (id, curriculum_id, name, sort_order, is_active)
curriculum_subtopics               (id, topic_id, name, sort_order, is_active, aliases)

-- The append-only command log — heart of the system
commands                           (id, client_id unique, school_id, user_id, classroom_id, source,
                                    raw_transcript, command_type, payload jsonb, created_at, approved_at,
                                    retracts_id → commands)

-- Derived projections (rebuildable from commands)
attendance_records                 (student_id, classroom_id, attendance_date, status present|absent,
                                    comment, marked_by_user_id, source_command_id)
                                   -- unique (student_id, attendance_date)
student_progress                   (student_id, classroom_id, curriculum_subtopic_id,
                                    status introduced|practicing|mastered|na, comment, updated_by_user_id,
                                    source_command_id, updated_at)
                                   -- unique (student_id, curriculum_subtopic_id, classroom_id)
student_progress_history           (student_progress_id, student_id, curriculum_subtopic_id,
                                    previous_status, new_status, comment, changed_by_user_id, changed_at)

-- Reports + workflow
reports                            (id, student_id, classroom_id, report_type daily|major,
                                    period_start, period_end, report_date,
                                    status draft|submitted_for_review|in_review|changes_requested|approved|sent,
                                    title, body, created_by_user_id, approved_by_user_id, approved_at, sent_at)
report_review_actions              (report_id, action_by_user_id,
                                    action_type submitted|commented|edited|approved|requested_changes|sent, notes)
report_recipients                  (report_id, guardian_id, email_snapshot, delivery_status pending|sent|failed, sent_at)

-- Cross-cutting audit (admin agent invocations, role changes, archives)
audit_log                          (actor_id, actor_role, action, target_table, target_id, prompt, metadata, occurred_at)
```

Soft deletes via `archived_at` columns and `status = 'archived'`. Recovery is always possible.

### 3.2 Dexie schema (local mirror, not copy)

```typescript
db.version(1).stores({
  // Mirrored from server
  roster: "id, [firstName+lastName]",
  enrollments: "id, studentId, classroomId, isPrimary",
  classrooms: "id, curriculumId",
  classroomTeachers: "id, classroomId, teacherUserId",

  guardians: "id, [firstName+lastName]",
  studentGuardians: "id, studentId, guardianId, receivesReports",

  curricula: "id, schoolId, isActive",
  curriculumTopics: "id, curriculumId, sortOrder",
  curriculumSubtopics: "id, topicId, sortOrder",

  // Local-only state
  commands: "id, status, createdAt, syncedAt",
  attendanceProj: "[studentId+date]",
  progressProj: "[studentId+subtopicId+classroomId]",
  reports: "id, studentId, status",
  reportRecipients: "id, reportId, guardianId, deliveryStatus",

  syncMeta: "key",
});
```

The roster and guardian tables are encrypted at rest using Web Crypto API; the encryption key is derived from the user's session and stored in `sessionStorage` (cleared on logout).

### 3.3 RLS policies (day-one essentials)

```sql
-- Any school member sees their school's roster
create policy "scoped read students" on students for select
  using (school_id = (auth.jwt() ->> 'school_id')::uuid);

-- Teachers can only insert commands for classrooms they're actively assigned to
create policy "teachers insert own commands" on commands for insert with check (
  user_id = auth.uid()
  and classroom_id in (
    select classroom_id from classroom_teacher_assignments
    where teacher_user_id = auth.uid() and end_date is null
  )
);

-- Commands are immutable
create policy "no command updates" on commands for update using (false);
create policy "no command deletes" on commands for delete using (false);

-- Admins write the roster, classrooms, curriculum, and guardians within their school
create policy "admins write roster" on students for all using (
  school_id = (auth.jwt() ->> 'school_id')::uuid
  and (auth.jwt() ->> 'role') = 'admin'
);
-- Equivalent admin-write policies for: classrooms, classroom_teacher_assignments,
-- student_classroom_enrollments, guardians, student_guardians, curricula,
-- curriculum_topics, curriculum_subtopics.

-- Guardians see only the students they're linked to
create policy "guardians see linked students" on students for select using (
  id in (select student_id from student_guardians
         where guardian_id = (auth.jwt() ->> 'guardian_id')::uuid)
);

-- Guardians see only `sent` reports addressed to them
create policy "guardians see sent reports" on reports for select using (
  status = 'sent'
  and id in (select report_id from report_recipients
             where guardian_id = (auth.jwt() ->> 'guardian_id')::uuid)
);
-- Equivalent guardian-scoped policies for attendance_records, student_progress.
```

Admin policies are scoped per capability and expanded in Phase 4.

---

## 4. The Tool Surface

### 4.1 Teacher tools (single-turn, Haiku)

All inputs tokenized. Model never sees real names.

```typescript
mark_attendance({ student_token, classroom_token, status: 'present'|'absent', date, comment? })
record_progress({ student_token, subtopic_token, classroom_token,
                  status: 'introduced'|'practicing'|'mastered'|'na', comment? })
add_observation_note({ student_token, text })
request_clarification({ question, candidates })
```

### 4.2 Report drafting tools (small agent loop, Sonnet)

Read tools return tokens; the one write tool produces a `draft` row in the `reports` table.

```typescript
get_student_commands({ student_token, period_start, period_end }); // read
get_student_progress_summary({ student_token }); // read
draft_report({
  student_token,
  report_type: "daily" | "major",
  period_start,
  period_end,
  title,
  draft_text,
}); // write → reports.status = 'draft'
```

Teacher-owned daily reports advance directly to `approved` after teacher review. Major reports (and any report bound for admin review) traverse `draft → submitted_for_review → in_review → approved → sent` via the workflow tools below.

### 4.3 Report workflow tools (used by both teacher and admin apps)

Each call writes a `report_review_actions` row alongside the status transition.

```typescript
submit_report_for_review({ report_id }); // draft → submitted_for_review
request_report_changes({ report_id, notes }); // in_review → changes_requested
approve_report({ report_id }); // in_review|submitted_for_review → approved
send_report({ report_id, guardian_tokens }); // approved → sent; writes report_recipients rows
```

### 4.4 Admin tools (multi-turn agent loop, Sonnet)

Reference tools tokenized. Creation tools take plaintext but are isolated to single-turn extraction-to-form, never inside the agent conversation.

```typescript
// Reference (tokenized)
transfer_student({ student_token, new_classroom_token, start_date })  // writes a new enrollment row, ends prior
archive_student({ student_token, reason })
update_student({ student_token, fields })
assign_teacher_to_classroom({ teacher_token, classroom_token,
                              classroom_role?: 'lead'|'support'|'assistant', start_date })
unassign_teacher_from_classroom({ assignment_id, end_date })
assign_curriculum_to_classroom({ classroom_token, curriculum_token })
link_guardian_to_student({ student_token, guardian_token,
                           relationship: 'mother'|'father'|'guardian'|'other',
                           is_primary_contact?, receives_reports? })
unlink_guardian_from_student({ student_token, guardian_token })
rename_subtopic({ subtopic_token, new_name })
archive_subtopic({ subtopic_token })
rename_topic({ topic_token, new_name })

// Read (returns tokens)
list_students_in_classroom({ classroom_token })
list_classrooms()
list_curricula()
list_topics({ curriculum_token })
list_subtopics({ topic_token })
find_subtopic_by_name({ curriculum_token, search })
find_guardian_by_name({ search })

// Creation (NOT part of agent loop — direct CRUD endpoints)
POST /api/admin/users                     { role, first_name, last_name, email, phone? }
POST /api/admin/students                  { first_name, last_name, preferred_name?, birth_date?, ... }
POST /api/admin/guardians                 { first_name, last_name, email?, phone?, preferred_contact_method }
POST /api/admin/classrooms                { name, code?, curriculum_token? }
POST /api/admin/curricula                 { name, framework, description? }
POST /api/admin/curriculum-topics         { curriculum_token, name, sort_order }
POST /api/admin/curriculum-subtopics      { topic_token, name, sort_order, aliases? }
POST /api/admin/import-roster             { csv_data, classroom_token, dry_run }
POST /api/admin/import-curriculum         { csv_data, curriculum_token, dry_run }
```

The agent can _suggest_ a creation by extracting fields from the admin's natural-language input, but the suggestion goes to a confirmation form the admin reviews and submits. The submission itself bypasses the agent.

---

## 5. Sync Layer

Append-only commands with idempotency keys. ~200 lines of code total.

**On app load**

1. Pull roster delta — `select * from students where school_id = X and updated_at > last_pulled_at`
2. Pull active enrollments, classroom-teacher assignments, and guardian links the same way
3. Pull curriculum delta — curricula assigned to the user's classrooms, with their topics and subtopics
4. Pull recent commands for the last 30 days (for projection rebuild context)
5. Update `syncMeta.last_pulled_at`

**On command approval**

1. Write to Dexie with `status: 'approved', syncedAt: null`
2. Update local projections immediately (`attendanceProj`, `progressProj`)
3. UI re-renders from Dexie
4. Background worker POSTs to `/api/sync/commands`
5. Server inserts into `commands` table; triggers update `attendance_records`, `student_progress`, and `student_progress_history`
6. Server returns `{ synced: [client_ids] }`; Dexie sets `syncedAt`

**Offline behavior**

- Steps 1-3 work normally
- Step 4 fails silently and retries on `online` event or app foreground
- UI shows pending-sync count

**Conflict resolution**

- None. Append-only log with `client_id` idempotency
- Two devices submitting commands for the same student produce two log entries
- Projections handle "last write wins" via approval timestamp

Do not reach for PowerSync, ElectricSQL, Replicache, or CRDT libraries. The problem is too small for them and they add operational complexity disproportionate to the value.

---

## 6. Phased Build

Five phases. Each phase ends with a checkpoint that determines whether to proceed, iterate, or pivot.

### Phase 0 — Foundation (Week 1) ✅ Complete

Goal: working repo, working data plumbing, no ML yet.

- [x] Next.js App Router project, TypeScript strict, Tailwind, shadcn/ui
- [x] Supabase project provisioned: 17-table schema, RLS policies, auth, seed script
- [x] Seed: 1 school, 1 admin + 1 teacher in `users`, 1 classroom with the teacher assigned (lead), 1 default Montessori `curricula` row with ~5 topics and ~30 subtopics, 10 students with active primary enrollments, 1–2 guardians per student linked via `student_guardians`
- [x] Dexie schema and migration (roster, enrollments, classrooms, classroomTeachers, guardians, studentGuardians, curricula, curriculumTopics, curriculumSubtopics)
- [x] Roster + curriculum sync on login (pull only)
- [x] Web Crypto encryption for the local roster and guardians tables
- [x] Zod schemas for: command, student, guardian, subtopic, parsed-tool-call
- [x] Empty `/api/parse-command`, `/api/sync/commands`, `/api/draft-report` route handlers with auth middleware
- [x] Audit log schema and helper

**Checkpoint**: a teacher can log in, see their roster + classroom + curriculum pulled into Dexie, and the local store is encrypted at rest. No commands or AI yet.

### Phase 1 — Teacher core loop with text input (Weeks 2–3) ✅ Complete

Goal: full command pipeline working with typed text. Highest-leverage de-risking step.

- [x] Text-input capture UI (mobile-first)
- [x] Client-side tokenizer (Fuse.js + roster cache)
- [x] `/api/parse-command` calling Claude Haiku with the four teacher tools
- [x] De-tokenizer for tool-call responses
- [x] Floating AI chat (bottom-right, present on every authenticated route): renders proposed tool calls as inline review cards in the chat thread with approve/edit/reject controls. No separate review page.
- [x] Approval writes to Dexie, updates projections, queues for sync
- [x] Background sync worker
- [x] Idempotent server-side command insert with projection trigger
- [x] Daily attendance and progress views, reading from local projections
- [x] Privacy onboarding screens
- [x] End-to-end test for the Phase 1 checkpoint scenario (`src/__tests__/phase1-end-to-end.test.ts`)

**Checkpoint**: a teacher can type "mark Maya present and add pink tower practicing" and see two pending commands, approve them, and have them appear in Supabase with correct projections. End-to-end loop works without any ML.

### Phase 2 — Voice and photo capture (Weeks 4–6) ✅ Complete

Goal: the two ML capture modes, with deliberate UX around model loading.

- [x] Web Worker scaffold for transformers.js (`src/lib/capture/worker-host.ts`, `capture.worker.ts`)
- [x] Whisper-tiny integration: model download, caching via service worker, "setting up your classroom" first-run UX (`asr-engine.ts`, `DictationButton` prefetches on mount)
- [x] Push-to-talk dictation UI: tap-to-start, tap-to-stop (`DictationButton.tsx`)
- [x] Transcript flows into the same tokenizer + parse-command pipeline (`parse-pipeline.ts` shared by text/voice/photo)
- [x] Tesseract.js integration in a separate worker (`ocr-engine.ts` over the same worker host)
- [x] In-app camera capture (not gallery import — enforce FR-4) (`camera-capture.ts`, `CameraButton.tsx`)
- [x] OCR result flows into tokenizer + parse-command, treated as a batch of pending commands
- [x] Capture mode A/B test telemetry: voice vs photo vs text completion rates (`lib/telemetry/events.ts`, `/api/v1/telemetry`)
- [x] PWA manifest, install prompts, offline shell (`public/manifest.webmanifest`, `public/sw.js`, `lib/pwa/register.ts`, `/offline` route)
- [x] Weak-network indicator and pending-sync counter (`ConnectionStatus.tsx` next to existing `PendingBadge`)
- [x] End-to-end test for the Phase 2 checkpoint scenario (`src/__tests__/phase2-end-to-end.test.ts` — voice + photo + mixed paths)

**Checkpoint**: dictate a command in a noisy room and have it parse correctly ≥85% of the time. If accuracy is below this, evaluate Whisper-base (heavier) or rethink the dictation UX before proceeding.

> Live ASR/OCR accuracy (the ≥85% bar) requires real on-device measurement
> with `@xenova/transformers` and `tesseract.js` installed and the bundled
> models cached. The codebase ships behind an engine factory
> (`setCaptureFactoriesForTest`) so production swaps in the real engines and
> tests use deterministic stubs; the manual accuracy gate runs as part of the
> Phase 2 checkpoint review, not CI.

### Phase 3 — Report drafting (Weeks 7–8) ✅ Complete

Goal: the second AI workflow, where Sonnet earns its slot.

- [x] `/api/draft-report` with the read + write tool surface; writes a `reports` row in `status = 'draft'` (`src/app/api/v1/ai/draft-report/route.ts`)
- [x] Small agent loop: max 5 turns, hard stop with error (`src/lib/reports/agent-loop.ts`, `MAX_AGENT_TURNS`, `AgentAbortError`)
- [x] Token-only context — read tools return tokens, draft preserves tokens, client de-tokenizes (`SupabaseReportDataAdapter` + `IncrementalTokenizer` server-side; `detokenizeReportText` client-side)
- [x] "Draft daily report" and "Draft major report" UIs (`ReportDraftButton.tsx`, embeddable from any student-context view; the formal student-profile screen lands in Phase 4)
- [x] Pending draft review: full text editing, approve/reject; teacher-owned daily reports may short-circuit `draft → approved` (`ReportReview.tsx`, `/api/v1/reports/approve` honors short-circuit)
- [x] Major reports advance through `submit_report_for_review` (`/api/v1/reports/submit`); admin acts on them in Phase 4 (queue UI lands then)
- [x] Every status transition writes a `report_review_actions` row (`lib/reports/workflow.ts`)
- [x] Token-preservation validator: regex check on draft output, regenerate-on-failure UX (`lib/reports/token-preservation.ts`, agent loop retries up to `MAX_REGENERATIONS = 2` then aborts cleanly)
- [x] End-to-end test for the Phase 3 checkpoint scenario (`src/__tests__/phase3-end-to-end.test.ts` — agent convergence, regeneration on leak, hard cap on max turns, validator unit cases, and workflow state machine)

**Checkpoint**: a teacher can generate a daily report for a student that reads naturally, references actual observations from the week's commands, and contains zero token leakage. Manual evaluation across 10 student weeks. Major-report submission lands in a `submitted_for_review` queue (admin acts on it in Phase 4).

> The "reads naturally" half of the checkpoint is a manual eval — the agent
> loop ships behind a `runReportAgent({ anthropic })` injection so production
> uses Sonnet 4.6 and tests use a deterministic stub. The naturalness gate
> runs as part of the Phase 3 review with real Sonnet calls, not CI.

### Phase 4 — Admin app (Weeks 9–12) ✅ Complete

Goal: school admins can manage roster, classrooms, curriculum, guardians, and the report review workflow, with AI as an accelerator.

**Week 9: plain CRUD admin (no AI)**

- [x] Admin auth (`users.role = 'admin'`), JWT claims for `school_id` and `role`, expanded RLS for admin-write tables (`lib/api/admin-auth.ts`, `supabase/migrations/0006_admin_rls.sql`)
- [ ] Admin UI shell at `/admin/*` (desktop-first, no PWA) — see Phase 4 caveat below
- [x] Manual CRUD endpoints: `/api/admin/{users,students,classrooms,classroom-teachers,student-guardians,guardians,curricula,curriculum-topics,curriculum-subtopics}` — backed by `lib/admin/crud.ts` and `lib/admin/route-helper.ts`
- [x] CSV roster import with conflict detection (`lib/admin/csv.ts`, `/api/admin/import-roster` with `dry_run`)
- [ ] Curriculum builder UI — backend complete (curriculum + topics + subtopics CRUD), UI shell deferred
- [x] Audit log viewer endpoint (`/api/admin/audit`)

**Week 10: read + reference tools**

- [x] Tokenizer integration on admin side covering `[STUDENT]` `[GUARDIAN]` `[USER]` `[CLASSROOM]` `[CURRICULUM]` `[TOPIC]` `[SUBTOPIC]` (`lib/admin/tokenizer.ts`)
- [x] Read tools: list_students_in_classroom, list_classrooms, list_curricula, list_topics, list_subtopics, find_subtopic_by_name, find_guardian_by_name (`lib/admin/read-tools.ts`)
- [x] Reference tools: transfer_student, archive_student, update_student, assign_teacher_to_classroom, unassign_teacher_from_classroom, assign_curriculum_to_classroom, link_guardian_to_student, unlink_guardian_from_student, rename_subtopic, archive_subtopic, rename_topic (`lib/admin/crud.ts` + agent dispatcher)
- [x] All tool calls return tokens; client de-tokenizes via the returned reference set

**Week 11: agent loop**

- [x] `/api/admin/agent` with multi-turn loop, max 10 turns (`lib/admin/agent-loop.ts`, `MAX_ADMIN_TURNS = 10`)
- [x] Per-action confirmation for destructive operations (`DESTRUCTIVE_TOOLS` set; agent yields `pendingConfirmations` and the route re-invokes with `approvedDestructive`)
- [x] Admin agent session persistence for audit (`audit_log` row written on every turn, including executed tools + pending count + turn count)

**Week 12: extraction-to-form for creation + report review workflow**

- [x] Natural-language creation: `/api/admin/extract` runs a single-turn extraction-to-form for student / guardian / classroom / subtopic. Returns pre-filled fields the admin reviews and submits via direct CRUD (no PII through the agent)
- [x] LLM-assisted CSV column mapping (`lib/admin/csv-mapping.ts` — single-turn schema-aware match, plugs into the import planner)
- [x] Dry-run mode with conflict preview (`/api/admin/import-roster` returns the import plan + conflicts when `dry_run = true`)
- [x] Report review queue endpoint (`/api/admin/reports/queue` — filter by status)
- [x] Admin report actions reuse the Phase 3 workflow endpoints (`/api/v1/reports/{approve,changes,send}`); `send` already filters to `student_guardians.receives_reports = true`
- [x] Email delivery worker (`lib/admin/email-worker.ts` — drains `report_recipients` rows in `pending` → `sent` / `failed`. Production sender plug-in seam; `StubEmailSender` for tests)
- [x] End-to-end test for the Phase 4 checkpoint scenarios (`src/__tests__/phase4-end-to-end.test.ts` — agent loop + tokenization, destructive-confirmation gate, CSV planner, email worker, extraction-to-form)

**Checkpoint**: an admin can configure a new classroom with 20 students, 5 teachers (mix of lead/support/assistant), a customized 5-topic / 25-subtopic curriculum, and complete a full report-review cycle (submit → request changes → re-submit → approve → send to 2 guardians per student) in under 30 minutes — with full audit trail and zero data loss on any failed operation.

> Phase 4 caveat: the `/admin/*` route tree (visual shell, queue UI,
> curriculum builder UI, audit-log viewer UI) is mechanical wiring on top of
> the API surface that's now in place. Backend contracts — auth, CRUD, agent
> loop, destructive-confirmation gate, extraction-to-form, email worker, audit
> trail — are all complete and exercised by the e2e suite. The 30-minute
> walkthrough checkpoint will land once the desktop UI shell goes in (early
> Phase 5 cleanup or a follow-up branch).

### Phase 5 — Parent (guardian) read-only app (Weeks 13–14)

Goal: linked guardians can see their child's records.

- [ ] Guardian invitation flow (admin-initiated from a `guardians` row, email link with one-time token addressed to `guardians.email`)
- [ ] Guardian self-service onboarding: claim invitation, set password — claim links the new Supabase Auth user to the existing `guardians.id`, no new row created
- [ ] JWT carries `guardian_id` once claimed; auth identity is decoupled from the canonical `guardians` row (a guardian can exist before they claim)
- [ ] Guardian UI shell at `/parents/*` — mobile-first, minimal
- [ ] Views: attendance calendar, progress overview (per-subtopic status), `sent` reports only
- [ ] Strict RLS verification using the guardian-scoped policies (`guardians see linked students`, `guardians see sent reports`, equivalents for attendance and progress)
- [ ] Multi-child support: a single guardian can be linked to multiple students via separate `student_guardians` rows
- [ ] Per-link `receives_reports` honored — unlinked or opted-out guardians see no reports

**Checkpoint**: guardian invitation through report viewing works end-to-end. Penetration test: confirmed a guardian cannot see students they are not linked to via direct API queries, and cannot see reports in any status other than `sent`.

---

## 7. Critical Risks and Mitigations

| Risk                                                                                             | Likelihood                  | Mitigation                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Whisper accuracy on classroom devices                                                            | Medium                      | Phase 2 checkpoint; fall back to Whisper-base or push-to-talk-only mode                                                       |
| LLM emits malformed tool calls or leaks tokens                                                   | Medium                      | Strict Zod validation + regex token check; auto-regenerate on failure; log every failure for prompt tuning                    |
| First-run model download (~75-150MB) feels broken on slow wifi                                   | High                        | "Setting up your classroom" full-screen progress UX framed as one-time setup, not loading; download in background after login |
| Sync conflicts when teacher uses multiple devices                                                | Low (v1)                    | Append-only log with idempotency keys; document as known limitation                                                           |
| Admin LLM destructive action mis-targets                                                         | Medium                      | Soft deletes only in v1; per-action confirmation; full audit log; rollback by writing inverse commands                        |
| Supabase Auth session lost on data clear                                                         | Low                         | Document; consider cookie-based session in Phase 4 if it bites                                                                |
| Guardian unauthorized data access (sees a student they're not linked to, or a non-`sent` report) | High impact, Low likelihood | RLS via `student_guardians` and `report_recipients` as primary defense; manual penetration test before Phase 5 ships          |
| Token-preservation drift in long report drafts                                                   | Medium                      | Validator + regenerate; cap report length; structured generation (paragraph-by-paragraph) if drift persists                   |

---

## 8. Cross-Cutting Concerns

### 8.1 Telemetry from day one

Log to a `telemetry` table (or external service) — no PII, structural failures only:

- `command_parse_failed` with error category
- `whisper_transcription_corrected` with edit distance
- `ocr_confidence_low` with confidence score
- `sync_conflict` with reason
- `tool_validation_failed` with tool name and error type
- `agent_loop_aborted` with turn count and reason

You cannot retroactively analyze data you didn't capture. Build this first, ship it always-on.

### 8.2 Feature flags

Use a simple flag table or PostHog from week 1. At minimum:

- `voice_capture_enabled` (per school)
- `photo_capture_enabled` (per school)
- `admin_agent_enabled` (per admin)
- `parent_portal_enabled` (per school)

Gives you the ability to roll out per pilot and disable a misbehaving feature without a deploy.

### 8.3 Open PRD questions to resolve before Phase 4

These are flagged in the PRD's open questions and need answers before admin work begins:

1. Which exact school report formats need to be supported in the first pilot?
2. What minimum confidence threshold should student resolution use before asking the teacher to confirm a match?
3. Which Montessori curriculum areas need to be covered first in the progress tracker mapping?

---

## 9. Out of Scope for This Plan

Reaffirming the PRD's exclusions, plus a few additions:

- Parent messaging (read-only only)
- Parent-facing AI chat
- Cross-device sync (single-device-per-teacher assumed in v1)
- Native mobile apps
- Curriculum management beyond CRUD on `curricula`, `curriculum_topics`, and `curriculum_subtopics` (no advanced ordering tools, no cross-school curriculum sharing in v1)
- Billing, admissions, scheduling
- Multi-tenant operations beyond per-school isolation
- Offline LLM (server-bound for the foreseeable future)

---

## 10. Decision Log

Things we decided during design that future-you will want to remember:

| Decision                                                                                                              | Rationale                                                                                                            | Reversible?                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| Next.js over SvelteKit                                                                                                | Ecosystem, tooling, AI assistance, hiring                                                                            | Yes, with rewrite                                                                 |
| Tool use over JSON output                                                                                             | Higher accuracy, better composability, native Claude pattern                                                         | Yes, prompt change                                                                |
| Tokenize everywhere except creation                                                                                   | Keeps privacy story simple and verifiable                                                                            | Hard — embedded in data flow                                                      |
| Append-only command log                                                                                               | Trivial sync, free undo, audit-friendly                                                                              | Hard — embedded in schema                                                         |
| Local-first with Dexie + Supabase                                                                                     | Instant UI + admin visibility                                                                                        | Medium — sync layer rewrite                                                       |
| Single-turn parsing for teachers, agent loop for admin and reports                                                    | Latency vs capability trade-off matches each user's context                                                          | Easy                                                                              |
| Read tools return tokens                                                                                              | Prevents PII leakage during admin agent runs                                                                         | Hard — touches every tool                                                         |
| Creation goes through direct CRUD, not the agent                                                                      | Isolates PII writes, easier audit                                                                                    | Easy                                                                              |
| Parents read-only in v1                                                                                               | Stays inside PRD scope, defers messaging complexity                                                                  | Easy                                                                              |
| Soft deletes only                                                                                                     | Reversible mistakes from admin agent                                                                                 | Easy                                                                              |
| Unified `users` table (role-gated) over separate `teachers` / `admins`                                                | One identity surface, simpler RLS, easier role transitions                                                           | Medium — touches every FK that referenced `teachers`                              |
| Multi-teacher classrooms via `classroom_teacher_assignments`                                                          | Models reality (lead + support + assistant), supports staff changes                                                  | Medium — RLS for command insert joins through this table                          |
| Student transfers via `student_classroom_enrollments`                                                                 | Preserves history; admins move students without rewriting `students`                                                 | Medium — UI must always read active enrollment, not a column                      |
| First-class `guardians` decoupled from auth                                                                           | Guardian record exists before claim; `email_snapshot` preserves delivery history                                     | Medium — separate identity vs contact concerns once UI ships                      |
| Per-school customizable curriculum (`curricula → topics → subtopics`)                                                 | Schools deviate from canonical Montessori; default is seeded but editable                                            | Medium — replaces flat `activities` table                                         |
| `student_progress` + `student_progress_history` alongside the commands log                                            | Convenience projection; admin queries have a simple table to look at; commands remain source of truth                | Easy — projections are rebuildable                                                |
| Report review workflow (`draft → submitted_for_review → in_review → changes_requested → approved → sent`)             | Real schools have admin oversight on parent-facing communication; daily reports can short-circuit `draft → approved` | Easy — status enum change                                                         |
| Attendance is `present                                                                                                | absent`only (dropped`late`)                                                                                          | Matches the proposed schema; `late` can return as a follow-up if pilots demand it | Easy — enum change + UI |
| Token namespace expanded: `[STUDENT]`, `[GUARDIAN]`, `[USER]`, `[CLASSROOM]`, `[CURRICULUM]`, `[TOPIC]`, `[SUBTOPIC]` | Matches the new entity model; guardians are PII and must be tokenized                                                | Hard — touches every tool definition                                              |

---

## 11. What Success Looks Like

Per the PRD's success metrics, plus implementation-level:

- A teacher pilots the app for two weeks and reports it's faster than their current workflow
- ≥80% of generated commands approved with no edits
- ≥85% Whisper transcription accuracy on real teacher dictation
- Zero PII in LLM request payloads (verified by automated grep on outbound traffic in dev)
- Zero data loss across 1000+ approved commands during pilot
- Admin can configure a classroom (with curriculum + multiple teacher assignments + 20 students + linked guardians) end-to-end in <30 minutes
- Guardians successfully view their child's records and `sent` reports without support tickets
