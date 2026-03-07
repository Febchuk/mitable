# Graph Workflow Intelligence Spec

**Status:** Proposed (implementation-ready)
**Owner:** Backend + Data Platform
**Last Updated:** March 5, 2026

## 1. Purpose

Build a graph intelligence layer that learns user workflows from observed activity logs and uses that knowledge to:

1. Improve summary and recap personalization.
2. Provide relevant context blocks to agents.
3. Give management visibility into how employees actually work.

This system focuses on inferred work behavior (apps used, activities in those apps, and mapped higher-order tasks), not only static profile fields.

## 2. Scope

### In Scope (v1)

1. Neo4j graph store for derived workflow intelligence.
2. Nightly batch sync from Postgres source tables.
3. Deterministic context retrieval (Top-K facts) for summary/recap and agent prompts.
4. Management visibility APIs for employee and org workflow insights.
5. Pseudonymized graph identities and privacy controls.

### Out of Scope (v1)

1. Real-time graph updates.
2. Autonomous graph query tool-calling inside agent loops.
3. External BI integration (Looker/PowerBI).

## 3. Source-of-Truth and System Boundaries

1. **Postgres remains canonical** for raw events and application data.
2. **Neo4j stores derived relationships** and confidence-weighted behavior models.
3. Graph data can be rebuilt from Postgres using watermarked replays.

## 4. Data Sources

Primary tables used for graph inference:

1. `monitoring_sessions`
2. `session_captures`
3. `session_workstreams`
4. `workflow_sessions`
5. `workflow_interactions`
6. `user_memories` (`summary_style`, `recap_style`)
7. `users` (`jobTitle`, `regularTasks`, `regularApps`, `additionalContext`)

## 5. Canonical Event Envelope

All extracted records are normalized into a common event shape before graph inference.

```ts
export interface ActivityEvent {
  eventId: string;
  occurredAt: string; // ISO timestamp
  userId: string;
  orgId: string;
  sessionId?: string;
  appName?: string;
  windowTitle?: string;
  activityDescription?: string;
  actionType?: "VIEWING" | "NAVIGATION" | "PASTING" | "AUTHORING" | "EDITING";
  sourceType:
    | "session_capture"
    | "workstream"
    | "workflow_interaction"
    | "persona_seed"
    | "memory_preference";
  confidence: number; // 0.0 - 1.0
  metadata: Record<string, unknown>;
}
```

## 6. Activity Log Resolution Pipeline

### Stage A: Normalize and Denoise

1. Parse source rows into `ActivityEvent`.
2. Standardize app names and action labels.
3. Collapse repetitive low-value events in short windows (e.g., repeated same app/window/activity within 90s).
4. Assign confidence using source reliability + classifier confidence.

### Stage B: App Behavior Modeling

1. Build user-app behavior clusters from activity descriptions per app.
2. Derive statements like: “User primarily uses Excel for reconciliation and reporting.”
3. Emit weighted user-app edges and app-behavior edges.

### Stage C: Task Archetype Mapping

1. Map low-level activities to canonical `TaskArchetype` labels.
2. Use hybrid mapping:
   - deterministic rules for known patterns
   - LLM-backed normalization for ambiguous text
3. Preserve evidence count and confidence per mapping.

### Stage D: Workflow Sequence Mining

1. Segment timelines into episodes using time gaps, app transitions, and continuity hints.
2. Convert episodes into ordered task chains.
3. Detect recurring chains and materialize `WorkflowPattern` nodes.

### Stage E: Aggregation for Visibility

1. Compute employee-level “top apps, top tasks, recurring workflows.”
2. Compute org-level “common tasks, role clusters, workflow distribution.”
3. Persist summary snapshots for fast dashboard queries.

## 7. Graph Model (Neo4j)

### Node Labels

1. `Person`
2. `Organization`
3. `App`
4. `AppBehavior`
5. `TaskArchetype`
6. `WorkflowPattern`
7. `Preference`
8. `Domain`

### Required Node Properties

1. `Person`: `personKey`, `orgId`, `jobTitleHint`, `active`
2. `TaskArchetype`: `taskKey`, `displayName`, `domainKey`
3. `WorkflowPattern`: `patternKey`, `displayName`, `version`, `supportCount`
4. `App`: `appKey`, `displayName`
5. `Preference`: `preferenceKey`, `category`, `value`

### Edge Types

