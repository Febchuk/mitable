# Mitable v0 → v1 Complete Overhaul — claude-flow Orchestration Prompt

## Context

Mitable is a desktop app (Electron + React + TypeScript) with an Express backend and Next.js marketing website. It passively captures how you work (screenshots, activity, app context) and uses AI to help individuals understand their time, draft work updates, and give management visibility.

**The product pivoted** from an "AI Onboarding Buddy" (contextual help, roadmaps, nudges, expert matching) to a **work context capture + time insights + update drafting** tool. The codebase still carries massive onboarding-era dead code that must be pruned before building v1.

### Monorepo Structure

```
mitable/
├── apps/
│   ├── backend/           # Express API (Drizzle ORM, AI services, port 3000)
│   ├── electron/          # Desktop app (multi-window Electron + React)
│   ├── chrome-extension/  # Browser extension for web activity context
│   └── website/           # Next.js 15 marketing + billing site (port 3003)
└── packages/
    └── shared/            # Shared types, Zod schemas, IPC channel definitions
```

### Tech Stack

- **Desktop**: Electron + React 18 + TypeScript + Tailwind CSS v3 + electron-vite
- **Backend**: Node.js + Express + TypeScript + Drizzle ORM (ESM module)
- **Website**: Next.js 15 + React 19 + Tailwind CSS v4 + Supabase Auth
- **Database**: PostgreSQL (Supabase) + Pinecone (vector embeddings, 1536 dimensions)
- **AI**: Google Gemini 2.5 Flash (Vision/Chat), OpenAI embeddings (text-embedding-3-large), Groq (chat)
- **Payments**: Stripe (billing, subscriptions)
- **Monorepo**: npm workspaces + Turborepo

---

## v1 Core Functionality (KEEP — 11 Pillars)

### 1. Work Context Capture

Screenshot capture at configurable intervals, active window detection, foreground app tracking.

- `apps/electron/src/services/captureService.ts`
- `apps/electron/src/services/capturePolicy.ts`
- `apps/electron/src/services/frameQueueService.ts`
- `apps/electron/src/services/localFrameStorage.ts`
- `apps/electron/src/services/windowDetectionService.ts`
- `apps/electron/src/services/macWindowFocusService.ts`
- `apps/electron/src/services/focusWindowTracker.ts`
- `apps/backend/src/services/screenshot.service.ts`

### 2. Activity Tracking

Keyboard, mouse, and clipboard event tracking via uiohook-napi. Activity metrics feed into session detection and time insights.

- `apps/electron/src/services/activityTracker.ts`

### 3. Session Management

Focused (manual) and passive (auto-detected) session lifecycle. State machine: disabled → detecting → active_session → ending → detecting/deferred.

- `apps/electron/src/services/monitoringSessionService.ts`
- `apps/electron/src/services/passiveMonitorService.ts`
- `apps/electron/src/services/checkpointService.ts`
- `apps/electron/src/services/recoveryManager.ts`
- `apps/backend/src/routes/monitoring.ts`
- `apps/backend/src/db/schema/monitoring.schema.ts`

### 4. AI Processing Pipeline

Frame analysis (Gemini Vision), session classification, workstream detection, summarization, vector indexing.

- `apps/backend/src/services/frame-analysis.service.ts`
- `apps/backend/src/services/gemini-vision-frame.service.ts`
- `apps/backend/src/services/session-classification.service.ts`
- `apps/backend/src/services/session-summarization.service.ts`
- `apps/backend/src/services/session-indexing.service.ts`
- `apps/backend/src/services/session-ingestion.service.ts`
- `apps/backend/src/services/session-chunking.service.ts`
- `apps/backend/src/services/session-title.service.ts`
- `apps/backend/src/services/session-retriever.service.ts`
- `apps/backend/src/services/session-delivery.service.ts`
- `apps/backend/src/services/workstream-detection.service.ts`
- `apps/backend/src/services/workstream-aggregation.service.ts`
- `apps/backend/src/services/workstream-rlm.service.ts`
- `apps/backend/src/services/classifier.service.ts`
- `apps/backend/src/services/continuation-detector.service.ts`
- `apps/backend/src/services/deltaDetection.service.ts`
- `apps/backend/src/services/intermediate-summary.service.ts`
- `apps/backend/src/services/summary-refinement.service.ts`
- `apps/backend/src/services/stale-session-cleanup.service.ts`
- `apps/backend/src/services/orchestrator.service.ts`
- `apps/backend/src/services/embedding.service.ts`
- `apps/backend/src/services/vector.service.ts`
- `apps/backend/src/services/chunking.service.ts`
- `apps/backend/src/services/llm.service.ts`
- `apps/backend/src/services/search.service.ts`
- `apps/backend/src/services/pii-redaction.service.ts`
- All RLM agents: `apps/backend/src/services/rlm/` (classifier, block-analyzer, day-analyzer, storyteller, workstream, refinement, ask)
- All classifier-rlm: `apps/backend/src/services/classifier-rlm/`
- `apps/backend/src/services/block-analyzer-materializer.service.ts`
- `apps/backend/src/services/block-analyzer-orchestrator.service.ts`
- `apps/backend/src/services/activity-materializer.service.ts`

### 5. Time Insights

How employees spend time across apps, projects, workstreams. MeView (employee) and Dashboard (admin).

- `apps/backend/src/routes/my-activity.ts`
- `apps/backend/src/routes/admin-dashboard.ts`
- `apps/backend/src/services/user-activity-queries.ts`
- `apps/backend/src/services/org-team-activity-query.service.ts`
- `apps/backend/src/db/schema/daily-activities.schema.ts`
- `apps/backend/src/db/schema/analytics.schema.ts`

