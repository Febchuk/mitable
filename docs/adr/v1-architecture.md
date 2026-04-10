# ADR-001: Mitable v1 Backend Architecture

- **Status:** Accepted
- **Date:** 2026-04-08
- **Implemented:** 2026-04-08

---

## 1. Context & Problem Statement

Mitable pivoted from "AI onboarding buddy" to "work context capture + time insights." Phase 1+2 removed ~17.5K lines of onboarding-era dead code. Phase 4 then restructured the backend from a flat layout into 10 domain modules.

**Pre-restructuring state (resolved):**

- 80 services in a flat `src/services/` directory
- 17 routes in flat `src/routes/`
- 26 schema files in flat `src/db/schema/`
- 23 RLM files in `src/services/rlm/` (6 distinct agents)
- 4 classifier-rlm files in `src/services/classifier-rlm/`
- 12 graph service files in `src/services/graph/`
- 11 cron jobs in `src/cron/jobs/`
- 9 MCP files in `src/mcp/`

The flat structure made it hard to understand which services belonged to which feature, reason about cross-domain dependencies, onboard new developers, and test domains in isolation. Additionally, the RLM pattern was duplicated across 6 services with identical multi-provider LLM fallback logic, and several dead schemas shipped in the schema barrel export.

**Current state (post-Phase 4):**

All business logic now lives under `src/domains/` in 10 domain modules. Dead schemas (`roadmap-templates.schema.ts`, `document-refinement-chats.schema.ts`) have been removed. A `BaseRlmRunner` in `shared-infra/services/base-rlm-runner.ts` eliminates the duplicated RLM loop pattern. Composite indexes on `(organization_id, created_at)` have been added for session and activity time-range queries.

---

## 2. Decision Drivers

1. **Navigability** — Find code by domain, not alphabetically in a list of 80 files
2. **Testability** — Domains should be independently buildable and testable
3. **Onboarding** — New developers should understand boundaries without reading every service
4. **Minimal disruption** — No business logic changes; purely structural reorganization
5. **Incremental migration** — Must be executable domain-by-domain, not as a big-bang

---

## 3. Decisions

### 3.1 Backend Domain Structure

**Decision: Reorganize `src/services/` into `src/domains/` with 10 domain modules.**

Each domain owns its services, routes, schemas, RLM agents, and cron jobs. Cross-domain imports go through barrel exports (`index.ts`), never into internal files.

```
src/domains/
  capture/
  sessions/
  workstreams/
  insights/
  benchmarks/
  updates/
  agent/
  integrations/
  auth/
  shared-infra/
```

**Rationale:** The 11 core pillars map cleanly to these 10 domains (capture + activity-tracking + session-management merge into "sessions" since they share the same data pipeline; desktop-shell stays in `apps/electron/`).

### 3.2 Session Service Consolidation

**Decision: Do NOT merge the 8 session-* services. Colocate them and add a `SessionPipeline` facade.**

The session pipeline is a genuine multi-stage pipeline with distinct responsibilities:

```
ingestion → chunking → classification → summarization → indexing → title → delivery → retrieval
```

Merging would create a god-service. Instead:
- Move all 8 into `src/domains/sessions/services/`
- Create a `SessionPipeline` class that orchestrates the stages in order
- Routes and cron jobs call the facade; individual stages remain testable in isolation

### 3.3 Workstream Service Consolidation

**Decision: Partially merge.**

- Merge `workstream-detection.service.ts` + `workstream-aggregation.service.ts` into a single `workstream.service.ts` (they are tightly coupled — detection always feeds aggregation)
- Keep `workstream-rlm.service.ts` separate (follows RLM pattern)
- Keep `workstream-socket-emitter.ts` separate (infrastructure glue)

### 3.4 RLM Agent Pattern Standardization

**Decision: Extract a `BaseRlmRunner` in shared-infra.**

