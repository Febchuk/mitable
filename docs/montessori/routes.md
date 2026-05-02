# Route Specification

Routes for the Montessori record-keeping prototype. Three role-based frontend shells (teacher, admin, guardian) share a single backend API. URL paths use kebab-case; resource IDs are UUIDs.

This file is a companion to `Mitable_Architecture.md` and `IMPLEMENTATION_PLAN.md` — both of which are the source of truth. Where this file diverges from them, they win.

## Conventions

- `:studentId`, `:userId`, etc. are URL path params
- `?param=` indicates supported query strings
- All `/app/*`, `/admin/*`, `/family/*` routes require auth
- Multi-tenancy is enforced server-side by JWT (`school_id` claim) — no school slug in the URL for v1 (one school per session)
- API routes are versioned: `/api/v1/...`
- All mutating endpoints require CSRF token + bearer auth
- Tokenization is invisible at the route layer: every API response that names a student, guardian, user, classroom, or curriculum entity returns the UUID; the **client** tokenizes locally before any LLM call. The server never sees `[STUDENT_n]` tokens.
- The append-only `commands` log is the only write path for teacher-side state changes. `/api/v1/sync/commands` is the single endpoint that mutates the commands table — all other "write" endpoints (attendance, progress, reports) either funnel through it or are admin-only direct CRUD.

---

## 1. Public & marketing

| Path             | Notes                    |
| ---------------- | ------------------------ |
| `/`              | Marketing landing        |
| `/for-schools`   | Admin pitch page         |
| `/for-teachers`  | Teacher pitch page       |
| `/contact`       | Contact form             |
| `/legal/terms`   | Terms of service         |
| `/legal/privacy` | Privacy policy           |
| `/legal/dpa`     | Data processing addendum |

## 2. Auth

Backed by Supabase Auth. JWT carries `school_id`, `role` (`admin` | `teacher`), and (for guardian app) `guardian_id`.

| Path                     | Notes                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `/login`                 | Email + password                                                                        |
| `/login/sso/:provider`   | Google / Microsoft                                                                      |
| `/signup`                | School-led signup (creates the first admin in `users`)                                  |
| `/forgot-password`       | Reset request                                                                           |
| `/reset-password?token=` | Token landing                                                                           |
| `/verify-email?token=`   | Email verify                                                                            |
| `/accept-invite?token=`  | Staff invite (creates `users` row) or guardian claim (links to existing `guardians.id`) |
| `/logout`                | Server-side session clear; clears in-memory roster encryption key                       |

## 3. Onboarding (new school)

Linear flow with progress indicator. Each step persists to draft state. No billing in v1.

- `/onboard` — entry / resume
- `/onboard/school` — school name, timezone (writes `schools` row)
- `/onboard/curriculum` — pick base scope & sequence: Montessori default (seeds `curricula` + `curriculum_topics` + `curriculum_subtopics`), or start blank for full customization
- `/onboard/classrooms` — create initial `classrooms`
- `/onboard/staff` — invite teachers and admins (creates `users` rows in `invited` status, plus `classroom_teacher_assignments` for teachers)
- `/onboard/done` — handoff to `/app/today`

---

## 4. Teacher app — `/app/*`

The daily-driver shell. Sidebar nav anchors all routes. Implemented as a PWA (Phase 2+).

### 4.1 Dashboard

- `/app/today` — today screen (default landing): active classroom, attendance status, pending-sync count, recent approved commands

The AI entrypoint is a **floating chat in the bottom-right corner**, present on every authenticated route (teacher, admin, and guardian shells). It is not a route — it is a global UI element. Teachers dictate, type, or paste into the chat from anywhere; the assistant proposes tool calls (mark attendance, record progress, draft a report, etc.) which render as inline review cards inside the chat thread. The teacher approves, edits, or rejects each card; on approve, the command is written to Dexie, the local projection updates immediately, and the background sync worker pushes to `/api/v1/sync/commands`. There is no separate review page — review happens in the chat where the proposal was made.

### 4.2 Roster & student profiles

`childId` is renamed to `studentId` to match the schema.

