# PII Tokenization for Montessori Chat Agent — Implementation Plan

> **Note on file location:** The prompt asks the deliverable to live at `apps/mitable-montessori/_design/PII-TOKENIZATION-PLAN.md`. Plan-mode forbids edits outside the dedicated plan file, so this document lives at `/Users/febechukwuma/.claude/plans/dazzling-discovering-dragon.md` and should be copied into `_design/` after the user approves.

## Context

The product team wants student names to never leave the system when teachers chat with the AI agent. The prompt assumes today the agent passes names directly to the LLM and asks for a redaction layer keyed off student database IDs with `{{student:UUID}}` wire format.

**Reality check from the audit:**

1. The Montessori app already has a mature, end-to-end tokenization system for the **report-editing chat** (`/api/v1/reports/[id]/chat/turn`). It uses `[STUDENT_n]` / `[CLASSROOM_n]` / `[SUBTOPIC_n]` (per-request positional indices), a leak validator with stop-word filtering, regenerate-on-failure, and tokenize → reason → validate → detokenize. So this is **not** a build-from-scratch problem for that surface; it's a wire-format migration.
2. A **general-purpose, roster-wide conversational agent does not yet exist**. The new mobile-shell + desktop FAB (`MobileChatShell`, `ChatDock`) reuse `ChatThread`, which is a single-shot **capture/proposal flow** (`Composer` → `/api/v1/ai/parse-command` → IndexedDB `chatProposals` → `ProposalCard`), not multi-turn dialogue. There is no general agent endpoint, system prompt, or tool set today.

**Decisions confirmed with the user:**

- **Token format:** `{{student:UUID}}` everywhere — the new agent and the existing report-chat both adopt the new format in this work. Bigger blast radius but a single token grammar across the codebase.
- **Streaming:** non-streaming v1 for the new agent. Token-boundary buffering is deferred until product asks.
- **UI:** the new mobile-shell + desktop FAB swap from the capture/proposal flow to the conversational agent. The capture pipeline can remain reachable elsewhere if needed but is no longer the default in those surfaces.

The work is therefore three coordinated tracks: (A) build the new general agent with tokenization in the foundation; (B) migrate the existing report-chat to the same `{{student:UUID}}` format; (C) repoint the new mobile/desktop chat surfaces from capture to the agent.

---

## 1. Codebase Audit (what exists today)

### 1a. Report-editing chat agent (mature, tokenized end-to-end)

| Concern                          | Where it lives                                                                                                                                                    | Status                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Route                            | `src/app/api/v1/reports/[id]/chat/turn/route.ts:34`                                                                                                               | ✅ Working                             |
| Agent loop                       | `src/lib/reports/chat-agent-loop.ts` (1–811)                                                                                                                      | ✅ Working                             |
| System prompt                    | `src/lib/anthropic/report-chat-tools.ts:301-340`                                                                                                                  | ✅ Forbids real names; explains tokens |
| Tool definitions                 | `src/lib/anthropic/report-chat-tools.ts:26-295`                                                                                                                   | ✅ 2 read tools + 7 terminal tools     |
| Token format                     | `[STUDENT_n]` / `[SUBTOPIC_n]` / `[CLASSROOM_n]` (positional, per-request)                                                                                        | ⚠ Migrating to `{{student:UUID}}`      |
| Token map                        | `ReportReferenceSet` in `src/lib/reports/data-adapter.ts:28-31`                                                                                                   | ✅ Per-request, in-memory              |
| Tokenize                         | inline `tokenizeText()` `turn/route.ts:428-440`; broader Fuse-based engine `src/lib/tokenize/tokenize.ts:15+`                                                     | ✅ Works                               |
| Detokenize                       | `detokenizeReportText()` `src/lib/reports/detokenize.ts:9-17`; `detokenizeToolCall()` `src/lib/tokenize/detokenize.ts:50-95`                                      | ✅ Works                               |
| Hallucination guard + leak check | `validateTokenPreservation()` `src/lib/reports/token-preservation.ts:85-141`; called at `chat-agent-loop.ts:353,417,465,532,602,672`                              | ✅ Works                               |
| Regenerate-on-failure            | `MAX_CHAT_REGENERATIONS = 1` (`chat-agent-loop.ts:26`); synthetic clarify at `turn/route.ts:332-360`                                                              | ✅ Works                               |
| Streaming                        | None. Synchronous `messages.create()` at `chat-agent-loop.ts:261`                                                                                                 | — Out of scope                         |
| Logging hygiene                  | One `console.error` at `turn/route.ts:418` (DB error object only). Audit log at lines 368-379 stores latency + token counts.                                      | ✅ Clean                               |
| Persisted history                | `report_chat_messages` rows (Supabase). Stored detokenized; loaded oldest→newest at `turn/route.ts:124-130`; retokenized per turn at `chat-agent-loop.ts:224-231` | ⚠ Will be re-keyed by Track B          |