1. `(Person)-[:MEMBER_OF]->(Organization)`
2. `(Person)-[:USES_APP {weight,lastSeenAt,evidenceCount}]->(App)`
3. `(Person)-[:DOES_IN_APP {weight,lastSeenAt,evidenceCount}]->(AppBehavior)`
4. `(Person)-[:PERFORMS {weight,lastSeenAt,evidenceCount}]->(TaskArchetype)`
5. `(Person)-[:FOLLOWS_PATTERN {confidence,lastSeenAt,supportCount}]->(WorkflowPattern)`
6. `(WorkflowPattern)-[:INCLUDES_TASK {orderIndex}]->(TaskArchetype)`
7. `(TaskArchetype)-[:BELONGS_TO]->(Domain)`
8. `(Person)-[:PREFERS {strength,source,lastSeenAt}]->(Preference)`
9. `(Organization)-[:COMMON_TASK {weight,evidenceCount,lastSeenAt}]->(TaskArchetype)`

## 8. Confidence, Weighting, and Decay

Edge score update formula:

```txt
new_weight = clamp(
  old_weight * decay_factor(days_since_last_seen) + source_reliability * event_confidence,
  0,
  1
)
```

Defaults:

1. Half-life for behavior decay: 30 days.
2. Minimum evidence to promote task to stable user behavior: 5 events.
3. Minimum distinct users to promote org common task: 3 users.
4. `source_reliability` weights:
   - workflow_interaction: 1.0
   - session_workstream: 0.85
   - session_capture classifier output: 0.7
   - persona_seed: 0.5

## 9. Data Contracts for Retrieval

```ts
export interface GraphFact {
  factType: "top_task" | "top_app" | "workflow_pattern" | "style_preference" | "domain_hint";
  subject: string;
  relation: string;
  object: string;
  score: number;
  evidenceCount: number;
  lastSeenAt?: string;
}

export interface UserGraphProfile {
  personKey: string;
  orgId: string;
  topTasks: GraphFact[];
  topApps: GraphFact[];
  patterns: GraphFact[];
  preferences: GraphFact[];
  domains: GraphFact[];
}

export interface GraphContextBlock {
  summaryFacts: string[];
  personalizationHints: string[];
  confidenceNotes: string[];
}
```

## 10. Backend Components to Add

### Services

1. `apps/backend/src/services/graph/graph-client.service.ts`
2. `apps/backend/src/services/graph/graph-sync.service.ts`
3. `apps/backend/src/services/graph/graph-mapper.service.ts`
4. `apps/backend/src/services/graph/graph-retrieval.service.ts`
5. `apps/backend/src/services/graph/graph-context-builder.service.ts`

### Cron Job

1. `apps/backend/src/cron/jobs/graph-sync.job.ts`
2. Register in `apps/backend/src/cron/index.ts` after rollup jobs.

### Postgres Control Tables

1. `graph_sync_runs`
2. `graph_sync_watermarks`
3. `workflow_visibility_snapshots`

## 11. Integration Points in Existing Backend

### Summary + Recap Personalization (Launch Priority)

1. `session-summarization.service.ts`
   - Fetch `UserGraphProfile`.
   - Build `<graph_context>` and inject into refinement prompt.
2. `recap-rlm.service.ts`
   - Inject top recurring tasks, app usage themes, and learned style preferences.

### Agent Context Injection

1. `orchestrator.service.ts`
   - Prefetch graph context before routing.
   - Attach `graphContext` to `ToolContext`.
2. Agents consume prefetched facts only; no direct Neo4j query in v1 agent loop.

## 12. Management Visibility Spec

### Visibility Dimensions

1. **Employee-level**
   - top apps by time share
   - top tasks by weighted evidence
   - recurring workflows
   - trend delta week-over-week
2. **Org-level**
   - common tasks across employees
   - workflow mix by role cluster
   - app concentration and context-switch intensity

### Proposed Read APIs (Admin Only)

1. `GET /admin/graph/users/:userId/work-insights?window=7d|30d|90d`
2. `GET /admin/graph/orgs/:orgId/workflow-insights?window=7d|30d|90d`
3. `GET /admin/graph/orgs/:orgId/common-tasks?limit=20`
4. `GET /admin/graph/users/:userId/workflow-patterns?limit=20`

### Response Skeleton

```json
{
  "window": "30d",
  "generatedAt": "2026-03-05T08:00:00Z",
  "employee": {
    "topApps": [],
    "topTasks": [],
    "workflowPatterns": [],
    "trend": {}
  },
  "org": {
    "commonTasks": [],
    "roleClusters": [],
    "workflowDistribution": []
  }
}
```

## 13. Privacy, Compliance, and Access Control

1. Use pseudonymized `personKey` in Neo4j.
2. Keep identity mapping in backend only.
3. Never store raw transcript text or raw chat payloads in graph nodes.
4. Gate management endpoints behind admin role and org boundary checks.
5. Add audit logs for graph insight endpoint access.
6. Support redaction/deletion replay for data subject requests.

## 14. Observability and SLOs

Metrics:

