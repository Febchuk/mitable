# Mitable for Montessori — design decisions

Key architectural and product choices made through phases 0–7. Each
section captures the call, the reason, and what we'd revisit if the
prototype graduates.

## 1. Two-stage draft-and-approve, no auto-save

**Decision.** Every AI write is split into two requests:
`POST /agent/interpret` returns a `ProposedUpdatesEnvelope`;
`POST /agent/confirm` actually mutates the DB inside a transaction.
The envelope can be edited in the UI between the two — what the
teacher approves is what gets written, not what the agent proposed.

**Why.** Childcare records are high-trust data. A teacher needs a
clear "I checked this" gate before observations or attendance lands
on a child's profile. The split also makes the rollback story trivial:
discarding a draft is just dropping the envelope in memory.

**Future.** When confidence is high enough, low-stakes proposals
(e.g. "mark Aiden present") could opt into a soft auto-confirm with a
visible undo for ~10s. But this is a deliberate post-MVP move.

## 2. Capture is in-app only

**Decision.** Photos go through `getUserMedia` + canvas; audio goes
through `MediaRecorder`. There is no file input anywhere in the app,
and `accept="image/*"` patterns are explicitly avoided.

**Why.** The user explicitly forbade uploads from device libraries:
nothing about a child should be persisted on a teacher's personal
device storage. Removing the file-input affordance is the simplest
way to make the boundary unambiguous to both teachers and reviewers.

**Future.** When schools want to import legacy paper records in
bulk, an admin-only ingestion path could exist with explicit audit
logging — but it would be a different surface, not the teacher's
agent.

## 3. Raw media is in-memory only on the server

**Decision.** `multer.memoryStorage()` holds the bytes for the life
of the interpret request. The buffer is passed straight to Gemini and
nulled immediately after the structured-output call resolves. Nothing
hits Supabase Storage.

**Why.** Same privacy posture as #2, applied server-side. The agent
needs the bytes once, to OCR/transcribe; persisting them creates
liability with no user benefit.

**Future.** If a teacher ever wants to retain a specific photo
(e.g. as a portfolio sample for a parent), that's an explicit action
with explicit storage — not a default of the capture pipeline.

## 4. Single multimodal Gemini call per capture

**Decision.** `MontessoriInterpretationService` makes one call to
Gemini 2.5 Flash with text + photo + audio in a single prompt and
asks for structured output (the `ProposedUpdates` Zod schema).

**Why.** Coherence wins. Splitting into "transcribe → OCR →
classify" passes information loss between steps and lets the
classifier hallucinate against context the upstream models stripped.
A single multimodal call also makes the rate-limit math simple — one
capture is one billed inference.

**Future.** If we hit recall ceilings on the classifier portion, we
can run a second targeted pass (e.g. "given this transcript, list
candidate observations only") and merge — but only after we've
exhausted prompt-level fixes.

## 5. Hybrid student resolution: deterministic first, LLM fallback

**Decision.** `child-resolution.service.ts` tries five deterministic
matches against the classroom roster (exact full name, exact first,
exact last, no-space, substring) before calling Gemini with the
roster as context.

**Why.** The roster is small and the names are typed by the same
teacher every day. ~95% of cases resolve in pure string code, which
is faster, free, and impossible to hallucinate. The LLM exists for
the long tail (initials, nicknames, ambiguous "the new boy").

**Future.** Adding a per-classroom alias map (managed by the
teacher) would push the deterministic hit rate higher and reduce LLM
spend further.

## 6. Local Montessori types, no shared package

**Decision.** Both the frontend (`apps/montessori/src/types/`) and
backend (`apps/backend/src/domains/montessori/types/`) keep their own
TypeScript copies of the Montessori type surface. They mirror each
other by hand.

**Why.** Project rule from the user: "Montessori types stay inside
the Montessori app. No other app should be touched." Shared packages
create friction across the rest of the monorepo and tempt other
surfaces (Electron, browser-bridge) to import Montessori code.

**Future.** If the prototype graduates, fold the contract into a
shared `@mitable/montessori-shared` package and delete the local
mirrors in one move.

## 7. Manual SQL migrations for the Montessori schema

**Decision.** `0052_montessori_initial.sql` plus a small
`run-migration-0052.ts` runner, mirroring the project pattern for
recent migrations. `drizzle-kit generate` was not used.

**Why.** The repo's recent migration files use absolute imports with
`.js` extensions that Drizzle Kit doesn't resolve cleanly. Hand-
writing the SQL avoided fighting the tool and matched the existing
convention so the next migration after this one stays predictable.

**Future.** If we standardize the migration pipeline back onto
Drizzle Kit, regenerate Montessori migrations from the schema files
and replace `0052_montessori_initial.sql` in one cleanup PR.

## 8. PWA + IndexedDB capture queue

**Decision.** The app is a PWA (manifest + minimal service worker).
Captures sent while offline (or when a network call drops with a
`TypeError`) are stored as Blobs in IndexedDB, surfaced via an
"Offline · N pending" pill, and drained serially on reconnect.

**Why.** Teachers move around buildings with patchy wifi. Losing a
voice memo because they ducked into a stairwell is unacceptable; the
expected mental model is "my phone keeps it safe and we'll sort it
out later."

**Future.** A second pending-drafts store would let the drain hook
keep working when the user is on a non-agent page (currently the
hook lives inside `AgentView`). It's a small win that didn't justify
the complexity for the prototype.

## 9. Drain → drafts, never auto-save

**Decision.** When the offline queue drains on reconnect, each
capture re-enters the `/agent/interpret` flow and the resulting
envelope is rendered in the agent chat as a regular reviewable draft.
The user must approve it through the same review panel as a live
capture.

**Why.** The privacy invariant from #1 holds even when the teacher
isn't actively present at submit time. Auto-confirming offline
captures would silently bypass the review gate.

**Future.** Same reasoning as #1's "future" — if confidence on
specific proposal kinds gets very high, an opt-in auto-confirm with
visible undo is reasonable.

## 10. DOCX (docxtemplater) + programmatic PDF (pdfmake)

**Decision.** Admin uploads a `.docx` or `.pdf` template; admin-side
parsing extracts placeholders + section markers; report generation
uses `docxtemplater` to fill DOCX templates verbatim and `pdfmake`
to programmatically render a styled PDF from the same context.

**Why.** Real Montessori schools have formatted templates. DOCX is
the closest "fill the blanks and email back" path. PDFs are
generated rather than DOCX-converted because nothing in the Node
ecosystem converts DOCX → PDF reliably without a headless office
runtime — `pdfmake` gives us deterministic output we control.

**Future.** Optional `--style=template` mode that ports more of the
DOCX styling into the PDF (fonts, headers) if school IT teams want
them visually identical.

## 11. Express stays in `apps/backend`; no new server

**Decision.** All Montessori routes live under
`apps/backend/src/domains/montessori/` and mount at
`/api/montessori/*` in the existing Express app.

**Why.** One auth surface, one deploy unit, one ops page. The
Montessori data lives in the same Postgres so cross-tenant queries
(if they ever happen — explicitly out of MVP scope) are also a
single SQL away.

**Future.** Domain isolation could be tightened (a separate Express
sub-app with its own middleware bus) if the surface grows large
enough to warrant it.

---

These decisions are revisited at the start of any Montessori-shaped
feature. If a future change contradicts one of them, that section
should be updated in the same PR so the doc stays the source of
truth.