Every RLM agent currently duplicates the same pattern:
1. Initialize Anthropic / OpenAI / DeepSeek clients in constructor
2. Build system prompt + user prompt from environment
3. Enter a tool-call loop: LLM decision → execute tool → append result → repeat
4. Multi-provider fallback: Claude Haiku → GPT-5 → DeepSeek

This is duplicated across `block-analyzer-rlm.service.ts`, `storyteller-rlm.service.ts`, `day-analyzer-rlm.service.ts`, `classifier-rlm.service.ts`, `refinement-rlm.service.ts`, and partially in `recap-rlm.service.ts`.

The `BaseRlmRunner` should:
- Accept: environment class, prompts factory, tools map, max iterations
- Handle: client initialization, fallback chain, tool-call loop, logging, error recovery
- Return: typed result from the final environment state

Each RLM agent becomes ~50 lines (environment + prompts + tools + config), down from ~300+.

### 3.5 Schema Organization

**Decision: Colocate schemas with their domains. Keep a root re-export barrel for Drizzle.**

Current dead schemas to remove:
- `roadmap-templates.schema.ts` — only referenced by seed.ts (not runtime)
- `document-refinement-chats.schema.ts` — only referenced by index.ts barrel

Schemas that must stay despite being onboarding-adjacent:
- `workflows.schema.ts` — `conversations.schema.ts` imports `workflowSessions` from it
- `conversations.schema.ts` — used by `agent.service.ts`, `memory.service.ts`, `admin.ts`, `base.tool.ts`

After domain restructuring, `src/db/schema/index.ts` becomes a thin re-export file that imports from each domain's `schema/` directory. Drizzle config points to this single barrel.

**Indexing recommendation:** Add composite indexes on `(organization_id, created_at)` for session and activity time-range queries.

### 3.6 Electron-Backend Boundary

**Decision: Keep the current boundary. No processing moves to Electron.**

| Layer | Responsibility |
|-------|---------------|
| **Electron** | Screenshot capture, activity tracking (keyboard/mouse/clipboard), window detection, local frame storage, session state machine, passive monitor |
| **Backend** | All AI processing, all persistent storage, all integrations, vector operations, cron jobs |

Reasons to keep the split:
- AI models require API keys that should not ship to client devices
- Vector operations require server-side Pinecone access
- Offline AI would require shipping large models with the app — not practical for v1
- MCP tools query the DB directly, reinforcing backend as single source of truth

**Recommendation for v1.1:** Batch frame uploads. Currently frames go to backend individually; batching would reduce network calls and allow the backend to process them as a group.

### 3.7 Shared Package (`packages/shared`)

**Decision: Do NOT restructure by domain yet.**

With only 13 files, domain directories would add structure without benefit. Instead:
- Keep flat layout
- Adopt naming convention: `{domain}.types.ts` (partially followed already: `billing.ts`, `documents.ts`, `session.ts`, `workstream.ts`)
- Group IPC channels by domain within `ipc.ts` using comment sections
- Remove dead exports: `guides.ts` Zod schemas (verify `base.tool.ts` still needs `SolutionObject`), `nudges.ts`
- Revisit domain directories when shared exceeds ~25 files

### 3.8 Observability

**Decision: Standardize Pino logging, add pipeline timing, defer distributed tracing.**

Current state:
- Backend uses Pino via `createLogger` — but some files still use `console.log`
- Electron uses a custom logger
- `correlationId` middleware exists but doesn't propagate through async service calls

Recommendations:
1. **Standardize `createLogger`** — audit and replace all `console.log` in services with structured Pino calls
2. **Add context fields** to every log: `{ domain, sessionId, organizationId, userId, durationMs }`
3. **Add pipeline timing** — each session pipeline stage emits start/end with duration (enables bottleneck detection)
4. **Add `/healthz` endpoint** with per-domain error counters and cron job status
5. **Defer OpenTelemetry** to v1.1 — high effort for low initial value at current scale

---

## 4. Target Directory Layout

### Backend: `apps/backend/src/`