### 6. Benchmarks

Individual and team performance benchmarks computed from session data.

- `apps/backend/src/routes/my-benchmarks.ts`
- `apps/backend/src/routes/admin-benchmarks.ts`
- `apps/backend/src/services/benchmark.service.ts`
- `apps/backend/src/services/benchmark-compute.service.ts`
- `apps/backend/src/services/benchmark-ai.service.ts`
- `apps/backend/src/db/schema/benchmarks.schema.ts`

### 7. Update Drafting (BragBook)

AI-assisted work update generation from captured session data, recaps, master stories.

- `apps/backend/src/routes/my-bragbook.ts`
- `apps/backend/src/services/bragbook-generator.service.ts`
- `apps/backend/src/services/recap-rlm.service.ts`
- `apps/backend/src/services/master-story.service.ts`
- `apps/backend/src/db/schema/bragbook.schema.ts`
- `apps/backend/src/db/schema/recaps.schema.ts`

### 8. Agent Tab

AI assistant in Console that answers questions about work context using captured session data + integrations.

- `apps/backend/src/routes/agent.ts`
- `apps/backend/src/services/agent.service.ts`
- `apps/backend/src/agents/` (all agent definitions)
- `apps/backend/src/services/rlm/ask-*.ts` (ask environment, prompts, tools)
- `apps/backend/src/services/rlm/agent-query-*.ts`
- `apps/backend/src/services/memory.service.ts`
- `apps/backend/src/services/trust-ranking.service.ts`
- `apps/backend/src/services/search-logger.service.ts`
- `apps/backend/src/db/schema/agent-chats.schema.ts`
- `apps/backend/src/db/schema/ask-threads.schema.ts`
- `apps/backend/src/db/schema/conversations.schema.ts` (verify if used by agent threads)
- `apps/backend/src/db/schema/user-memories.schema.ts`
- `apps/electron/src/services/agentSdkService.ts`

### 9. Integrations

External data source syncing: Slack, Notion, GitHub, Granola, Fireflies, Gmail, Google Docs, Linear.

- `apps/backend/src/routes/integrations.ts`
- `apps/backend/src/services/slack.service.ts`, `slack-ingestion.service.ts`, `slack-chunking.service.ts`
- `apps/backend/src/services/notion.service.ts`, `notion-ingestion.service.ts`, `notion-chunking.service.ts`, `notion-export.service.ts`, `notion-user-oauth.service.ts`
- `apps/backend/src/services/github.service.ts`, `github-ingestion.service.ts`, `github-chunking.service.ts`, `github-sync.service.ts`, `github-code-snapshot.service.ts`
- `apps/backend/src/services/granola.service.ts`, `granola-sync.service.ts`
- `apps/backend/src/services/fireflies.service.ts`, `fireflies-sync.service.ts`
- `apps/backend/src/services/gmail.service.ts`
- `apps/backend/src/services/google-docs-export.service.ts`
- `apps/backend/src/services/linear.service.ts`
- `apps/backend/src/db/schema/integrations.schema.ts`
- `apps/backend/src/db/schema/search-content.schema.ts`
- `apps/backend/src/db/schema/github/` (all GitHub schemas)
- `apps/backend/src/db/schema/graph-sync.schema.ts`
- `apps/backend/src/services/graph/` (knowledge graph services)

### 10. Auth & Billing

User management, organization management, teams, permissions, Stripe subscriptions.

- `apps/backend/src/routes/auth.ts`
- `apps/backend/src/routes/billing.ts`
- `apps/backend/src/routes/stripe.ts`
- `apps/backend/src/routes/admin.ts`
- `apps/backend/src/routes/api-keys.ts`
- `apps/backend/src/services/stripe.service.ts`
- `apps/backend/src/services/subscription.service.ts`
- `apps/backend/src/services/usage.service.ts`
- `apps/backend/src/services/permissions.service.ts`
- `apps/backend/src/services/userPermissions.service.ts`
- `apps/backend/src/services/api-key.service.ts`
- `apps/backend/src/services/encryption.service.ts`
- `apps/backend/src/services/cache.service.ts`
- `apps/backend/src/services/socket.service.ts`
- `apps/backend/src/services/normalize-name.ts`
- `apps/backend/src/middleware/` (auth middleware)
- `apps/backend/src/db/schema/users.schema.ts`
- `apps/backend/src/db/schema/organizations.schema.ts`
- `apps/backend/src/db/schema/teams.schema.ts`
- `apps/backend/src/db/schema/user-permissions.schema.ts`
- `apps/backend/src/db/schema/api-keys.schema.ts`
- `apps/backend/src/db/schema/billing.schema.ts`
- `apps/electron/src/services/authManager.ts`
- `apps/electron/src/services/keychainService.ts`

### 11. Desktop Shell & Chrome Extension

Multi-window Electron app + Chrome Extension for web context.

- `apps/electron/src/main.ts` (main process, window creation)
- `apps/electron/src/preload/` (all preload scripts)
- `apps/electron/src/renderer/console/` (main console app)
- `apps/electron/src/renderer/watchButton/` (floating trigger)
- `apps/electron/src/renderer/watchingPill/` (active monitoring indicator)
- `apps/electron/src/renderer/watchingPillDropdown/` (pill dropdown)
- `apps/electron/src/renderer/notifications/` (system notifications)
- `apps/electron/src/services/notificationService.ts`
- `apps/electron/src/services/preferencesService.ts`
- `apps/electron/src/services/updateService.ts`
- `apps/electron/src/services/installedAppsService.ts`
- `apps/electron/src/services/browserBridgeService.ts`
- `apps/chrome-extension/` (entire extension)