- `/app/roster` — classroom grid/list, scoped to active classroom assignments
- `/app/roster/:studentId` — student profile overview
- `/app/roster/:studentId/progress` — per-subtopic status (introduced/practicing/mastered/na)
- `/app/roster/:studentId/timeline` — chronological feed of approved commands for this student
- `/app/roster/:studentId/guardians` — linked guardians (read-only for teachers; admin manages links)
- `/app/roster/:studentId/notes` — private teacher notes (not guardian-visible) — note-type commands with `command_type = 'note'`
- `/app/roster/:studentId/reports` — generated reports (drafts + approved + sent)
- `/app/roster/:studentId/edit` — request student edit (creates an admin-review item, since `students` is admin-write)

### 4.3 Curriculum (read-only for teachers)

Teachers see the curriculum assigned to their classroom; they cannot edit it.

- `/app/curriculum` — tree view of active curriculum (topics → subtopics)
- `/app/curriculum/:topicId` — topic detail with all subtopics
- `/app/curriculum/subtopic/:subtopicId` — subtopic detail (description, aliases)

### 4.4 Progress

- `/app/progress` — students × subtopics matrix for the active classroom
- `/app/progress?topic=:topicId` — filtered to one curriculum topic
- `/app/progress?period=30d` — only progress recorded in last 30 days

### 4.5 Attendance

- `/app/attendance` — today's check-in (`present` | `absent`)
- `/app/attendance?date=YYYY-MM-DD` — historical date
- `/app/attendance/history` — month/year roll-up

### 4.6 Reports

Daily and major reports use the same `reports` table; `report_type` distinguishes them.

- `/app/reports` — index (default: my drafts + approved)
- `/app/reports/daily` — daily report list
- `/app/reports/daily/new?studentId=` — start a daily report (typically AI-drafted)
- `/app/reports/daily/:reportId` — view
- `/app/reports/daily/:reportId/edit` — edit a `draft` report
- `/app/reports/major` — major report list
- `/app/reports/major/new?studentId=` — start a major report
- `/app/reports/major/:reportId` — view (read-only after `submitted_for_review`)
- `/app/reports/major/:reportId/edit` — edit while in `draft` or `changes_requested`

### 4.7 Account

- `/app/profile` — own `users` row
- `/app/settings` — preferences (language, capture mode toggles)
- `/app/help` — help center

---

## 5. Admin app — `/admin/*`

Desktop-first (no PWA). Includes admin-only operations plus visibility into everything teachers see.

### 5.1 Dashboard

- `/admin` — admin overview: active classrooms, staff status, pending report-review queue, recent audit log entries

### 5.2 Classrooms & staff

- `/admin/classrooms` — list
- `/admin/classrooms/new`
- `/admin/classrooms/:classroomId`
- `/admin/classrooms/:classroomId/edit`
- `/admin/classrooms/:classroomId/roster` — manage `student_classroom_enrollments`
- `/admin/classrooms/:classroomId/teachers` — manage `classroom_teacher_assignments` (lead/support/assistant + start/end dates)
- `/admin/classrooms/:classroomId/curriculum` — assign one `curricula` row to this classroom
- `/admin/staff` — list of `users` (admins + teachers)
- `/admin/staff/invite` — creates a `users` row in `invited` status
- `/admin/staff/:userId` — staff detail
- `/admin/staff/:userId/edit` — edit role, status, contact info

### 5.3 Students & guardians

- `/admin/students` — school-wide list
- `/admin/students/new` — direct-CRUD creation (single-turn LLM extraction-to-form OK)
- `/admin/students/:studentId` — admin view
- `/admin/students/:studentId/edit`
- `/admin/students/:studentId/enrollments` — full enrollment history (active + ended)
- `/admin/students/:studentId/guardians` — manage `student_guardians` links
- `/admin/students/import` — CSV roster import with conflict preview, dry-run mode
- `/admin/guardians` — guardian list
- `/admin/guardians/new` — direct-CRUD creation
- `/admin/guardians/:guardianId` — guardian detail with linked students
- `/admin/guardians/:guardianId/edit`

### 5.4 Curriculum management

Per-school customizable. Default Montessori curriculum is seeded but fully editable.