```
domains/
├── capture/
│   └── services/
│       ├── frame-analysis.service.ts
│       ├── gemini-vision-frame.service.ts
│       ├── screenshot.service.ts
│       ├── deltaDetection.service.ts
│       └── groq-vision.service.ts
│
├── sessions/
│   ├── services/
│   │   ├── session-chunking.service.ts
│   │   ├── session-classification.service.ts
│   │   ├── session-delivery.service.ts
│   │   ├── session-indexing.service.ts
│   │   ├── session-ingestion.service.ts
│   │   ├── session-retriever.service.ts
│   │   ├── session-summarization.service.ts
│   │   ├── session-title.service.ts
│   │   ├── session-pipeline.ts              # NEW: orchestration facade
│   │   ├── stale-session-cleanup.service.ts
│   │   ├── continuation-detector.service.ts
│   │   ├── intermediate-summary.service.ts
│   │   ├── summary-refinement.service.ts
│   │   ├── block-analyzer-materializer.service.ts
│   │   ├── block-analyzer-orchestrator.service.ts
│   │   ├── activity-materializer.service.ts
│   │   └── classifier.service.ts
│   ├── rlm/
│   │   ├── classifier/                      # from classifier-rlm/
│   │   │   ├── classifier-environment.ts
│   │   │   ├── classifier-rlm-prompts.ts
│   │   │   ├── classifier-rlm.service.ts
│   │   │   └── classifier-tools.ts
│   │   ├── block-analyzer/                  # from rlm/block-analyzer-*
│   │   │   ├── block-analyzer-environment.ts
│   │   │   ├── block-analyzer-rlm-prompts.ts
│   │   │   ├── block-analyzer-rlm.service.ts
│   │   │   └── block-analyzer-tools.ts
│   │   ├── storyteller/                     # from rlm/storyteller-*
│   │   │   ├── storyteller-environment.ts
│   │   │   ├── storyteller-rlm-prompts.ts
│   │   │   ├── storyteller-rlm.service.ts
│   │   │   └── storyteller-tools.ts
│   │   └── refinement/                      # from rlm/refinement-*
│   │       ├── refinement-rlm.service.ts
│   │       └── refinement-tools.ts
│   ├── routes/
│   │   └── monitoring.ts
│   ├── schema/
│   │   ├── monitoring.schema.ts
│   │   ├── session-chunks.schema.ts
│   │   ├── session-refinement-chats.schema.ts
│   │   └── daily-activities.schema.ts
│   └── cron/
│       └── stale-session-cleanup.job.ts     # extracted from inline in cron/index.ts
│
├── workstreams/
│   ├── services/
│   │   ├── workstream.service.ts            # merged detection + aggregation
│   │   └── workstream-socket-emitter.ts
│   ├── rlm/
│   │   ├── workstream-environment.ts
│   │   ├── workstream-rlm-prompts.ts
│   │   └── workstream-tools.ts
│   └── schema/
│       └── workstreams.schema.ts
│
├── insights/
│   ├── services/
│   │   ├── user-activity-queries.ts
│   │   └── org-team-activity-query.service.ts
│   ├── routes/
│   │   ├── my-activity.ts
│   │   └── admin-dashboard.ts
│   └── schema/
│       └── analytics.schema.ts
│
├── benchmarks/
│   ├── services/
│   │   ├── benchmark.service.ts
│   │   ├── benchmark-compute.service.ts
│   │   └── benchmark-ai.service.ts
│   ├── routes/
│   │   ├── my-benchmarks.ts
│   │   └── admin-benchmarks.ts
│   ├── schema/
│   │   └── benchmarks.schema.ts
│   └── cron/
│       └── benchmark-score.job.ts
│
├── updates/
│   ├── services/
│   │   ├── bragbook-generator.service.ts
│   │   ├── recap-rlm.service.ts
│   │   └── master-story.service.ts
│   ├── rlm/
│   │   └── day-analyzer/
│   │       ├── day-analyzer-environment.ts
│   │       ├── day-analyzer-rlm-prompts.ts
│   │       ├── day-analyzer-rlm.service.ts
│   │       └── day-analyzer-tools.ts
│   ├── routes/
│   │   └── my-bragbook.ts
│   ├── schema/
│   │   ├── bragbook.schema.ts
│   │   └── recaps.schema.ts
│   └── cron/
│       └── bragbook-generate.job.ts
│
├── agent/
│   ├── services/
│   │   ├── agent.service.ts
│   │   ├── memory.service.ts
│   │   ├── trust-ranking.service.ts
│   │   ├── search-logger.service.ts
│   │   ├── search.service.ts
│   │   └── intent.service.ts
│   ├── agents/
│   │   ├── base.agent.ts
│   │   ├── knowledge.agent.ts
│   │   └── text-response.agent.ts
│   ├── tools/
│   │   ├── base.tool.ts
│   │   ├── respond-text.tool.ts
│   │   ├── search-knowledge.tool.ts
│   │   └── view-code.tool.ts
│   ├── rlm/
│   │   ├── ask-environment.ts
│   │   ├── ask-rlm-prompts.ts
│   │   ├── ask-tools.ts
│   │   ├── agent-query-environment.ts
│   │   ├── agent-query-prompts.ts
│   │   └── agent-query-tools.ts
│   ├── routes/
│   │   └── agent.ts
│   └── schema/
│       ├── agent-chats.schema.ts
│       ├── ask-threads.schema.ts
│       ├── conversations.schema.ts
│       └── user-memories.schema.ts
│
├── integrations/
│   ├── common/
│   │   └── (shared integration patterns if extracted later)
│   ├── slack/
│   │   ├── slack.service.ts
│   │   ├── slack-ingestion.service.ts
│   │   └── slack-chunking.service.ts
│   ├── notion/
│   │   ├── notion.service.ts
│   │   ├── notion-ingestion.service.ts
│   │   ├── notion-chunking.service.ts
│   │   ├── notion-export.service.ts
│   │   └── notion-user-oauth.service.ts
│   ├── github/
│   │   ├── github.service.ts
│   │   ├── github-ingestion.service.ts
│   │   ├── github-chunking.service.ts
│   │   ├── github-sync.service.ts
│   │   └── github-code-snapshot.service.ts
│   ├── granola/
│   │   ├── granola.service.ts
│   │   └── granola-sync.service.ts
│   ├── fireflies/
│   │   ├── fireflies.service.ts
│   │   └── fireflies-sync.service.ts
│   ├── email/
│   │   ├── gmail.service.ts
│   │   └── google-docs-export.service.ts
│   ├── linear/
│   │   └── linear.service.ts
│   ├── graph/
│   │   ├── graph-client.service.ts
│   │   ├── graph-context-builder.service.ts
│   │   ├── graph-incremental-sync.service.ts
│   │   ├── graph-mapper.service.ts
│   │   ├── graph-retrieval.service.ts
│   │   ├── graph-scoring.service.ts
│   │   ├── graph-sync.service.ts
│   │   ├── task-archetype-map.ts
│   │   └── types.ts
│   ├── routes/
│   │   └── integrations.ts
│   ├── schema/
│   │   ├── integrations.schema.ts
│   │   ├── search-content.schema.ts
│   │   ├── graph-sync.schema.ts
│   │   └── github/
│   │       ├── github-repos.schema.ts
│   │       ├── github-commits.schema.ts
│   │       ├── github-pull-requests.schema.ts
│   │       └── github-issues.schema.ts
│   └── cron/
│       ├── graph-sync.job.ts
│       ├── granola-sync.job.ts
│       └── fireflies-sync.job.ts
│
├── auth/
│   ├── services/
│   │   ├── stripe.service.ts
│   │   ├── subscription.service.ts
│   │   ├── usage.service.ts
│   │   ├── permissions.service.ts
│   │   ├── userPermissions.service.ts
│   │   ├── api-key.service.ts
│   │   ├── encryption.service.ts
│   │   ├── known-customers.service.ts
│   │   └── normalize-name.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── billing.ts
│   │   ├── stripe.ts
│   │   ├── admin.ts
│   │   ├── api-keys.ts
│   │   ├── feedback.ts
│   │   └── pii.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── authorization.ts
│   │   ├── rateLimiter.ts
│   │   └── usage.ts
│   └── schema/
│       ├── users.schema.ts
│       ├── organizations.schema.ts
│       ├── teams.schema.ts
│       ├── user-permissions.schema.ts
│       ├── api-keys.schema.ts
│       └── billing.schema.ts
│
└── shared-infra/
    ├── services/
    │   ├── vector.service.ts
    │   ├── embedding.service.ts
    │   ├── llm.service.ts
    │   ├── cache.service.ts
    │   ├── socket.service.ts
    │   ├── pii-redaction.service.ts
    │   ├── chunking.service.ts
    │   └── base-rlm-runner.ts               # NEW: shared RLM execution engine
    ├── lib/
    │   ├── logger.ts
    │   ├── aiLogger.ts
    │   ├── analytics.ts
    │   ├── sentry.ts
    │   ├── supabase.ts
    │   ├── parse-json.ts
    │   ├── dev-log-buffer.ts
    │   ├── feedback-log-sanitize.ts
    │   └── sessionLogger.ts
    ├── middleware/
    │   ├── correlationId.ts
    │   ├── errorHandler.ts
    │   └── requestLogger.ts
    └── mcp/
        ├── auth.ts
        ├── index.ts
        ├── transport.ts
        ├── resources/
        │   └── organization.ts
        └── tools/
            ├── documents.ts
            ├── integrations.ts
            ├── metrics.ts
            ├── recaps.ts
            └── sessions.ts
```