---

## Dead Code to PRUNE

### Confirmed Dead — Onboarding Era

| System                          | Files to Remove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Roadmaps/Onboarding**         | `apps/backend/src/routes/roadmaps.ts`, `apps/backend/src/db/schema/roadmap-templates.schema.ts`, `apps/backend/src/db/schema/user-roadmaps.schema.ts`, `apps/backend/src/services/guideGeneration.service.ts`, `apps/backend/src/routes/guides.routes.ts`, `apps/backend/src/services/skill-generation.service.ts`, `apps/electron/src/renderer/console/src/pages/OnboardingPage.tsx`                                                                                                                                                           |
| **Artifacts**                   | `apps/backend/src/routes/artifacts.ts`, `apps/backend/src/db/schema/artifacts.schema.ts`, `apps/backend/src/services/artifact-embedding.service.ts`, `apps/backend/src/services/artifact-storage.service.ts` — pre-existing TS errors confirm WIP/dead                                                                                                                                                                                                                                                                                          |
| **Document Generation**         | `apps/backend/src/routes/documents.ts`, `apps/backend/src/services/document-generation/` (agent.ts, environment.ts, tools.ts), `apps/backend/src/services/doc-generation.service.ts`, `apps/backend/src/services/doc-generation-stream.service.ts`, `apps/backend/src/services/doc-generation-config.ts`, `apps/backend/src/services/doc-refinement.service.ts`, `apps/backend/src/services/document-extraction.service.ts`, `apps/backend/src/db/schema/documents.schema.ts`, `apps/backend/src/db/schema/document-refinement-chats.schema.ts` |
| **Coordinate/Overlay Guidance** | `apps/backend/src/services/coordinate-converter.service.ts`, `apps/backend/src/services/gemini-vision.service.ts` (the old UI object detection — NOT `gemini-vision-frame.service.ts` which is live)                                                                                                                                                                                                                                                                                                                                            |
| **Audio/Transcription**         | `apps/backend/src/routes/audio.ts`, `apps/electron/src/services/audioWebSocketService.ts`, `apps/backend/src/services/deepgramTranscriptionService.ts`                                                                                                                                                                                                                                                                                                                                                                                          |
| **Workflow System**             | `apps/backend/src/services/workflow.service.ts`, `apps/backend/src/db/schema/workflows.schema.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Source Materials**            | `apps/backend/src/db/schema/source-materials.schema.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Known Customers**             | `apps/backend/src/services/known-customers.service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Verify Before Removing — May Have Live Dependencies

| System                    | Files                                                            | Check                                                |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| **Feedback Route**        | `apps/backend/src/routes/feedback.ts`                            | Is any frontend calling this endpoint?               |
| **PII Route**             | `apps/backend/src/routes/pii.ts`                                 | Is this used beyond the pii-redaction service?       |
| **Conversations Route**   | `apps/backend/src/routes/conversations.ts`                       | Does the Agent tab use this, or only agent.ts route? |
| **Intent Service**        | `apps/backend/src/services/intent.service.ts`                    | Is this used by the Agent system?                    |
| **Title Generation**      | `apps/backend/src/services/titleGeneration.service.ts`           | Is this used by sessions or only old conversations?  |
| **Editor Components**     | `apps/electron/src/renderer/components/editor/`                  | Does Agent tab chat use this rich text editor?       |
| **Calendar Components**   | `apps/electron/src/renderer/components/application/calendar/`    | Used in any console page?                            |
| **DatePicker Components** | `apps/electron/src/renderer/components/application/date-picker/` | Used in any console page?                            |

### Definite Cleanup — Duplicate/Broken Directories

| Item                                | Action                                |
| ----------------------------------- | ------------------------------------- |
| `apps/backend/src/mcp/resources 2/` | Remove (duplicate with space in name) |
| `apps/backend/src/mcp/tools 2/`     | Remove (duplicate with space in name) |
| `apps/electron/src/src/`            | Remove (nested duplicate renderer)    |

---

## Phase 1: Dead Code Audit

**claude-flow Agent: `code-analyzer`**

```
TASK: Perform a comprehensive dead code analysis of the Mitable monorepo.

CONTEXT: Mitable pivoted from "AI onboarding buddy" to "work context capture + time insights."
The onboarding-era features are dead code. The product's 11 core pillars are documented above.

CRITICAL — DO NOT FLAG AS DEAD:
- Agent system (agent.service.ts, agent.ts route, agents/, agentSdkService.ts,
  agent-chats.schema.ts, ask-threads.schema.ts, rlm/ask-*, rlm/agent-query-*)
- Chrome Extension (apps/chrome-extension/)
- Browser Bridge (browserBridgeService.ts)
- ALL session/monitoring/capture services
- ALL workstream/benchmark/bragbook services
- ALL integration services (slack, notion, github, granola, fireflies, gmail, linear)
- ALL auth/billing/stripe services
- ALL RLM agent services

ACTIONS:
1. Trace all imports/exports across apps/backend, apps/electron, apps/website, packages/shared
2. For each file in the "Confirmed Dead" list above, verify it has NO live imports
3. For each file in the "Verify Before Removing" list, trace dependencies and report findings
4. Identify any ADDITIONAL dead code not listed above (unused components, orphaned types, etc.)
5. Check packages/shared/src/ipc.ts for IPC channels that reference removed features
6. Check for unused npm dependencies in each workspace's package.json

