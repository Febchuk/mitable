# Changelog

## v1.0.0 — 2026-04-08

### Summary

Seven-phase overhaul completing the pivot from "AI onboarding buddy" to "work context capture + time insights." Removed ~17.5K lines of dead backend code, ~3.6K lines of dead frontend code, and 609 lines of dead DB schema. Restructured 80+ flat backend services into 10 domain modules. Added 113 new tests.

---

### Removed: Backend Dead Code (Phase 1 + Phase 2, ~17.5K lines)

Features removed because they belong to the deprecated onboarding product:

- **Roadmap generation** — `roadmap.service.ts`, `roadmap-templates.schema.ts`, roadmap routes and controllers
- **Nudge system** — `nudge.service.ts`, nudge scheduling, nudge delivery routes
- **Expert matching** — `expert-matching.service.ts`, expert profile indexing
- **Just-in-time help** — `jit-help.service.ts`, help trigger evaluation
- **Document refinement chats** — `document-refinement-chats.schema.ts`, associated routes
- **Onboarding flows** — all onboarding step tracking, progress routes, completion events
- **Guide delivery** — `guides.ts` Zod schemas, guide-serving routes
- **`nudges.ts`** from `packages/shared` — dead shared type exports

---

### Removed: Frontend Dead Code (Phase 5, ~3.6K lines)

Electron Console components removed because they served the onboarding product and had no v1 callers:

- `CalendarView` — full calendar UI component and all date navigation logic
- `DatePickerModal` — standalone date picker dialog
- `WorkflowBuilder` — drag-and-drop workflow construction UI
- `MessagesView` — in-app messaging thread view
- `ChatsView` — chat conversation list and panel

---

### Removed: Dead Database Schemas (Phase 6, 609 lines)

- `roadmap-templates.schema.ts` — only referenced by `seed.ts`, never read at runtime
- `document-refinement-chats.schema.ts` — only referenced by the schema barrel export, no service consumers

---

### Added: Composite DB Indexes (Phase 6)

Added missing composite indexes on `(organization_id, created_at)` for:

- Session time-range queries
- Activity time-range queries

These eliminate sequential scans on the most common dashboard and insights queries.

---

### Changed: Backend Architecture — Flat to Domain Modules (Phase 3 + Phase 4)

**Before:** 80+ services in `src/services/`, 17 routes in `src/routes/`, 26 schemas in `src/db/schema/`, RLM agents scattered across `src/services/rlm/` and `src/services/classifier-rlm/`.

**After:** All business logic organized into 10 domain modules under `src/domains/`. Each domain owns its services, routes, schemas, RLM agents, and cron jobs.

| Domain | Responsibility |
|--------|---------------|
| `shared-infra` | Vector, embedding, LLM, cache, PII redaction, chunking, MCP, shared middleware |
| `capture` | Screenshot capture, Gemini Vision frame analysis, delta detection, audio transcription |
| `sessions` | Full session pipeline (ingestion → chunking → classification → summarization → indexing → title → delivery → retrieval), RLM agents, activity materialization |
| `workstreams` | Workstream detection, aggregation, socket emission, workstream RLM |
| `insights` | User activity queries, org/team dashboard queries |
| `benchmarks` | Benchmark scoring, AI-generated insights, admin benchmark routes |
| `updates` | Bragbook generation, recap RLM, master story, day-analyzer RLM |
| `agent` | Conversational AI agent, memory, search, trust ranking, knowledge tools |
| `integrations` | Slack, Notion, GitHub, Granola, Fireflies, Gmail, Linear, knowledge graph |
| `auth` | Stripe billing, subscriptions, usage, permissions, API keys, encryption |

Remaining top-level files (not in domains): `app.ts`, `index.ts`, `config.ts`, `routes.ts`, `db/`, `cron/index.ts`, `utils/`, `prompts/`, `retrievers/`, `scripts/`, `swagger.ts`.

**Design rule:** Cross-domain imports go through a domain's barrel `index.ts`. Direct imports into another domain's internal files are not permitted.

Architecture decision documented in `docs/adr/v1-architecture.md`.

---

### Added: BaseRlmRunner (Phase 4)

Extracted `BaseRlmRunner` to `src/domains/shared-infra/services/base-rlm-runner.ts`. Eliminates duplicated multi-provider LLM fallback loop (Claude Haiku → GPT-5 → DeepSeek) that was copy-pasted across six RLM agents. Each RLM agent now provides only its environment, prompts, tools, and config (~50 lines) rather than the full loop (~300+ lines).

Affected agents: classifier, block-analyzer, storyteller, refinement, day-analyzer, workstream.

---

### Added: Session Pipeline Facade (Phase 4)

Added `SessionPipeline` class in `src/domains/sessions/services/session-pipeline.ts`. Routes and cron jobs call the facade; individual pipeline stages (ingestion → chunking → classification → summarization → indexing → title → delivery) remain independently testable.

---

### Added: Test Coverage (Phase 7)

113 new tests added across 5 priority domains. Test totals: 17 suites, 282 tests.

| Domain | New tests |
|--------|----------|
| `shared-infra` | vector.service, embedding.service, llm.service, chunking.service |
| `auth` | auth middleware, encryption.service |
| `agent` | agent.service |
| `updates` | bragbook-generator.service |
| `integrations` | graph-scoring.service, graph-sync.service |

---

### Product Direction

Mitable v1 is a desktop app that passively captures how you work and provides time insights. The product has three value propositions:

1. Help individuals understand how they spend their time
2. Make it easy for employees to draft and share work updates
3. Give management visibility into how their team spends time

All onboarding, roadmap, nudge, expert-matching, and just-in-time help functionality has been removed.