### Remaining top-level files (not in domains/)

```
src/
├── app.ts                    # Express app setup, domain route registration
├── index.ts                  # Server entry point
├── config.ts                 # Environment config
├── routes.ts                 # Route barrel (imports from domains/*/routes/)
├── db/
│   ├── database.ts           # Drizzle client initialization
│   ├── schema/
│   │   └── index.ts          # Barrel re-exporting all domain schemas
│   └── migrations/           # Drizzle migration files
├── cron/
│   └── index.ts              # Cron scheduler (imports jobs from domains)
└── scripts/                  # One-off migration/sync scripts
```

---

## 5. Data Flow Diagrams

### 5.1 Screenshot Capture → Activity Insights

```
Electron                           Backend
────────                           ───────
captureService.ts                  
  ↓ screenshot                     
frameQueueService.ts               
  ↓ queued frames                  
  ───── HTTP POST /monitoring ───→ monitoring.ts route
                                     ↓
                                   frame-analysis.service.ts
                                     ↓ (Gemini Vision)
                                   session-ingestion.service.ts
                                     ↓
                                   session-chunking.service.ts
                                     ↓
                                   session-classification.service.ts
                                     ↓ (classifier RLM)
                                   session-summarization.service.ts
                                     ↓ (storyteller RLM)
                                   session-indexing.service.ts
                                     ↓ (embedding → Pinecone)
                                   session-title.service.ts
                                     ↓
                                   activity-materializer.service.ts
                                     ↓ (block-analyzer RLM)
                                     ↓
                                   daily-activities table
                                     ↓
                                   user-activity-queries.ts → GET /my-activity
                                   org-team-activity-query.ts → GET /admin/dashboard
```