OUTPUT: A JSON manifest at docs/dead-code-manifest.json:
{
  "confirmed_dead": {
    "routes": ["path/to/file.ts", ...],
    "services": [...],
    "schemas": [...],
    "components": [...],
    "electron_services": [...],
    "ipc_channels": ["CHANNEL_NAME", ...],
    "types": [...],
    "directories": [...]
  },
  "verified_safe_to_remove": {
    "feedback_route": { "verdict": "dead|live", "reason": "..." },
    "pii_route": { "verdict": "dead|live", "reason": "..." },
    "conversations_route": { "verdict": "dead|live", "reason": "..." },
    "intent_service": { "verdict": "dead|live", "reason": "..." },
    "title_generation": { "verdict": "dead|live", "reason": "..." },
    "editor_components": { "verdict": "dead|live", "reason": "..." },
    "calendar_components": { "verdict": "dead|live", "reason": "..." },
    "datepicker_components": { "verdict": "dead|live", "reason": "..." }
  },
  "additional_dead_code": [...],
  "unused_dependencies": {
    "backend": [...],
    "electron": [...],
    "website": [...],
    "shared": [...]
  }
}
```

---

## Phase 2: Dead Code Removal

**claude-flow Agent: `coder`**

```
TASK: Systematically remove all confirmed dead code from the Mitable monorepo using
the manifest from Phase 1 (docs/dead-code-manifest.json).

ORDER OF OPERATIONS (each step followed by typecheck verification):

Step 1 — Remove broken/duplicate directories:
  - Delete apps/backend/src/mcp/resources 2/
  - Delete apps/backend/src/mcp/tools 2/
  - Delete apps/electron/src/src/
  - Run: npm run typecheck

Step 2 — Remove dead backend routes:
  - Delete each route file in confirmed_dead.routes
  - Remove their import and app.use() registration from the Express app entry point
  - Run: npm run typecheck

Step 3 — Remove dead backend services:
  - Delete each service file in confirmed_dead.services
  - Remove their imports from any live files (replace with TODO comments if a live file
    references a dead service — this indicates a deeper cleanup needed)
  - Run: npm run typecheck

Step 4 — Remove dead DB schemas:
  - Delete each schema file in confirmed_dead.schemas
  - Remove their exports from apps/backend/src/db/schema/index.ts
  - Remove any references in Drizzle config
  - Run: npm run typecheck

Step 5 — Remove dead Electron services:
  - Delete each file in confirmed_dead.electron_services
  - Remove their imports from main.ts and any preload scripts
  - Run: npm run typecheck

Step 6 — Remove dead renderer components:
  - Delete each component/directory in confirmed_dead.components
  - Remove their imports from any live components/pages
  - Run: npm run typecheck

Step 7 — Remove dead pages:
  - Delete OnboardingPage.tsx (and any other confirmed dead pages)
  - Remove from router/navigation
  - Run: npm run typecheck

Step 8 — Clean packages/shared:
  - Remove dead IPC channel definitions from packages/shared/src/ipc.ts
  - Remove dead type exports
  - Rebuild shared: npm run build --workspace=packages/shared
  - Run: npm run typecheck (all workspaces)

Step 9 — Remove unused npm dependencies:
  - For each workspace, remove packages listed in unused_dependencies
  - Run: npm install && npm run typecheck

Step 10 — Final validation:
  - npm run typecheck (all workspaces)
  - npm run lint (all workspaces)
  - npm run test (all workspaces, expect existing tests to pass)
  - npm run build (verify production build works)

CRITICAL RULES:
  - NEVER remove anything from the 11 core pillars listed above
  - If a typecheck fails, diagnose and fix before proceeding to next step
  - If a dead file is imported by a live file, do NOT just delete it — fix the live file first
  - Keep git commits granular: one commit per step so we can bisect if needed
  - Commit message format: "chore(v1-prune): step N — remove dead [category]"
```

---

## Phase 3: Architecture Review & v1 Design

**claude-flow Agent: `system-architect`**

```
TASK: Design the v1 architecture for Mitable after dead code pruning.

CURRENT STATE (post-prune):
- ~80+ backend services in a flat src/services/ directory
- ~15 route files in flat src/routes/
- ~25 schema files in flat src/db/schema/
- 11 core feature pillars (capture, activity, sessions, AI processing, insights,
  benchmarks, updates, agent, integrations, auth/billing, desktop shell)
- RLM (Reinforcement Learning Module) agent pattern used for AI processing steps

QUESTIONS TO ANSWER:

1. BACKEND DOMAIN STRUCTURE
   Should src/services/ be reorganized into domain modules? Proposed:

   src/domains/
   ├── capture/        # Frame ingestion, screenshot storage, delta detection
   ├── processing/     # Session classification, summarization, indexing, RLM agents
   ├── insights/       # Activity queries, daily activities, org-level analytics
   ├── benchmarks/     # Benchmark computation, AI benchmarks
   ├── updates/        # BragBook, recaps, master story
   ├── agent/          # Agent service, ask threads, memory, intent
   ├── integrations/   # Slack, Notion, GitHub, Granola, Fireflies, Gmail, Linear
   │   ├── slack/
   │   ├── notion/
   │   ├── github/
   │   ├── granola/
   │   ├── fireflies/
   │   └── graph/      # Knowledge graph
   └── auth/           # Auth, billing, orgs, users, permissions, API keys