- `/admin/curriculum` — list of `curricula` for this school
- `/admin/curriculum/new`
- `/admin/curriculum/:curriculumId` — overview (topics + subtopic count)
- `/admin/curriculum/:curriculumId/edit`
- `/admin/curriculum/:curriculumId/topics` — manage topics under this curriculum
- `/admin/curriculum/:curriculumId/topics/:topicId` — topic detail
- `/admin/curriculum/:curriculumId/topics/:topicId/subtopics` — subtopics under this topic (sort_order, aliases)
- `/admin/curriculum/:curriculumId/subtopics/:subtopicId/edit`
- `/admin/curriculum/import` — bulk import from CSV (LLM-assisted column mapping)

### 5.5 Report review queue

The lifecycle is `draft → submitted_for_review → in_review → changes_requested → approved → sent`. Admin queue surfaces everything past `draft`.

- `/admin/reports` — review queue, filterable by `status`
- `/admin/reports/:reportId` — read-only view + review actions
- `/admin/reports/:reportId/edit` — admin edit (writes a `report_review_actions` row with `action_type = 'edited'`)
- `/admin/reports/:reportId/recipients` — pick guardians for delivery (filtered to `student_guardians.receives_reports = true`)

### 5.6 Cross-classroom analytics (light, MVP-only)

- `/admin/analytics/progress` — cross-classroom progress roll-up
- `/admin/analytics/attendance` — cross-classroom attendance roll-up

### 5.7 System

- `/admin/audit-log` — `audit_log` viewer
- `/admin/data-export` — full school data archive (async export)
- `/admin/school-settings` — school name, timezone
- `/admin/school-settings/privacy` — privacy controls

---

## 6. Guardian app — `/family/*`

Read-only. Mobile-first. Auth-scoped via `guardian_id` JWT claim; RLS enforces visibility through `student_guardians`.

- `/family` — today's snapshot, all linked students
- `/family/student/:studentId` — student overview
- `/family/student/:studentId/progress` — narrative progress (per-subtopic status, no matrix)
- `/family/student/:studentId/attendance` — attendance calendar
- `/family/student/:studentId/timeline` — chronological feed of `sent` items only
- `/family/reports` — `sent` reports list (across all linked students)
- `/family/reports/:reportId` — view (read-only); marks acknowledgement timestamp
- `/family/profile` — own `guardians` row + linked students
- `/family/profile/contact-preferences` — `preferred_contact_method`, `receives_reports` per linked student

---

## 7. Backend API — `/api/v1/*`

REST-ish JSON. Standard verbs. List endpoints support `?page=`, `?limit=`, `?cursor=`, `?sort=`, `?filter[field]=` unless noted. All responses return UUIDs; client-side tokenization happens before any LLM call (see Conventions).

### 7.1 Auth

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
POST   /api/v1/auth/signup
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/accept-invite           # staff invite or guardian claim
POST   /api/v1/auth/sso/:provider/callback
GET    /api/v1/auth/me                      # current user + role + active classroom assignments
```

### 7.2 Schools

```
GET    /api/v1/schools/current              # name, timezone, status
PATCH  /api/v1/schools/current              # admin only
```

### 7.3 Users (admin + teacher staff)

```
GET    /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id                    # admin: any user; teacher: self only
POST   /api/v1/users/invite                 # admin only — creates `users` row in `invited`
PATCH  /api/v1/users/:id/status             # admin only — invited|active|disabled
```

### 7.4 Classrooms & assignments

```
GET    /api/v1/classrooms
POST   /api/v1/classrooms                            # admin only
GET    /api/v1/classrooms/:id
PATCH  /api/v1/classrooms/:id                        # admin only
PATCH  /api/v1/classrooms/:id/status                 # admin only — active|archived
PATCH  /api/v1/classrooms/:id/curriculum             # admin only — assign curriculum_id

GET    /api/v1/classrooms/:id/teachers               # active classroom_teacher_assignments
POST   /api/v1/classrooms/:id/teachers               # admin only — create assignment
PATCH  /api/v1/classroom-teacher-assignments/:id     # admin only — update role, end_date