### 5.2 Agent Query Flow

```
Console (Agent Tab)
  ↓ user message
  ───── POST /agent/chat ───→ agent.ts route
                                ↓
                              agent.service.ts
                                ↓ select agent (knowledge vs text-response)
                              knowledge.agent.ts
                                ↓
                              search-knowledge.tool.ts
                                ↓
                              search.service.ts
                                ↓ embed query
                              embedding.service.ts → OpenAI
                                ↓ vector search
                              vector.service.ts → Pinecone
                                ↓ rank results
                              trust-ranking.service.ts
                                ↓ generate response
                              respond-text.tool.ts → Groq LLM
                                ↓
                              ← streamed response
```

### 5.3 Integration Sync Flow

```
Cron Scheduler (every 15 min)
  ↓
  ┌─ granola-sync.job.ts ─→ granola.service.ts ─→ classify → upsert activity_blocks
  ├─ fireflies-sync.job.ts ─→ fireflies.service.ts ─→ classify → upsert activity_blocks
  └─ graph-sync.job.ts (nightly) ─→ graph-sync.service.ts ─→ refresh graph views

Integration OAuth connect (user-initiated)
  ↓ POST /integrations/connect
  ↓ OAuth flow
  ↓ POST /integrations/sync
  slack-ingestion.service.ts / notion-ingestion.service.ts / github-ingestion.service.ts
    ↓ fetch data from API
    ↓ chunk content
  {platform}-chunking.service.ts
    ↓ embed chunks
  embedding.service.ts → OpenAI
    ↓ store vectors
  vector.service.ts → Pinecone
    ↓ store metadata
  search-content table
```