2. SERVICE CONSOLIDATION
   Are there services that should be merged?
   - 9 session-* services (chunking, classification, summarization, indexing,
     ingestion, retriever, delivery, title, session-refinement) — too granular?
   - 3 workstream-* services (detection, aggregation, rlm) — merge?
   - Multiple *-materializer services — combine with their parent domain?

3. RLM AGENT PATTERN
   The backend uses an RLM pattern (environment + prompts + tools) for:
   - classifier, block-analyzer, day-analyzer, storyteller, workstream,
     refinement, ask, agent-query
   Should this pattern be standardized? Simplified? Are all these agents needed?

4. DATABASE SCHEMA
   - Are remaining schemas well-normalized for v1?
   - What indexes are needed for time-range queries on sessions?
   - Should session_chunks be restructured for faster retrieval?

5. ELECTRON ↔ BACKEND BOUNDARY
   - What processing should stay in Electron vs. backend?
   - Currently: capture + activity tracking in Electron, everything else backend
   - Should any AI processing move to Electron for offline support?

6. SHARED PACKAGE
   - Should packages/shared be restructured by domain?
   - What types/schemas should be shared vs. workspace-private?

7. OBSERVABILITY
   - What logging/metrics should v1 have from day 1?
   - Current: Pino logger in backend, custom logger in Electron
   - Should we add structured event tracking?

OUTPUT: Architecture Decision Record at docs/adr/v1-architecture.md with:
  - Domain boundary definitions
  - Service responsibility map (which service does what)
  - Data flow diagrams (capture → processing → storage → insights)
  - Migration path from current flat structure
  - Recommendations for each question above
  - Risk assessment for the restructuring
```

---

## Phase 4: Backend Restructuring

**claude-flow Agent: `backend-api-architect`**

```
TASK: Restructure the Mitable backend based on the v1 architecture design from Phase 3.

TARGET STRUCTURE (adjust based on Phase 3 output):

apps/backend/src/
├── domains/
│   ├── capture/
│   │   ├── routes/
│   │   │   └── monitoring.routes.ts
│   │   ├── services/
│   │   │   ├── screenshot.service.ts
│   │   │   ├── frame-analysis.service.ts
│   │   │   ├── gemini-vision-frame.service.ts
│   │   │   ├── delta-detection.service.ts
│   │   │   └── stale-session-cleanup.service.ts
│   │   └── types/
│   ├── processing/
│   │   ├── services/
│   │   │   ├── session-classification.service.ts
│   │   │   ├── session-summarization.service.ts
│   │   │   ├── session-indexing.service.ts
│   │   │   ├── session-ingestion.service.ts
│   │   │   ├── session-chunking.service.ts
│   │   │   ├── session-title.service.ts
│   │   │   ├── session-retriever.service.ts
│   │   │   ├── session-delivery.service.ts
│   │   │   ├── workstream-detection.service.ts
│   │   │   ├── workstream-aggregation.service.ts
│   │   │   ├── classifier.service.ts
│   │   │   ├── continuation-detector.service.ts
│   │   │   ├── orchestrator.service.ts
│   │   │   └── intermediate-summary.service.ts
│   │   └── agents/
│   │       ├── classifier-rlm/
│   │       ├── block-analyzer/
│   │       ├── day-analyzer/
│   │       ├── storyteller/
│   │       ├── workstream/
│   │       └── refinement/
│   ├── insights/
│   │   ├── routes/
│   │   │   ├── my-activity.routes.ts
│   │   │   └── admin-dashboard.routes.ts
│   │   └── services/
│   │       ├── user-activity-queries.ts
│   │       ├── org-team-activity-query.service.ts
│   │       └── activity-materializer.service.ts
│   ├── benchmarks/
│   │   ├── routes/
│   │   │   ├── my-benchmarks.routes.ts
│   │   │   └── admin-benchmarks.routes.ts
│   │   └── services/
│   │       ├── benchmark.service.ts
│   │       ├── benchmark-compute.service.ts
│   │       └── benchmark-ai.service.ts
│   ├── updates/
│   │   ├── routes/
│   │   │   └── my-bragbook.routes.ts
│   │   └── services/
│   │       ├── bragbook-generator.service.ts
│   │       ├── recap-rlm.service.ts
│   │       └── master-story.service.ts
│   ├── agent/
│   │   ├── routes/
│   │   │   └── agent.routes.ts
│   │   ├── services/
│   │   │   ├── agent.service.ts
│   │   │   ├── memory.service.ts
│   │   │   ├── trust-ranking.service.ts
│   │   │   └── search-logger.service.ts
│   │   └── agents/
│   │       ├── ask/
│   │       └── agent-query/
│   ├── integrations/
│   │   ├── routes/
│   │   │   └── integrations.routes.ts
│   │   ├── slack/
│   │   ├── notion/
│   │   ├── github/
│   │   ├── granola/
│   │   ├── fireflies/
│   │   ├── gmail/
│   │   ├── linear/
│   │   └── graph/
│   └── auth/
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── billing.routes.ts
│       │   ├── stripe.routes.ts
│       │   ├── admin.routes.ts
│       │   └── api-keys.routes.ts
│       ├── services/
│       │   ├── stripe.service.ts
│       │   ├── subscription.service.ts
│       │   ├── usage.service.ts
│       │   ├── permissions.service.ts
│       │   └── api-key.service.ts
│       └── middleware/
│           └── auth.middleware.ts
├── shared/
│   ├── services/
│   │   ├── cache.service.ts
│   │   ├── llm.service.ts
│   │   ├── embedding.service.ts
│   │   ├── vector.service.ts
│   │   ├── encryption.service.ts
│   │   ├── socket.service.ts
│   │   └── pii-redaction.service.ts
│   └── lib/
│       ├── logger.ts
│       ├── database.ts
│       └── config.ts
├── db/
│   ├── schema/     (cleaned, organized by domain with barrel exports)
│   └── migrations/
├── cron/
│   └── jobs/
└── app.ts          (Express app setup, domain route registration)

