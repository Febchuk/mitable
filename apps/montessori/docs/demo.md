# Demo script — Mitable for Montessori

A 6–8 minute walk-through that hits every feature shipped in phases
0–7. Run it cold from a fresh seed so the demo is reproducible.

## Pre-flight (do this once)

```bash
# 1. Wipe + reseed Montessori data (idempotent)
npm run teardown:montessori --workspace=apps/backend
npm run migrate:0052 --workspace=apps/backend
npm run seed:montessori --workspace=apps/backend

# 2. Boot
npm run dev --workspace=apps/backend       # :3000
npm run dev --workspace=apps/montessori    # :3004
```

In Supabase, ensure your demo user is associated with the seeded
organization. Have a phone or DevTools mobile-mode ready for the PWA
install + offline portions.

Recommended demo browser: Chrome (best PWA story + clearest offline
toggling in DevTools).

## Walk-through

### 1. Sign in (≈30s)

- Open <http://localhost:3004>.
- The teacher lands on `/login`. Sign in.
- Land on `/teacher/agent`.
- Talking points:
  - "One auth surface, real Supabase session."
  - "The agent surface is the home for capture — that's where a
    teacher's day starts."

### 2. Text capture → review → save (≈90s)

- Type: *"Aiden built the pink tower today and got through it
  smoothly. He worked on the brown stair afterward — still resetting
  every couple of steps."*
- Click **Send**.
- Two proposal cards appear (Pink Tower → mastered/practising; Brown
  Stair → practising). Source quotes are shown beneath each.
- Talking points:
  - "Single multimodal Gemini call returns structured proposals."
  - "The agent never writes — it proposes."
  - Click into the level toggles to show editing.
- Edit one note. Click **Save 2 updates**.
- Show the confirmation chip (`Saved 2 updates.`) and switch to the
  `/teacher/grid` to show the cells now reflect the saved state.

### 3. Photo capture (≈90s)

- Back on `/teacher/agent`, click the camera icon.
- The first-time tooltip explains "in-app capture only — nothing from
  the camera roll."
- Approve the camera permission. Snap a photo of a printed handwritten
  observation note (have one on the desk).
- Send. The agent OCRs the note and proposes the same kinds of cards.
- Talking points:
  - "Photos travel as bytes for the duration of one request, then
    get dropped on the server."
  - "No file input anywhere — capture has to come from the phone or
    laptop camera."

### 4. Voice memo (≈60s)

- Click the mic icon. Speak: *"Mia did the trinomial cube
  independently for the first time today."*
- Stop, send.
- Same draft → review → save flow.
- Talking points:
  - "Same single-call pipeline — Gemini handles audio in the same
    structured-output prompt."

### 5. Attendance via natural language (≈45s)

- Type: *"Take attendance — everyone's here except Theo, he's home
  sick."*
- The agent proposes a batch of attendance entries with Theo marked
  absent and a note.
- Approve. Open `/teacher/attendance` to show the table.
- Talking points:
  - "One capture, multiple proposal types — observations, attendance,
    report drafts all share the same envelope."

### 6. Report generation (≈90s)

- Switch to admin: `/admin/reports`.
- Upload a sample DOCX template with placeholders like
  `{studentName}` and `{summary}`.
- Trigger a report generation for a student.
- Download both DOCX and PDF.
- Open the DOCX — placeholders are filled.
- Open the PDF — programmatically rendered, deterministic output.
- Talking points:
  - "DOCX is fill-the-blanks; PDF is generated from the same
    context so admins never need to convert by hand."

### 7. Offline (≈90s)

- Go to DevTools → Network → toggle **Offline**.
- The pill appears top-center: "Offline".
- On `/teacher/agent`, type: *"Lila finished the metal insets
  series."*
- Send. A system-style chat note confirms the capture was saved
  locally.
- Toggle Network back **Online**. The pill changes to
  "Syncing 1 capture…", then disappears. The drained capture appears
  in the chat as a regular reviewable draft.
- Approve. Talking points:
  - "Even drained captures need the same review — we never auto-save
    what was captured offline."
  - "Bytes survive across reload because the queue lives in
    IndexedDB, not memory."

### 8. PWA install (≈30s, optional)

- Chrome → install the app from the URL bar.
- Open the standalone window. The shell loads instantly from the
  service worker cache; no browser chrome.

### 9. Cleanup pitch (≈15s)

- "If we don't ship this, one command removes the entire schema:
  `npm run teardown:montessori --workspace=apps/backend`. The rest of
  Mitable is untouched."

## Recovery moves

- **Camera/mic permission denied.** Reset the site permission and
  reload — the components show clear inline errors but won't recover
  without a re-grant.
- **Backend 500s on confirm.** Most likely a stale auth token from a
  Supabase session restart. Sign out + sign in.
- **Offline queue stuck.** The drain auto-runs on the `online` event.
  If you toggled Network through DevTools, the event fires reliably;
  if you toggled OS-level wifi, give the browser a couple seconds.
- **Demo data drift.** Re-run `teardown:montessori` →
  `migrate:0052` → `seed:montessori`. Idempotent.