### 5.4 Benchmark & BragBook Pipeline

```
Cron Scheduler
  ↓ daily 02:30 UTC
  benchmark-score.job.ts
    ↓ query activity data
  benchmark-compute.service.ts
    ↓ compute scores
  benchmark-ai.service.ts (AI-generated insights)
    ↓ store
  benchmarks table
    ↓
  ↓ weekly/monthly/quarterly 03:00 UTC
  bragbook-generate.job.ts
    ↓ gather activity + benchmarks
  bragbook-generator.service.ts
    ↓ day-analyzer RLM
  recap-rlm.service.ts
    ↓ master story
  master-story.service.ts
    ↓ store
  bragbook + recaps tables
```

---

## 6. Migration Strategy (Completed)

**Approach used: Incremental, domain-by-domain. One domain per PR.**

Migration was completed in Phase 4 (2026-04-08). All 10 domains were migrated in the following order (chosen to minimize cross-domain breakage):

| Order | Domain | Risk rationale |
|-------|--------|----------------|
| 1 | shared-infra | Done first — 24+ importers for vector alone |
| 2 | benchmarks | Self-contained; only imports shared-infra |
| 3 | updates | Imports shared-infra + day-analyzer RLM |
| 4 | insights | Imports shared-infra + schemas |
| 5 | workstreams | Imports shared-infra |
| 6 | auth | Middleware used by all routes |
| 7 | integrations | Each sub-integration independent; large but modular |
| 8 | capture | Imports shared-infra |
| 9 | sessions | Most cross-domain deps; depends on capture, shared-infra, workstreams |
| 10 | agent | Depends on sessions (retriever), integrations (search), shared-infra |

**Import path convention (ESM with `.js` suffixes):**
```typescript
// Via barrel:
import { vectorService } from "../shared-infra/index.js";
// Or direct internal import within same domain:
import { vectorService } from "../services/vector.service.js";
```

Cross-domain imports must always go through the target domain's barrel `index.ts`, never into internal files.

---

## 7. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **ESM import path breakage** | High — app won't start | Medium | Typecheck after every domain move; TypeScript will flag all broken imports |
| **Circular dependencies between domains** | Medium — build failure | Low | Barrel exports enforce direction; shared-infra breaks cycles; lint rule to prevent domain→domain direct imports |
| **Cron jobs break silently** | High — missed data processing | Medium | After each move, run cron job handlers once in test mode; add startup verification that all jobs resolve their imports |
| **Git blame history loss** | Low — debugging friction | Certain | Use `git mv` (not copy+delete) for every file; `git log --follow` still works |
| **Developer velocity drop during migration** | Medium — PR conflicts | Medium | Batch each domain into a single PR; merge within 1 day; coordinate with active contributors |
| **MCP tools break** | Medium — external tool integrations fail | Low | MCP tools query DB directly (not services) — only schema import paths change |
| **Dead schemas still exported** | Low — unused code ships | Certain | Remove `roadmap-templates.schema.ts` and `document-refinement-chats.schema.ts` before or during migration |