EXECUTION STEPS:

1. Create the domain directory structure (mkdir -p for each domain)
2. Move services to their domain directories (git mv to preserve history)
3. Move routes to their domain directories
4. Update the Express app entry point to register routes from domain directories
5. Update ALL import paths across the entire backend
6. Move RLM agent directories into their parent domain's agents/ folder
7. Create barrel exports (index.ts) for each domain
8. Update any cron jobs that reference moved services
9. Verify: npm run typecheck --workspace=apps/backend
10. Verify: npm run test --workspace=apps/backend
11. Verify: npm run build --workspace=apps/backend

RULES:
  - Use git mv (not mv) to preserve file history
  - Update imports in consuming files, not just moved files
  - Do NOT change any business logic — this is purely structural
  - If a service is imported by Electron's renderer (via API calls), the API URLs don't change
  - Keep commit granularity: one commit per domain move
  - Commit format: "refactor(v1): move [domain] services to domains/[name]/"
```

---

## Phase 5: Frontend Cleanup & Restructuring

**claude-flow Agent: `frontend-architect`**

```
TASK: Clean up and restructure the Mitable Electron renderer for v1.

CURRENT STATE:
- apps/electron/src/renderer/components/ has base UI kit, application components,
  domain components, icons, editor, common, foundations, and UI directories
- apps/electron/src/renderer/console/src/ has the main Console app with pages,
  components, context, data, hooks, lib, services, types
- Separate window renderers: watchButton/, watchingPill/, watchingPillDropdown/, notifications/
- Console has employee mode (Home, activity insights, updates) and admin mode
  (Dashboard, Integrations, Setup)

ACTIONS:

1. COMPONENT AUDIT
   For every component in apps/electron/src/renderer/components/:
   - Trace imports to find which console pages or window renderers use it
   - Flag unused components for removal
   - Specifically check: calendar/, date-picker/, editor/, domain/workflow/,
     domain/messages/ — are these imported anywhere in v1 pages?

2. REMOVE DEAD COMPONENTS
   - Delete all components confirmed unused in Step 1
   - Remove their imports
   - Run typecheck

3. CONSOLE PAGE AUDIT
   - List all pages in console/src/pages/
   - Map which pages are used in employee mode vs admin mode
   - Verify OnboardingPage.tsx was removed in Phase 2
   - Check for any pages referencing removed backend routes

4. RESTRUCTURE CONSOLE COMPONENTS
   Organize console/src/components/ by v1 feature:

   console/src/components/
   ├── sessions/        # Session cards, session detail, session timeline
   ├── activity/        # Activity charts, time breakdowns, app usage
   ├── benchmarks/      # Benchmark cards, team benchmarks, charts
   ├── updates/         # BragBook editor, recap viewer, update drafts
   ├── agent/           # Agent chat interface, message bubbles, input
   ├── integrations/    # Integration cards, connection status, sync UI
   ├── dashboard/       # Admin dashboard widgets, team overview
   ├── settings/        # Preferences, profile, org settings
   └── shared/          # Layout, navigation, common widgets

5. RESTRUCTURE CONSOLE SERVICES
   Organize console/src/services/ by v1 domain to match backend:

   console/src/services/
   ├── capture.api.ts       # Session/monitoring API calls
   ├── insights.api.ts      # Activity/time insights API calls
   ├── benchmarks.api.ts    # Benchmark API calls
   ├── updates.api.ts       # BragBook/recap API calls
   ├── agent.api.ts         # Agent chat API calls
   ├── integrations.api.ts  # Integration management API calls
   └── auth.api.ts          # Auth/billing API calls

6. CLEAN SHARED RENDERER CODE
   - Audit apps/electron/src/renderer/hooks/ — remove unused hooks
   - Audit apps/electron/src/renderer/lib/ — remove unused utils
   - Audit apps/electron/src/renderer/styles/ — remove unused styles

7. VERIFY ALL WINDOWS
   - Console window loads and renders (employee + admin modes)
   - WatchButton window loads
   - WatchingPill window loads
   - WatchingPillDropdown window loads
   - Notification window loads
   - Run: npm run typecheck --workspace=apps/electron
   - Run: npm run dev --workspace=apps/electron (smoke test)

RULES:
  - Do NOT rewrite any component logic — only move, organize, and remove dead code
  - Preserve all existing styling and behavior
  - Use git mv to preserve history
  - One commit per step
  - Commit format: "refactor(v1-ui): step N — [description]"
```

---

## Phase 6: Database Schema Cleanup

**claude-flow Agent: `database-architect`**

```
TASK: Clean up and optimize the Mitable PostgreSQL schema for v1.

