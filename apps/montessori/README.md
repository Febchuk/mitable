# Mitable for Montessori

A web-only Montessori prototype that runs alongside the existing Mitable
backend. Teachers capture observations by typing a note, taking an
in-app photo of handwritten records, or recording a quick voice memo;
an AI agent drafts attendance, daily-progress, and report updates; the
teacher reviews and approves before anything is written. Admins manage
curriculum and report templates.

This app is intentionally separate from the rest of the monorepo:
- Lives at `apps/montessori`, served on port `3004`.
- Talks to the existing Express backend via `/api/montessori/*`.
- Domain types stay local (no cross-app shared package).
- Database tables are namespaced `montessori_*` and can be wiped with a
  single teardown script if the prototype doesn't ship.

## Quick start

```bash
# 1. Install (root)
npm install

# 2. Copy env templates
cp apps/backend/.env.example apps/backend/.env
cp apps/montessori/.env.local.example apps/montessori/.env.local
#   Fill in DATABASE_URL, GEMINI_API_KEY, SUPABASE_*, etc.

# 3. Apply the Montessori migration
npm run migrate:0052 --workspace=apps/backend

# 4. Seed demo data (idempotent)
npm run seed:montessori --workspace=apps/backend

# 5. Run backend + Montessori app side by side
npm run dev --workspace=apps/backend       # :3000
npm run dev --workspace=apps/montessori    # :3004
```

Visit <http://localhost:3004>. Sign in with a Supabase user that's
linked to the seeded organization.

## Layout

```
apps/montessori/
├── public/                       # PWA manifest, sw.js, icon.svg, offline.html
├── src/
│   ├── app/
│   │   ├── (app)/                # Auth-gated route group
│   │   │   ├── teacher/          # /teacher/agent, /teacher/grid, etc.
│   │   │   └── admin/            # /admin/dashboard, /admin/reports, etc.
│   │   ├── login/
│   │   └── layout.tsx            # Root: Auth + PWA register
│   ├── components/
│   │   ├── agent/                # AgentView, PhotoCapture, AudioCapture, ProposalReviewPanel
│   │   ├── system/               # OfflinePill, PWARegister
│   │   └── ui/                   # shadcn primitives
│   ├── lib/
│   │   ├── api/                  # apiRequest + Supabase client
│   │   ├── auth/                 # AuthContext
│   │   ├── offline/              # captureQueue (IDB), drain hook, online status
│   │   └── query/                # React Query hooks
│   └── types/                    # Local Montessori types
├── tests/e2e/                    # Playwright smoke
├── playwright.config.ts
└── docs/
    ├── decisions.md
    └── demo.md
```

## Scripts

```bash
npm run dev          # Next dev server on :3004
npm run build        # Production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run test:e2e     # Playwright (capture → draft → review → save)
```

Backend-side helpers:

```bash
# Seed the demo Montessori org (idempotent)
npm run seed:montessori --workspace=apps/backend

# Wipe every montessori_* table — for cleanly retiring the prototype
npm run teardown:montessori --workspace=apps/backend
```

## Environment

`apps/montessori/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000   # backend origin
```

Backend env required for the Montessori surface (full list in
`apps/backend/.env.example`):

- `DATABASE_URL` — Postgres (Supabase)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` — multimodal interpretation + OCR + child match

## PWA + offline

- The app installs from any modern browser — manifest at
  `/manifest.webmanifest`, service worker at `/sw.js`.
- Captures made while offline are stored in IndexedDB and submitted to
  `/agent/interpret` on reconnect. Drained captures surface as drafts
  in the agent surface for the teacher to review — they are **never**
  auto-saved.
- The service worker hard-skips `/api/*` and `/auth/*` so live calls
  never get a stale response.

## Tests

```bash
# One-time (browser binaries)
npx playwright install chromium

# Run
npm run test:e2e --workspace=apps/montessori
```

The smoke is hermetic: backend is mocked at the network layer with
`page.route`, Supabase is faked via localStorage. It covers the core
invariant — agent proposes, human edits, edits round-trip to
`/agent/confirm` — without touching a real DB or Gemini.

## Privacy invariants (load-bearing)

1. **Capture is in-app only.** No file inputs anywhere — every photo
   and voice memo comes from `getUserMedia`. Nothing is uploaded from
   the user's camera roll.
2. **Raw media is never persisted.** Audio + image bytes ride in
   memory through the interpret request, are passed directly to
   Gemini, and are dropped immediately on response. Nothing hits
   storage.
3. **The agent never writes on its own.** Every save is a separate
   `/agent/confirm` request whose body is whatever the teacher
   approved in the review panel — even when the capture was drained
   from the offline queue.

See `docs/decisions.md` for the architectural choices behind those
invariants and `docs/demo.md` for a guided walk-through.