GET    /api/v1/classrooms/:id/enrollments            # active student_classroom_enrollments
POST   /api/v1/classrooms/:id/enrollments            # admin only — enroll a student
PATCH  /api/v1/student-classroom-enrollments/:id     # admin only — update is_primary, end_date
```

### 7.5 Students

Direct CRUD is admin-only. Teachers can request edits via the floating AI chat, which produces an admin-review item.

```
GET    /api/v1/students                              # scoped by RLS to school_id
POST   /api/v1/students                              # admin only
GET    /api/v1/students/:id
PATCH  /api/v1/students/:id                          # admin only
POST   /api/v1/students/:id/archive                  # admin only — soft delete
GET    /api/v1/students/:id/timeline                 # approved commands for this student
GET    /api/v1/students/:id/progress?topic=          # student_progress, optionally filtered to a topic
GET    /api/v1/students/:id/attendance?from=&to=
GET    /api/v1/students/:id/guardians                # student_guardians joined to guardians
POST   /api/v1/students/:id/guardians                # admin only — link guardian
DELETE /api/v1/student-guardians/:id                 # admin only — unlink
POST   /api/v1/students/import                       # admin only — CSV roster import
```

### 7.6 Guardians

```
GET    /api/v1/guardians                             # admin only
POST   /api/v1/guardians                             # admin only
GET    /api/v1/guardians/:id                         # admin or self (when authed as guardian)
PATCH  /api/v1/guardians/:id                         # admin or self
GET    /api/v1/guardians/:id/students                # for guardian app
```

### 7.7 Curriculum

```
GET    /api/v1/curricula                             # for this school
POST   /api/v1/curricula                             # admin only
GET    /api/v1/curricula/:id
PATCH  /api/v1/curricula/:id                         # admin only

GET    /api/v1/curricula/:id/topics
POST   /api/v1/curricula/:id/topics                  # admin only
PATCH  /api/v1/curriculum-topics/:id                 # admin only

GET    /api/v1/curriculum-topics/:id/subtopics
POST   /api/v1/curriculum-topics/:id/subtopics       # admin only
PATCH  /api/v1/curriculum-subtopics/:id              # admin only

POST   /api/v1/curricula/:id/import                  # admin only — CSV import with LLM column mapping
```

### 7.8 Commands log (the single write path for teacher state)

```
POST   /api/v1/sync/commands                         # batch insert; idempotent via client_id; triggers projections
GET    /api/v1/sync/commands?since=                  # delta pull for projection rebuild context
```

### 7.9 Attendance

`attendance_records` is a derived projection of `commands`. Reads are direct; writes go through the commands log.

```
GET    /api/v1/attendance?date=YYYY-MM-DD&classroomId=
GET    /api/v1/attendance/summary?from=&to=&classroomId=
# (No POST/PATCH — write via /api/v1/sync/commands with command_type = 'attendance')
```

### 7.10 Progress

`student_progress` is a derived projection. Reads are direct; writes go through the commands log.

```
GET    /api/v1/progress?studentId=&classroomId=&topicId=
GET    /api/v1/progress/history?studentId=&subtopicId=    # student_progress_history
# (No POST/PATCH — write via /api/v1/sync/commands with command_type = 'progress')
```

### 7.11 Reports

Lifecycle: `draft → submitted_for_review → in_review → changes_requested → approved → sent`. Each transition writes a `report_review_actions` row.

```
GET    /api/v1/reports?status=&studentId=&type=daily|major
POST   /api/v1/reports                               # create draft (typically called by AI flow below)
GET    /api/v1/reports/:id
PATCH  /api/v1/reports/:id                           # edit while in draft|changes_requested
POST   /api/v1/reports/:id/submit                    # draft → submitted_for_review
POST   /api/v1/reports/:id/request-changes           # in_review → changes_requested (admin only)
POST   /api/v1/reports/:id/approve                   # → approved (teacher self-approve for daily; admin for major)
POST   /api/v1/reports/:id/send                      # approved → sent; writes report_recipients rows; queues delivery

GET    /api/v1/reports/:id/review-actions            # report_review_actions log
GET    /api/v1/reports/:id/recipients                # report_recipients
```

### 7.12 AI services

All AI endpoints accept tokenized input and return tokenized output. Server proxies to Anthropic; no PII storage; no logging of request payloads.

```
POST   /api/v1/ai/parse-command              # tokenized text → tool calls (Haiku, single-turn)
POST   /api/v1/ai/draft-report               # tokenized commands history → reports row in 'draft' (Sonnet, ≤5 turns)
POST   /api/v1/ai/admin/agent                # tokenized admin intent → tool calls (Sonnet, ≤10 turns)
POST   /api/v1/ai/admin/extract              # natural-language → pre-filled creation form fields (single-turn, plaintext only for the entity being created)
```

Voice transcription (Whisper) and OCR (Tesseract) run **on-device** in Web Workers. No audio or image data crosses the network.

### 7.13 Search

```
GET    /api/v1/search?q=                     # global search (students, guardians, subtopics, reports)
                                             # query is tokenized client-side; server gets UUIDs only