CURRENT STATE (post Phase 2 pruning):
- Supabase PostgreSQL with Drizzle ORM
- Schema files in apps/backend/src/db/schema/
- Remaining schemas serve: monitoring/sessions, daily-activities, analytics,
  benchmarks, bragbook, recaps, agent-chats, ask-threads, conversations,
  user-memories, integrations, search-content, github/*, graph-sync,
  session-chunks, users, organizations, teams, user-permissions, api-keys, billing

ACTIONS:

1. COLUMN AUDIT
   For each remaining schema file:
   - Identify columns that reference removed features (e.g., roadmap IDs,
     artifact references, document IDs, workflow references)
   - List columns that are nullable and never populated (check with sample queries)
   - Flag columns for removal or deprecation

2. INDEX AUDIT
   Check that these critical query patterns have proper indexes:
   - Sessions by userId + date range (the most common query)
   - Sessions by orgId + date range (admin dashboard)
   - Daily activities by userId + date
   - Benchmarks by userId + period
   - Agent chats by userId + threadId
   - Search content by orgId + source type
   - Session chunks by sessionId

3. SCHEMA NORMALIZATION
   - Are there any denormalized fields that cause update anomalies?
   - Should session_chunks be restructured for the v1 retrieval pipeline?
   - Is the relationship between sessions, chunks, and workstreams optimal?

4. MIGRATION GENERATION
   For any changes:
   - Generate Drizzle migration scripts
   - Ensure migrations are backwards-compatible (add columns nullable,
     drop columns in separate migration)
   - Test migrations against a fresh database

5. DRIZZLE TYPE VERIFICATION
   - After schema changes, verify all Drizzle inferred types are correct
   - Run: npm run db:generate --workspace=apps/backend
   - Run: npm run typecheck --workspace=apps/backend

OUTPUT:
  - Updated schema files
  - Migration scripts in apps/backend/src/db/migrations/
  - Index recommendations document
  - Any schema redesign proposals for Phase 3 architect review
```

---

## Phase 7: Test Coverage

**claude-flow Agent: `test-engineer`**

```
TASK: Create comprehensive test coverage for Mitable v1 core systems after the overhaul.

PRIORITY ORDER (highest impact first):

1. SESSION LIFECYCLE (apps/backend)
   Test the full pipeline: frame upload → session creation → classification →
   summarization → indexing → retrieval
   - Unit tests for each processing service
   - Integration test for the full pipeline
   - Edge cases: empty sessions, very long sessions, sessions with no screenshots

2. PASSIVE MONITORING STATE MACHINE (apps/electron)
   Test state transitions: disabled → detecting → active_session → ending → detecting
   - All valid transitions
   - Invalid transition attempts
   - Activity threshold detection
   - Deferred state handling

3. ACTIVITY TRACKER (apps/electron)
   - Keyboard event aggregation
   - Mouse event tracking
   - Clipboard event handling
   - Start/stop lifecycle

4. BENCHMARK COMPUTATION (apps/backend)
   - Individual benchmark calculation
   - Team benchmark aggregation
   - AI benchmark generation
   - Edge cases: no data, partial data, single session

5. BRAGBOOK GENERATION (apps/backend)
   - Update draft generation from session data
   - Recap creation
   - Master story compilation

6. AUTH FLOW (apps/backend)
   - Signup with organization creation
   - Login with existing user
   - Login with orphan repair
   - JWT validation
   - Permission checks

7. STRIPE BILLING (apps/backend)
   - Webhook event handling (subscription created, updated, cancelled)
   - Usage tracking
   - Plan enforcement

8. INTEGRATION SYNC (apps/backend)
   - Slack sync: messages → chunks → search content
   - Notion sync: pages → chunks → search content
   - GitHub sync: commits/PRs → chunks → search content
   - Error handling for API failures

9. AGENT SERVICE (apps/backend)
   - Query handling
   - Context retrieval from sessions
   - Memory service integration
   - Thread management

10. API ROUTES (apps/backend)
    - All remaining routes: monitoring, my-activity, my-benchmarks, my-bragbook,
      admin-dashboard, admin-benchmarks, agent, integrations, auth, billing, stripe, admin
    - Auth middleware (requireAuth, optionalAuth)
    - Error responses (400, 401, 403, 404, 500)

TARGET COVERAGE:
  - Backend services: 80%+
  - Backend routes: 75%+
  - Electron services: 70%+
  - Shared package: 90%+

RULES:
  - Extend existing tests, don't rewrite them
  - Use existing test patterns/helpers found in the codebase
  - Mock external APIs (Gemini, OpenAI, Pinecone, Stripe, Slack, etc.)
  - Use real database for integration tests where possible
  - Follow existing test file naming: *.test.ts alongside the source file
  - Run: npm run test to verify all tests pass
```

---

## Phase 8: Documentation Update

**claude-flow Agent: `technical-documentation-specialist`**

```
TASK: Update all Mitable documentation to reflect the v1 product and architecture.

DOCUMENTS TO UPDATE:

1. docs/mitable_complete_prd.md — FULL REWRITE
   - Remove ALL onboarding/roadmap/nudge/expert-matching/overlay-guidance references
   - Rewrite Executive Summary for work context capture + time insights + update drafting
   - Update product vision, personas, feature specs for v1 pillars:
     * Work Context Capture
     * Activity Tracking
     * Session Management
     * AI Processing Pipeline
     * Time Insights
     * Benchmarks
     * Update Drafting (BragBook)
     * Agent Tab
     * Integrations
     * Auth & Billing
     * Desktop Shell & Chrome Extension
   - Update business model, success metrics, competitive landscape
   - Remove old UI/UX specs for removed features
   - Add v1 data flow diagrams

2. CLAUDE.md — UPDATE (do not rewrite)
   - Update "Project Overview" to match v1 description
   - Update "Architecture" section if backend restructured (domain directories)
   - Update "Directory Structure" to reflect pruned codebase
   - Remove references to removed features in "Core Features"
   - Update "Common Issues" if any are resolved
   - Add any new development patterns from the overhaul

3. docs/Electron_Express_monorepo_UPDATED.md — UPDATE
   - Reflect the v1 architecture
   - Update service maps
   - Remove references to removed features

4. NEW: docs/CHANGELOG.md
   - Document the v0→v1 overhaul
   - List all removed features with brief explanation
   - List architectural changes
   - List new test coverage
   - Date: 2026-04-08

5. NEW: docs/adr/v1-overhaul.md (if not created in Phase 3)
   - Architecture Decision Record for the overhaul
   - Context, decision, consequences, status

RULES:
  - Reference actual file paths that exist post-overhaul
  - Do NOT reference any removed files or features
  - Keep technical accuracy — verify claims against actual code
  - Keep docs concise — remove verbose onboarding-era content
```

---

## Execution with claude-flow

### Dependency Graph

```
Phase 1 ──→ Phase 2 ──→ Phase 4 (backend) ──→ Phase 7 (tests) ──→ Phase 8 (docs)
                    ├──→ Phase 5 (frontend) ──↗
                    ├──→ Phase 6 (database) ──↗
                    └──→ Phase 3 (architecture) ──→ Phase 4
```

### Swarm Configuration

```bash
# Initialize hierarchical swarm with 8 phases
claude-flow swarm init \
  --topology hierarchical \
  --name "mitable-v1-overhaul" \
  --phases 8

# Phase 1: Dead code audit (must complete first)
claude-flow agent spawn \
  --type code-analyzer \
  --name "dead-code-auditor" \
  --task "Phase 1 from docs/v1-overhaul-prompt.md" \
  --priority critical

# Phase 2: Dead code removal (depends on Phase 1)
claude-flow agent spawn \
  --type coder \
  --name "dead-code-remover" \
  --depends-on dead-code-auditor \
  --task "Phase 2 from docs/v1-overhaul-prompt.md" \
  --priority critical

# Phase 3: Architecture design (parallel with Phase 2)
claude-flow agent spawn \
  --type system-architect \
  --name "v1-architect" \
  --task "Phase 3 from docs/v1-overhaul-prompt.md" \
  --priority high

# Phases 4, 5, 6: Restructuring (parallel, depend on Phases 2+3)
claude-flow agent spawn \
  --type backend-api-architect \
  --name "backend-restructure" \
  --depends-on dead-code-remover,v1-architect \
  --task "Phase 4 from docs/v1-overhaul-prompt.md" \
  --priority high

claude-flow agent spawn \
  --type frontend-architect \
  --name "frontend-restructure" \
  --depends-on dead-code-remover \
  --task "Phase 5 from docs/v1-overhaul-prompt.md" \
  --priority high

claude-flow agent spawn \
  --type database-architect \
  --name "schema-cleanup" \
  --depends-on dead-code-remover \
  --task "Phase 6 from docs/v1-overhaul-prompt.md" \
  --priority medium

# Phase 7: Tests (depends on 4+5+6)
claude-flow agent spawn \
  --type test-engineer \
  --name "test-coverage" \
  --depends-on backend-restructure,frontend-restructure,schema-cleanup \
  --task "Phase 7 from docs/v1-overhaul-prompt.md" \
  --priority high

# Phase 8: Docs (depends on all)
claude-flow agent spawn \
  --type technical-documentation-specialist \
  --name "docs-updater" \
  --depends-on test-coverage \
  --task "Phase 8 from docs/v1-overhaul-prompt.md" \
  --priority medium

# Supporting: Code review after each phase
claude-flow agent spawn \
  --type reviewer \
  --name "quality-gate" \
  --mode continuous \
  --task "Review each phase's changes for correctness, no regressions, clean imports"

# Supporting: Production validation at the end
claude-flow agent spawn \
  --type production-validator \
  --name "final-validator" \
  --depends-on docs-updater \
  --task "Verify mitable builds, typechecks, tests pass, and runs in dev mode"
```

### Agent Summary Table

| Phase | Agent Type                           | Name                 | Depends On     | Priority |
| ----- | ------------------------------------ | -------------------- | -------------- | -------- |
| 1     | `code-analyzer`                      | dead-code-auditor    | —              | Critical |
| 2     | `coder`                              | dead-code-remover    | Phase 1        | Critical |
| 3     | `system-architect`                   | v1-architect         | —              | High     |
| 4     | `backend-api-architect`              | backend-restructure  | Phases 2, 3    | High     |
| 5     | `frontend-architect`                 | frontend-restructure | Phase 2        | High     |
| 6     | `database-architect`                 | schema-cleanup       | Phase 2        | Medium   |
| 7     | `test-engineer`                      | test-coverage        | Phases 4, 5, 6 | High     |
| 8     | `technical-documentation-specialist` | docs-updater         | Phase 7        | Medium   |
| —     | `reviewer`                           | quality-gate         | Continuous     | High     |
| —     | `production-validator`               | final-validator      | Phase 8        | Critical |

### Estimated Effort

- **Phase 1**: ~30 min (automated analysis)
- **Phase 2**: ~2-3 hours (careful removal + typecheck loops)
- **Phase 3**: ~1 hour (design document)
- **Phase 4**: ~3-4 hours (largest structural change)
- **Phase 5**: ~2-3 hours (component audit + reorganization)
- **Phase 6**: ~1-2 hours (schema + migration)
- **Phase 7**: ~4-6 hours (comprehensive test writing)
- **Phase 8**: ~2-3 hours (documentation rewrite)
- **Total**: ~16-22 hours of agent compute time
- **With parallelism (Phases 4/5/6)**: ~12-16 hours wall clock