### 1b. Other chat surfaces (mostly NOT a chat agent yet)

| Surface                                                 | Backend?                                        | Behavior                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app/app/chat/page.tsx` + `MobileChatShell.tsx`     | ❌ No agent                                     | Renders `ChatThread` — capture/proposal UI, not conversational                               |
| `src/components/montessori/chat-dock.tsx`               | ❌ No agent                                     | Wraps `ChatThread` for desktop FAB                                                           |
| `src/components/chat/ChatThread.tsx`                    | Calls `/api/v1/ai/parse-command` via `Composer` | Single-shot tokenized command parsing → `chatProposals` Dexie row → `ProposalCard`           |
| `src/components/chat/FloatingChat.tsx:35`               | ❌ Mock                                         | Already advertises "Names stay on this device. The model only sees tokens like [STUDENT_1]." |
| `src/components/montessori/report-detail/chat-pane.tsx` | ✅ Hits report-chat backend                     | Same loop as 1a                                                                              |

### 1c. Other AI routes

| Route                           | File                                       | Tokenization                                                 |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `POST /api/v1/ai/draft-report`  | `src/app/api/v1/ai/draft-report/route.ts`  | ✅ Yes — `seedReferences`, validates output                  |
| `POST /api/v1/ai/parse-command` | `src/app/api/v1/ai/parse-command/route.ts` | ✅ Yes — token validation, synthetic `[CLASSROOM_0]`         |
| `POST /api/admin/agent`         | `src/app/api/admin/agent/route.ts`         | ⚠ Optional `prefillReferences`, no validator. Internal-only. |

### 1d. Student data model

- `students` table (`supabase/migrations/0001_init.sql:108-120`): `id` is `uuid` (NOT `stu_a7f2c1`-prefixed). PII columns: `first_name`, `last_name`, `preferred_name`, `birth_date`, `nicknames` (text[]), `notes`.
- Guardians (`0001_init.sql:136-145`): `first_name`, `last_name`, `email`, `phone`, `preferred_contact_method`.
- Free-text PII columns: `student_progress_history.comment`, `attendance_records.comment`, `whole_child_observations.note`, `reports.body`, `report_chat_messages.payload` (jsonb, stored detokenized today), `report_chat_artifacts.ocr_text`, `audit_log.prompt`.
- Roster scope: teacher's active classroom via `classroom_teacher_assignments` (`active_classroom.ts:24-30`, `end_date IS NULL`). Already enforced by `requireUser()` / `requireReportAccess()` in `src/lib/api/auth.ts`.

### 1e. Tokenization helpers (reusable)

- Browser-side: `src/lib/tokenize/tokenize.ts` (Fuse.js, threshold 0.3); `src/lib/tokenize/roster-index.ts:44-97` (Dexie-indexed).
- Server-side: inline `tokenizeText()` in `turn/route.ts:428`; detokenizers in `src/lib/reports/detokenize.ts` + `src/lib/tokenize/detokenize.ts`.
- Validator: `validateTokenPreservation()` (`token-preservation.ts:85`). Stop-word filter at lines 22–62.
- Tests: `src/__tests__/token-preservation.test.ts`, `src/__tests__/chat-agent-loop.test.ts`, `src/__tests__/phase6-end-to-end.test.ts`.

### 1f. Backend reuse (`apps/backend/`)

- `apps/backend/src/domains/shared-infra/services/pii-redaction.service.ts` is for **infrastructure secrets** on screenshots — not student-name tokenization.
- Montessori is a separate `pnpm` root (per memory `project_montessori_dev_setup.md`); direct imports from `apps/backend` aren't possible. **Verdict: nothing in `apps/backend` is worth reusing.**

---

## 2. Gap Analysis (design vs. reality)

| Design requirement                                                     | Status                                                                                                             | Gap                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use existing student DB IDs as LLM-facing identifier                   | ⚠ Partial                                                                                                          | Today: positional `[STUDENT_n]` resets per request. Migrating to UUID-bearing tokens (Track B).                                                                                                                                                       |
| Wire format `{{student:UUID}}`                                         | ❌ Mismatch                                                                                                        | Migration touches: validator regex (`token-preservation.ts:13`), every tool description in `report-chat-tools.ts:26-295`, every `tokenizeText` callsite, every detokenizer regex, all 3 test files, persisted `report_chat_messages.references` rows. |
| Strip names, photos, parent contact, free-text PII                     | ⚠ Partial                                                                                                          | Names: ✅ in report chat. New agent's tools (`get_student_progress`, `search_observations`) will read free-text comment fields and must redact other-student names on the way out. Photos/parent contact: not currently sent — preserve that.         |
| Detokenize at response boundary                                        | ✅ Already done                                                                                                    | `chat-agent-loop.ts:368,432,479,564,616,689`                                                                                                                                                                                                          |
| Hallucination guard                                                    | ✅ Already done                                                                                                    | `validateTokenPreservation()` rejects unknown tokens. Surfaces as synthetic clarify, not silent drop.                                                                                                                                                 |
| Streaming with token-boundary buffering                                | — Out of scope                                                                                                     | Confirmed: non-streaming v1.                                                                                                                                                                                                                          |
| Logging: never log detokenized text                                    | ✅ Audited clean                                                                                                   | One `console.error` logs DB error object only.                                                                                                                                                                                                        |
| Per-request, in-memory token map                                       | ✅ Already done                                                                                                    | `references` built per-request, never cached.                                                                                                                                                                                                         |
| Stable IDs across threads                                              | ⚠ Partial                                                                                                          | Today positional indices reset; new format makes the UUID itself the identifier so cross-thread continuity is automatic.                                                                                                                              |
| Tool round-trip with `studentId` (UUID) inputs                         | ❌ Today's tools take `sectionId`, `paragraphId`, `artifactId`. New general agent needs `studentId`-bearing tools. |
| Server-side mention resolution (fuzzy match scoped to teacher's class) | ⚠ Partial                                                                                                          | `roster-index.ts` is browser-side. Server-side resolver does not exist. Reuse Fuse.js + the existing options (`tokenize.ts:80+`, threshold 0.3).                                                                                                      |
| Entities array in response (`{ id, display, offsets[][] }`)            | ❌ Not built                                                                                                       | Today client gets fully-detokenized prose; offsets aren't tracked.                                                                                                                                                                                    |
| New endpoint `POST /api/agent/chat`                                    | ❌ Doesn't exist                                                                                                   | Track A.                                                                                                                                                                                                                                              |

---

## 3. Implementation Steps

Three coordinated tracks. **Recommended order: A → B → C** so the new agent is exercised first against fresh code, then the format migration sweeps the existing surfaces, then UI repoint lands once both are stable.

### Track A — Build the general chat agent (`/api/agent/chat`) with tokenization from day one

**A1. Token-format primitives in the new format**

- Files: new `src/lib/tokens/format.ts`, new `src/lib/tokens/types.ts`.
- Change: define `formatStudentToken(uuid)`, `formatSubtopicToken(uuid)`, `formatClassroomToken(uuid)`, parsers, and a unified extraction regex `/\{\{(student|subtopic|classroom):([0-9a-f-]{36})\}\}/g`. One module both Track A and Track B import — there must not be two competing regexes after this work.
- Verify: unit tests on parse/format and regex round-trip.

**A2. Per-request `TokenMap` + redactor + detokenizer**

- Files: new `src/lib/tokens/token-map.ts`.
- Change: `TokenMap = { forward, reverse }` per the prompt. `redact(text, tokenMap)` rewrites display strings to tokens (whole-word, case-insensitive — copy the regex pattern from `turn/route.ts:436`). `detokenize(text, tokenMap)` returns `{ text, entities: [{ kind, id, display, offsets: [number,number][] }] }`. Compute offsets on the **detokenized** output by tracking insertion positions during the replace pass.
- Verify: unit tests for round-trip, stop-word handling (mirror `token-preservation.ts:22-62`), and `entities[0].offsets[0]` slicing the right substring.

**A3. Server-side roster + entity resolver scoped to the teacher's class**

- Files: new `src/lib/agent/resolve-mentions.ts`. Reuse `getActiveClassroomForCurrentUser()` (`src/lib/app/active-classroom.ts:24-30`) and Fuse.js (already a dep — see `src/lib/tokenize/tokenize.ts:80+` for option set, threshold 0.3).
- Change: given the teacher's `userId` + free-text message + optional `mentions[]`, return `{ tokenMap, rewrittenMessage, ambiguities[] }`. Fuzzy-match on first/preferred/nickname; UI-supplied `mentions[]` always wins over fuzzy. Ambiguous matches (two Liams) come back as `ambiguities[]` so the UI can prompt without picking the wrong child.
- Verify: unit test with fixture roster — exact match, fuzzy, ambiguous, and out-of-class match (must not resolve).

**A4. Hallucination-guard validator (parameterized over format)**

- Files: new `src/lib/tokens/validate-output.ts`.
- Change: same shape as `validateTokenPreservation()` (`token-preservation.ts:85-141`) but operating on `{{student:UUID}}` and the new `TokenMap`. Reject if any token's UUID is not in `tokenMap.reverse`; reject if any known `display` appears verbatim (whole-word, stop-word filtered using the existing `STOPWORD_FRAGMENTS` set — extract that constant into `src/lib/tokens/stopwords.ts` so Track B can share it).
- Verify: unit tests reject hand-rolled "leaked name" and "invented UUID"; pass a clean output.

**A5. System prompt + tool schemas in the new format**

- Files: new `src/lib/agent/agent-tools.ts`, new `src/lib/agent/system-prompt.ts`.
- Change: adapt the privacy paragraph from `report-chat-tools.ts:301-340` to the new token grammar. Define minimum tool set: `get_student_progress({ studentId })`, `search_observations({ studentIds, query })`, `propose_prose_reply({ body })`. Tool implementations run free-text fields (`comment`, `note`, `quote`) through `redact()` from A2 before returning to the model.
- Verify: snapshot test of tool schemas; fixture run that confirms a tool result containing another student's first name is redacted.

**A6. The route: `POST /api/agent/chat`**

- Files: new `src/app/api/agent/chat/route.ts`.
- Change: wire A1–A5. Auth via `requireUser()`. Sequence: (1) build roster + tokenMap; (2) resolve mentions or fuzzy-match; (3) redact user message; (4) load thread history (persist tokenized + per-message tokenMap snapshot — see Q1 below); (5) call Anthropic with system prompt + tools (`getAnthropic()` from `src/lib/anthropic/client.ts:1-19`, model = `SONNET_MODEL`); (6) handle tool calls (each output through `redact()`); (7) validate output (A4); (8) detokenize + emit entities (A2); (9) return `{ threadId, message, entities }`.
- Verify: integration test using a fixture `Anthropic` (pattern: `chat-agent-loop.test.ts`). Cover happy path, hallucinated UUID, leaked name, unresolvable mention, ambiguous mention.

**A7. Persistence schema for general chat threads**

- Files: new Supabase migration `supabase/migrations/00XX_agent_chat_threads.sql`.
- Change: tables `agent_chat_threads (id uuid pk, school_id, classroom_id nullable, created_by_user_id, created_at)` and `agent_chat_messages (id, thread_id fk, role, body_tokenized text, token_map_snapshot jsonb, created_at)`. Persist tokenized prose so the same row renders correctly even after a student is renamed.
- Verify: migration runs cleanly; can insert + read back a tokenized message and re-detokenize it against today's roster.

**A8. Logging audit for the new route**

- Files: route + tool implementations.
- Change: log only **redacted** user message, **redacted** model output, and counts. Reuse `auditLog()` shape from `turn/route.ts:368`. No `console.log` of detokenized prose.
- Verify: CI grep assertion ("no `console.log` references `tokenMap.reverse`"); manual review of one trace in the dev DB shows tokens-not-names.

### Track B — Migrate report-chat to `{{student:UUID}}`

**B1. Adopt A1's primitives in report-chat**

- Files: `src/lib/anthropic/report-chat-tools.ts`, `src/lib/reports/token-preservation.ts`, `src/lib/reports/detokenize.ts`, `src/lib/reports/data-adapter.ts`.
- Change: replace the old token regex (`token-preservation.ts:13`) with the unified one from A1. Update `ReportReferenceSet.refs[].token` to derive from UUID via `formatStudentToken()` etc. Update the report-chat system prompt's privacy paragraph (`report-chat-tools.ts:301-340`) to the new grammar. Tool descriptions (`report-chat-tools.ts:26-295`) get token examples updated.
- Verify: `npm test --workspace=apps/mitable-montessori -- token-preservation` and `chat-agent-loop` test suites stay green; one or two snapshot updates expected.

**B2. Update inline `tokenizeText` callsites**

- Files: `src/app/api/v1/reports/[id]/chat/turn/route.ts:428-440` (the inline tokenizer); same pattern in `src/app/api/v1/ai/draft-report/route.ts` and `src/app/api/v1/ai/parse-command/route.ts`.
- Change: emit the new token format from `tokenizeText()`. The function is small and self-contained.
- Verify: unit + integration tests; manual smoke of report-chat in dev.

**B3. Backfill / migrate persisted `report_chat_messages.references`**

- Files: new Supabase migration `supabase/migrations/00XX_chat_references_format.sql`.
- Change: rewrite the stored `references` jsonb so each `refs[].token` becomes the new format. Old rows are tokenized in display only (payload is detokenized today per `chat-message.ts`), so the impact is bounded — but the validator on rerender needs the new format to match. Migration is idempotent; old `[STUDENT_n]` patterns stay readable behind a fallback during the deploy window.
- Verify: SQL dry-run on a Supabase staging clone; visual check of one rendered thread before and after.

**B4. Browser-side `roster-index` + `tokenize.ts` align with new format**

- Files: `src/lib/tokenize/tokenize.ts`, `src/lib/tokenize/roster-index.ts`, `src/lib/tokenize/detokenize.ts`, `src/lib/capture/tokenize.ts`.
- Change: switch the emitted token shape. Browser-side capture-flow tokenizer used by `Composer` / `parse-command` keeps the same primitive — only the format string changes.
- Verify: `npm test`; manual smoke of `parse-command` capture flow on a real classroom.

**B5. Sweep tests**

- Files: `src/__tests__/token-preservation.test.ts`, `src/__tests__/chat-agent-loop.test.ts`, `src/__tests__/phase6-end-to-end.test.ts`, `src/__tests__/agent/*` (new from Track A).
- Change: snapshot updates (most will auto-update); inline string assertions referencing `[STUDENT_n]` get bumped to the new format.
- Verify: full `npm test` green.

### Track C — Repoint mobile-shell + desktop FAB to the conversational agent

**C1. New `AgentThread` component**

- Files: new `src/components/agent/AgentThread.tsx`, new `src/components/agent/AgentComposer.tsx`. Borrow layout/scroll from `src/components/chat/ChatThread.tsx` but render a multi-turn dialogue (user bubbles + assistant bubbles with chips/links from the `entities` array) rather than `ProposalCard`s.
- Change: send to `POST /api/agent/chat`. Render `entities[]` as inline chips with the student's display name; clicking opens the child detail page (`/app/students/[id]`).
- Verify: visual review against the existing `ChatThread` aesthetic; quick a11y pass on chips.

**C2. Repoint surfaces**

- Files: `src/app/app/chat/MobileChatShell.tsx` (line 6 imports `ChatThread`), `src/components/montessori/chat-dock.tsx` (line 5).
- Change: import `AgentThread` instead of `ChatThread`. Pass `userId`, `classroomId`, `schoolId`, `threadId` (already created via `crypto.randomUUID()` in both files).
- Verify: manual mobile + desktop walkthrough. The tokenization-promise UI string in `FloatingChat.tsx:35` is now actually true for the conversational surface.

**C3. Capture flow stays available where it makes sense**

- Files: no edits to `src/components/chat/ChatThread.tsx` or `Composer.tsx`. The capture pipeline remains reachable wherever it's already mounted (e.g. report-detail's `chat-pane.tsx` keeps using the report-chat backend, unchanged in shape — only the token format changes via Track B).
- Verify: `chat-pane.tsx` still works after Track B.

---

## 4. Open Questions (genuinely blocking)

**Q1. Confirm `agent_chat_messages` persists tokenized form (A7).** Storing tokenized prose + a per-message `token_map_snapshot` keeps renames downstream correct but makes raw DB exports look opaque. The report-chat today stores **detokenized** prose — opposite choice. Need a one-line product confirmation before writing the migration.

**Q2. Does the new agent need the same multi-tool surface as the report chat (proposals, ghost edits, chips), or does v1 ship with `propose_prose_reply` only?** The plan currently lists a minimum set (A5). If the answer is "match report chat", A5 grows by 4–6 tools but each is a thin variant of the existing schemas.

**Q3. Authoring boundary for guardian/parent names.** The new agent's tools read free-text comment fields that _can_ mention parents. Out of scope per the prompt's deferred list, but flagging because the moment `search_observations` returns a `note` containing "Amelia's mom said …", a guardian first name leaks. Two options: (a) accept the leak in v1 and follow up with guardian-name tokenization; (b) extend the redactor in A2 to also tokenize guardians the teacher has access to.

---

## 5. Out of Scope (explicit)

- **External transcript sharing / re-tokenization for audit** — deferred per the prompt.
- **Photos / addresses / SSNs / phone numbers / email addresses** as PII categories — not handled here. Photos are already not sent to the LLM (signed URLs only); the others don't currently flow through chat. `apps/backend/shared-infra/pii-redaction.service.ts` exists for that class of redaction but is orthogonal and not wired in here.
- **Streaming with token-boundary buffering** — confirmed non-streaming v1; revisit when product asks.
- **`POST /api/admin/agent`** — internal-only admin route with no validator today; left untouched.
- **Browser-side Dexie encryption keys** — orthogonal.
- **Free-text in `whole_child_observations.note` / `attendance_records.comment` / `student_progress_history.comment`** — these flow into Track A's tools and _will_ have other-student names redacted on the way out (per A2 / A5). Guardian names in those fields are subject to Q3.

---

## 6. Verification (end-to-end)

1. **Unit-test layer:** new tests under `src/__tests__/tokens/` and `src/__tests__/agent/` covering `format`, `token-map`, `resolve-mentions`, `validate-output`, `detokenize+offsets`. Track B updates `token-preservation.test.ts` and `chat-agent-loop.test.ts`.
2. **Integration test:** mirror `chat-agent-loop.test.ts` for the new agent with a fixture Anthropic. Cover happy path, leak rejection, unknown-UUID rejection, ambiguous mention.
3. **Manual walkthrough:**
   - Start the dev server: `pnpm dev` from `apps/mitable-montessori` (port 3100).
   - Open `/app/chat` mobile + desktop FAB; ask "How is &lt;real student first name&gt; doing this week?"
   - In Supabase studio, confirm the persisted `agent_chat_messages.body_tokenized` row contains `{{student:UUID}}`, not the name.
   - Open a report and exercise the report chat (`chat-pane.tsx` path); confirm Track B's format change shipped without breaking the proposal/ghost-edit flow.
4. **Logging assertion:** grep `console.log` and `console.error` under `src/app/api/agent/`, `src/app/api/v1/reports/`, `src/lib/agent/`, `src/lib/reports/`; assert none log raw user input or `tokenMap.reverse` values.
5. **Migration smoke:** apply the Track B `references` migration on a Supabase staging clone, render two pre-existing report threads, confirm names display correctly post-migration.
6. **Full test suite:** `npm test --workspace=apps/mitable-montessori` green.

---

## Critical Files

**New (Track A):**

- `src/lib/tokens/{format,types,token-map,validate-output,stopwords}.ts`
- `src/lib/agent/{resolve-mentions,agent-tools,system-prompt}.ts`
- `src/app/api/agent/chat/route.ts`
- `supabase/migrations/00XX_agent_chat_threads.sql`

**New (Track C):**

- `src/components/agent/{AgentThread,AgentComposer}.tsx`

**Modified (Track B):**

- `src/lib/anthropic/report-chat-tools.ts` (system prompt + tool descriptions)
- `src/lib/reports/{token-preservation,detokenize,data-adapter}.ts`
- `src/lib/tokenize/{tokenize,roster-index,detokenize}.ts`
- `src/lib/capture/tokenize.ts`
- `src/app/api/v1/reports/[id]/chat/turn/route.ts:428-440`
- `src/app/api/v1/ai/{draft-report,parse-command}/route.ts`
- `src/__tests__/{token-preservation,chat-agent-loop,phase6-end-to-end}.test.ts`
- `supabase/migrations/00XX_chat_references_format.sql`

**Modified (Track C):**

- `src/app/app/chat/MobileChatShell.tsx` (import swap)
- `src/components/montessori/chat-dock.tsx` (import swap)

**Reused, not modified:**

- `src/lib/api/auth.ts` (`requireUser`, `requireReportAccess`)
- `src/lib/app/active-classroom.ts:24-30`
- `src/lib/anthropic/client.ts:1-19` (`getAnthropic`, `SONNET_MODEL`)
- `src/lib/reports/token-preservation.ts:22-62` (extract `STOPWORD_FRAGMENTS` to a shared module — used by both A4 and the migrated report-chat validator)
- Fuse.js (`package.json:31`) with the option set already in `src/lib/tokenize/tokenize.ts:80+`