---

## 8. Open Questions

These should be resolved during implementation:

1. **`workflows.schema.ts`** — `conversations.schema.ts` imports `workflowSessions` from it. Should `workflowSessions` be merged into `conversations.schema.ts` to eliminate the dead-looking file? Or keep separate until conversations schema itself is audited?

2. **`documents.schema.ts`** — Used by MCP tools, my-activity, admin-dashboard. Lives in which domain? (Proposed: agent domain, since documents are agent-generated artifacts)

3. **`known-customers.service.ts`** — Used by block-analyzer and admin routes. Lives in auth domain (customer data) or sessions domain (block-analyzer consumer)? (Proposed: auth, since it's org-level reference data)

4. **`deepgramTranscriptionService.ts` + `audio.ts` route + `audioWebSocketService.ts`** — These are live (audio capture pipeline). Which domain? (Proposed: capture, since audio is a capture modality)

5. **`railway-logs.service.ts`** — Infrastructure utility. (Proposed: shared-infra)

6. **`skillsStore.ts`** (Electron service) — Is this still used after onboarding removal? Needs audit.

7. **Should `src/routes.ts` be kept as a central barrel, or should `app.ts` import routes directly from each domain?** (Proposed: keep central barrel for now — simpler migration, can flatten later)

---

## 9. Service Responsibility Map

Complete mapping of every current service to its target domain:

### capture/
| Service | Responsibility |
|---------|---------------|
| `frame-analysis.service.ts` | Analyze screenshot frames with Gemini Vision |
| `gemini-vision-frame.service.ts` | Gemini Vision API client for frame analysis |
| `screenshot.service.ts` | Screenshot storage and retrieval |
| `deltaDetection.service.ts` | Detect meaningful changes between frames |
| `groq-vision.service.ts` | Alternative vision model client |
| `deepgramTranscriptionService.ts` | Audio transcription |

### sessions/
| Service | Responsibility |
|---------|---------------|
| `session-ingestion.service.ts` | Ingest raw session data from captures |
| `session-chunking.service.ts` | Break sessions into semantic chunks |
| `session-classification.service.ts` | Classify session activity type |
| `session-summarization.service.ts` | Generate session summaries |
| `session-indexing.service.ts` | Embed and index sessions in Pinecone |
| `session-title.service.ts` | Generate human-readable session titles |
| `session-delivery.service.ts` | Deliver processed session data to consumers |
| `session-retriever.service.ts` | Retrieve sessions by similarity/filter |
| `stale-session-cleanup.service.ts` | Auto-end abandoned sessions |
| `continuation-detector.service.ts` | Detect if new activity continues a session |
| `intermediate-summary.service.ts` | Mid-session summary snapshots |
| `summary-refinement.service.ts` | Improve summary quality iteratively |
| `block-analyzer-materializer.service.ts` | Materialize block analysis into DB |
| `block-analyzer-orchestrator.service.ts` | Orchestrate block analysis pipeline |
| `activity-materializer.service.ts` | Materialize activity data from sessions |
| `classifier.service.ts` | Lightweight session classifier |

### workstreams/
| Service | Responsibility |
|---------|---------------|
| `workstream-detection.service.ts` | Detect workstream boundaries → merge into `workstream.service.ts` |
| `workstream-aggregation.service.ts` | Aggregate workstream data → merge into `workstream.service.ts` |
| `workstream-socket-emitter.ts` | Real-time workstream updates via WebSocket |

### insights/
| Service | Responsibility |
|---------|---------------|
| `user-activity-queries.ts` | Query activity data for individual users |
| `org-team-activity-query.service.ts` | Query activity data for org/team dashboards |

### benchmarks/
| Service | Responsibility |
|---------|---------------|
| `benchmark.service.ts` | Benchmark CRUD and retrieval |
| `benchmark-compute.service.ts` | Compute benchmark scores from activity data |
| `benchmark-ai.service.ts` | AI-generated benchmark insights |

### updates/
| Service | Responsibility |
|---------|---------------|
| `bragbook-generator.service.ts` | Generate polished accomplishment summaries |
| `recap-rlm.service.ts` | RLM-powered recap generation |
| `master-story.service.ts` | Aggregate session stories into master narrative |

### agent/
| Service | Responsibility |
|---------|---------------|
| `agent.service.ts` | Central agent orchestrator (tool selection, conversation management) |
| `memory.service.ts` | Agent memory / conversation history |
| `trust-ranking.service.ts` | Rank search results by trust/relevance |
| `search-logger.service.ts` | Log search queries and results |
| `search.service.ts` | Unified search across vectors + integrations |
| `intent.service.ts` | Classify user intent for agent routing |

### integrations/ (by sub-domain)
| Sub-domain | Services |
|-----------|---------|
| slack | `slack.service.ts`, `slack-ingestion.service.ts`, `slack-chunking.service.ts` |
| notion | `notion.service.ts`, `notion-ingestion.service.ts`, `notion-chunking.service.ts`, `notion-export.service.ts`, `notion-user-oauth.service.ts` |
| github | `github.service.ts`, `github-ingestion.service.ts`, `github-chunking.service.ts`, `github-sync.service.ts`, `github-code-snapshot.service.ts` |
| granola | `granola.service.ts`, `granola-sync.service.ts` |
| fireflies | `fireflies.service.ts`, `fireflies-sync.service.ts` |
| email | `gmail.service.ts`, `google-docs-export.service.ts` |
| linear | `linear.service.ts` |
| graph | 9 files (client, context-builder, incremental-sync, mapper, retrieval, scoring, sync, task-archetype-map, types) |

### auth/
| Service | Responsibility |
|---------|---------------|
| `stripe.service.ts` | Stripe API client |
| `subscription.service.ts` | Subscription lifecycle management |
| `usage.service.ts` | Usage tracking and rate limiting |
| `permissions.service.ts` | Permission checking |
| `userPermissions.service.ts` | User-level permission management |
| `api-key.service.ts` | API key CRUD and validation |
| `encryption.service.ts` | Encryption utilities |
| `known-customers.service.ts` | Org-level customer reference data |
| `normalize-name.ts` | Name normalization utility |

### shared-infra/
| Service | Responsibility |
|---------|---------------|
| `vector.service.ts` | Pinecone vector operations (24 importers) |
| `embedding.service.ts` | OpenAI text embeddings (13 importers) |
| `llm.service.ts` | Multi-provider LLM client |
| `cache.service.ts` | In-memory cache with TTL |
| `socket.service.ts` | WebSocket server management |
| `pii-redaction.service.ts` | PII detection and redaction |
| `chunking.service.ts` | Generic text chunking utilities |
| `base-rlm-runner.ts` | NEW — shared RLM execution engine |

---

## 10. Verification Checklist

Migration completed 2026-04-08:

- [x] `npm run typecheck` — all workspaces pass
- [x] `npm run lint` — no new errors
- [x] `npm run test` — 17 suites, 282 tests pass (113 new tests added in Phase 7)
- [x] `npm run build` — production build succeeds
- [x] `npm run dev` — app starts, all routes respond
- [x] Cron jobs fire on schedule (verify in Railway logs)
- [x] MCP tools function correctly (test via MCP client)
- [x] No circular dependency warnings in build output
- [x] `git log --follow` works on moved files
- [x] Every service file exists in exactly one domain (no orphans in old `src/services/`)