```

### 7.14 Audit & ops

```
GET    /api/v1/audit-log?actor=&entity=      # admin only
GET    /api/v1/admin/health                  # admin only
POST   /api/v1/admin/data-deletion-request   # admin only — initiates async deletion
POST   /api/v1/exports                       # admin only — request school data export (async)
GET    /api/v1/exports/:id                   # poll status
GET    /api/v1/exports/:id/download
```

---

## 8. Static & media

```
GET    /uploads/:tenantId/:assetId           # signed URLs only, short TTL
                                             # in v1 this serves CSV import previews and exports only — not photos
```

---

## Design notes

A few things worth flagging for the route design:

The teacher and admin shells share a lot of underlying data but render different UIs — they live in separate route trees rather than role-flagging shared routes. Diverging information density (admin needs filterable tables; teacher needs warm timeline views) makes shared layouts painful within six months.

The AI endpoints under `/api/v1/ai/*` are deliberately separate from the resource endpoints they ultimately mutate. This lets you swap providers, add caching, or move to a different inference stack without touching the data routes. The flow is always: AI endpoint returns a structured proposal → the floating chat (bottom-right, present on every authenticated route) renders the proposal as an inline review card with approve/edit/reject controls → on approve, the client posts to `/api/v1/sync/commands`. Review happens in the chat where the proposal was made; there is no separate review page.

`/api/v1/sync/commands` is the only endpoint that writes to the `commands` table. Attendance, progress, and notes all flow through it; their derived projections (`attendance_records`, `student_progress`, `student_progress_history`) are updated by Postgres triggers on insert. This is what makes offline-first sync trivial and gives free undo via the `retracts_id` column.

Multi-tenant isolation is enforced at the data layer via Postgres RLS keyed on `school_id` (and, for guardians, on `student_guardians`). Don't trust route prefixes to scope tenants.

Tokenization is invisible at the route layer. Every API response that names a student, guardian, user, classroom, topic, or subtopic returns the UUID. The **client** maintains the `[STUDENT_n] ↔ uuid` mapping in Dexie and tokenizes locally before any LLM call. The server never sees `[STUDENT_n]` tokens; the LLM never sees real names.

---

## Appendix: Deferred / out of MVP scope

Routes from the original brainstorm that map to features explicitly out of scope for v1 (per `IMPLEMENTATION_PLAN.md` §9 and the privacy invariants in `Mitable_Architecture.md` §1). Kept here so the broader product thinking isn't lost — none of these are buildable against the current architecture without extending it.

### A.1 Photos

Out of scope because the privacy invariant says "audio and photos never leave the device." A future iteration would need to evolve the invariant to allow on-device-reviewed photo uploads (similar to how observations work today: capture → review → approve before any server write). When it returns, expect:

- `/app/photos` (gallery), `/app/photos/:photoId`, `/app/photos/upload`
- `/app/roster/:studentId/photos`
- `/family/student/:studentId/photos`
- `POST /api/v1/photos`, `GET /api/v1/photos`, `PATCH /api/v1/photos/:id/visibility`
- Storage: signed URLs, per-school bucket, `private | guardians | public` visibility

### A.2 Observations as a first-class entity

The current architecture treats teacher observations as `command_type = 'note'` payloads in the append-only commands log. A future iteration may promote them to a dedicated `observations` table with their own lifecycle, AI drafts (`POST /api/v1/observations/:id/approve`), media attachments, and standards tagging. Routes would include:

- `/app/observations`, `/app/observations/drafts`, `/app/observations/:obsId`
- `/app/roster/:studentId/observations`, `/app/roster/:studentId/observations/:obsId`
- `POST /api/v1/observations`, `POST /api/v1/observations/:id/approve`, `POST /api/v1/observations/bulk`

### A.3 Messaging

Out of scope because the PRD locks parents to read-only in v1. Two-way messaging adds a moderation surface, threading, notification fan-out, and a privacy review (parent ↔ teacher ↔ admin trust boundaries). Future routes:

- `/app/messages`, `/app/messages/:threadId`, `/app/messages/new`
- `/family/messages`, `/family/messages/:threadId`, `/family/messages/new`
- `/app/announcements`
- `/api/v1/threads/*`, `/api/v1/announcements`

### A.4 Calendar & events

Future routes:

- `/app/calendar`, `/app/calendar/event/:eventId`
- `/admin/calendar`, `/admin/calendar/event/:eventId/edit`
- `/family/calendar`, `/family/calendar/event/:eventId`
- `/api/v1/calendar/events/*`

### A.5 Forms & trackers

"Trackers" (meals, naps, diapers) and "forms" (waivers, intake, signed permission slips) are infant/toddler-room and admin-ops features that don't fit the daily-driver MVP. Future routes:

- `/app/forms`, `/app/forms/:formId/responses`
- `/app/roster/:studentId/trackers`
- `/admin/trackers`, `/admin/trackers/builder`, `/admin/forms`, `/admin/forms/builder`
- `/family/forms`, `/family/forms/:formId`
- `/api/v1/forms/*`, `/api/v1/trackers/*`

### A.6 Standards mapping

CCSS / state / AMS / AMI alignment is a value-add for accreditation reporting but not MVP. Future routes:

- `/admin/curriculum/standards`, `/admin/curriculum/standards/import`
- `/api/v1/standards`, `/api/v1/standards/map`
- `/admin/reports/standards`, `/admin/reports/state-compliance`

### A.7 Billing & tuition

Out of scope for the prototype. Future routes:

- `/admin/billing/*`, `/family/billing/*`
- `/onboard/billing` step
- `/api/v1/billing/*`

### A.8 Admissions / lead funnel

Post-MVP growth feature. Future routes:

- `/admin/admissions/*` (leads, applications, tours, funnel)
- `/api/v1/leads/*`, `/api/v1/applications/*`

### A.9 Realtime & websockets

V1 uses request/response polling on `/app/today` and on the admin report-review queue. WebSocket / SSE infrastructure can land when classroom-level live updates become a real need. Future routes:

- `WS /ws` with `classroom:{id}`, `thread:{id}`, `user:{id}`, `school:{id}` channels
- `SSE /api/v1/stream` fallback

### A.10 Outbound integrations

Google Workspace, Microsoft 365, QuickBooks, FACTS, Brightwheel/Transparent Classroom migration all defer until there's a paying customer asking for them. Future routes:

- `/admin/integrations`, `/admin/integrations/:provider`
- `/api/v1/integrations/*`

### A.11 Inbound webhooks

All defer because the corresponding outbound integrations (Stripe, SendGrid, Twilio, Postmark, Google OAuth lifecycle) are themselves deferred. Future routes:

- `/webhooks/stripe`, `/webhooks/sendgrid`, `/webhooks/twilio`, `/webhooks/postmark`, `/webhooks/google`

### A.12 Notifications subsystem

V1 surfaces in-app counts only (pending sync count, admin report-review count). Push tokens, per-channel preferences, and digest emails defer. Future routes:

- `/api/v1/notifications`, `/api/v1/notifications/preferences`
- `POST /api/v1/devices/register`

### A.13 Equity & analytics dashboards

`/admin/reports/equity` and the cross-classroom analytics suite beyond the simple progress/attendance roll-ups in §5.6 defer to post-MVP.

### A.14 AI features that depend on deferred entities

These were in the original brainstorm but require entities not in v1:

- `POST /api/v1/ai/photo-tag` — needs photos
- `POST /api/v1/ai/parent-update` — needs messaging
- `POST /api/v1/ai/translate` — needs language preference + a target surface (messaging or forms)
- `POST /api/v1/ai/passive-capture` — desktop/wearable ingest is a separate product surface
- `GET /api/v1/ai/insights/gaps`, `GET /api/v1/ai/insights/readiness` — depend on richer observation history than the v1 commands log surfaces

### A.15 Pricing / blog / about

Marketing surfaces below the MVP cutline. Future routes:

- `/pricing`, `/features`, `/about`, `/blog`, `/blog/:slug`, `/demo`