1. Sync success rate
2. Sync duration by stage
3. Rows scanned and graph mutations applied
4. Retrieval latency (`P50`, `P95`)
5. Context relevance score (offline eval)

Targets:

1. Nightly sync success `>= 95%`
2. Graph retrieval `P95 < 120ms`
3. Snapshot API `P95 < 250ms`

## 15. Rollout Plan

### Phase 0: Foundation — COMPLETE

1. ~~Add Neo4j client, health checks, and config.~~
2. ~~Create sync control tables.~~
3. ~~Implement dry-run sync (extract/normalize only).~~

### Phase 1: Core Inference — COMPLETE

1. ~~Enable writes for Person-App-Task edges.~~
2. ~~Validate idempotency and watermark resume.~~
3. ~~Backfill last 90 days.~~
4. ~~Activity resolution pipeline (Stages A-D): extract, normalize, deduplicate, derive app behaviors, map to archetypes, mine patterns.~~
5. ~~Decay-weighted edge scoring (30-day half-life).~~

### Phase 2: Personalization Launch

1. Integrate graph context into recap and summary prompts.
2. Run A/B test versus current baseline.

### Phase 3: Management Visibility — COMPLETE

1. ~~Add admin insight endpoints (work-insights, workflow-patterns, workflow-insights, common-tasks).~~
2. ~~Add snapshot generation and caching.~~
3. ~~Workflow distribution, confidence metadata, and period-over-period trend in org insights.~~
4. ~~AppBehavior nodes and DOES_IN_APP edges for per-app usage summaries.~~

### Phase 4: Pattern Intelligence — COMPLETE

1. ~~Enable workflow pattern mining and sequence edges.~~
2. ~~Add org-level workflow benchmarks.~~
3. ~~WorkflowPattern nodes with INCLUDES_TASK edges, ordered task chains, support counts.~~

## 16. Test Plan

### Unit Tests

1. Event normalization and deduping rules.
2. Task archetype mapping correctness.
3. Decay and weight update math.
4. Context block builder token clipping.

### Integration Tests

1. End-to-end sync from fixture Postgres rows to Neo4j graph.
2. Idempotent re-run produces no duplicate relationships.
3. Watermark resume after mid-run failure.
4. Admin endpoint org isolation and auth checks.

### Product Validation Scenarios

1. Accountant-like user repeatedly performs expense-related workflows and system promotes `expense_report_processing` to top tasks.
2. Recap style changes from user revisions are reflected in later generated recaps.
3. Management sees meaningful top tasks and workflow patterns aligned with observed behavior.

## 17. Risks and Mitigations

1. **Misclassification risk**
   - Mitigation: confidence thresholds, human-readable evidence counts, conservative promotion.
2. **Privacy risk**
   - Mitigation: pseudonymization, no raw text in graph, access auditing.
3. **Over-interpretation by management**
   - Mitigation: expose confidence bands and “inferred from activity signals” disclaimers.
4. **Cost/performance drift**
   - Mitigation: nightly batch only, snapshot caching, bounded Top-K retrieval.

## 18. Implementation Defaults (Locked)

1. Graph backend: Neo4j.
2. Identity handling: pseudonymized by default.
3. Initial launch focus: summary/recap personalization first.
4. Update cadence: nightly batch only.
5. Agent integration: prefetched deterministic Top-K graph facts.

## 19. Implementation Instructions (Neo4j + Backend)

Use this checklist to run graph workflow intelligence end-to-end in this repo.

1. Start Neo4j (local dev):

```bash
docker run \
  --name mitable-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/mitable-dev-password \
  -v neo4j_data:/data \
  neo4j:5
```

2. Set backend env vars:

```bash
GRAPH_ENABLED=true
GRAPH_URI=http://localhost:7474
GRAPH_USER=neo4j
GRAPH_PASSWORD=mitable-dev-password
GRAPH_DATABASE=neo4j
GRAPH_TOP_K_FACTS=5
GRAPH_LOOKBACK_DAYS=30
```

3. Run migration:

```bash
npm --workspace @mitable/backend run migrate:0042
```

4. Run manual graph sync:

```bash
npm --workspace @mitable/backend run graph:sync
```

5. Verify graph endpoints:

- `GET /api/admin/graph/users/:userId/work-insights`
- `GET /api/admin/graph/users/:userId/workflow-patterns`
- `GET /api/admin/graph/orgs/:orgId/common-tasks`
- `GET /api/admin/graph/orgs/:orgId/workflow-insights`
- `POST /api/admin/graph/sync`

6. Use live (non-snapshot) org workflow insights when needed:

- `GET /api/admin/graph/orgs/:orgId/workflow-insights?forceLive=true`

Detailed operational runbook:

- `docs/NEO4J_GRAPH_SETUP.md`
