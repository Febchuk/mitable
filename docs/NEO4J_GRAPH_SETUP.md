# Neo4j Setup For Graph Workflow Intelligence

This is the exact setup to make the graph features work in this branch.

## 1) Choose Deployment

Option A: Local Docker (recommended for dev)

```bash
docker run \
  --name mitable-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/mitable-dev-password \
  -v neo4j_data:/data \
  neo4j:5
```

Option B: Neo4j Aura (recommended for production)

1. Create AuraDB instance.
2. Copy connection details.
3. Use HTTPS endpoint as `GRAPH_URI`.

## 2) Set Backend Environment Variables

Add these to your backend `.env`:

```bash
GRAPH_ENABLED=true
GRAPH_URI=http://localhost:7474
GRAPH_USER=neo4j
GRAPH_PASSWORD=mitable-dev-password
GRAPH_DATABASE=neo4j
GRAPH_TOP_K_FACTS=5
GRAPH_LOOKBACK_DAYS=30
```

Notes:

1. Current implementation expects **HTTP(S)** Neo4j endpoint for transactional API.
2. Do not use `bolt://` or `neo4j://` in `GRAPH_URI` for this implementation.

## 3) Run Required Migration

```bash
npm --workspace @mitable/backend run migrate:0042
```

Creates:

1. `graph_sync_runs`
2. `graph_sync_watermarks`
3. `workflow_visibility_snapshots`

## 4) Run Manual Graph Sync

```bash
npm --workspace @mitable/backend run graph:sync
```

Expected outcome:

1. `graph_sync_runs` gets a successful run row with pipeline stats in metadata.
2. Watermarks updated for monitored sources.
3. Snapshot rows inserted for org workflow visibility.
4. Neo4j receives nodes and edges (see Graph Schema below).

## 5) Graph Schema

### Node Types

| Label             | Key Properties       | Description                                                                               |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `Organization`    | `orgId`              | Tenant org                                                                                |
| `Person`          | `personKey`, `orgId` | Pseudonymized user                                                                        |
| `App`             | `name`               | Normalized application (e.g., "VS Code", "Chrome")                                        |
| `AppBehavior`     | `key`                | Per-user app usage summary with `statement`, `topActivities`, `evidenceCount`             |
| `TaskArchetype`   | `name`               | Canonical task type (e.g., "code_authoring", "debugging") with `displayName`, `domainKey` |
| `Preference`      | `value`              | User style/recap preference                                                               |
| `WorkflowPattern` | `patternKey`         | Recurring task sequence with `taskChain`, `supportCount`, `avgDurationMinutes`            |

### Edge Types

| Edge              | From            | To              | Properties                | Description                         |
| ----------------- | --------------- | --------------- | ------------------------- | ----------------------------------- |
| `MEMBER_OF`       | Person          | Organization    | —                         | Org membership                      |
| `USES_APP`        | Person          | App             | `weight`, `evidenceCount` | User uses application               |
| `DOES_IN_APP`     | Person          | AppBehavior     | `weight`                  | User's behavior within an app       |
| `FOR_APP`         | AppBehavior     | App             | —                         | Links behavior to its application   |
| `PERFORMS`        | Person          | TaskArchetype   | `weight`, `evidenceCount` | User performs this task type        |
| `PREFERS`         | Person          | Preference      | `weight`                  | User style preference               |
| `FOLLOWS_PATTERN` | Person          | WorkflowPattern | —                         | User exhibits this workflow pattern |
| `INCLUDES_TASK`   | WorkflowPattern | TaskArchetype   | `orderIndex`              | Task in the pattern chain           |

### Activity Resolution Pipeline

The sync process runs a 4-stage pipeline:

- **Stage A** — Extract events from `session_captures`, `session_workstreams`, `workflow_interactions`. Normalize app names. Deduplicate within 90s windows.
- **Stage B** — Derive `AppBehavior` nodes: group by (user, app), extract top-5 activities, generate behavior statement.
- **Stage C** — Map to `TaskArchetype` via keyword matching against 13 archetype rules (code_authoring, debugging, testing, etc.).
- **Stage D** — Mine `WorkflowPattern`: segment events into episodes (30-min gap), extract task chains, count recurring sequences (support >= 2).

Edge weights use a 30-day half-life exponential decay formula: `clamp(oldWeight * decay + sourceReliability * confidence, 0, 1)`.

## 6) Validate Admin Endpoints

With admin auth token:

1. `GET /api/admin/graph/users/:userId/work-insights` — profile + appBehaviors
2. `GET /api/admin/graph/users/:userId/workflow-patterns` — recurring patterns (not just recent rows)
3. `GET /api/admin/graph/orgs/:orgId/common-tasks` — org-level task distribution
4. `GET /api/admin/graph/orgs/:orgId/workflow-insights` — overview + workflowDistribution + confidence + trend
5. `POST /api/admin/graph/sync` — manual sync trigger

For live bypass:

- `GET /api/admin/graph/orgs/:orgId/workflow-insights?forceLive=true`

## 7) Troubleshooting

1. If you get `Neo4j health check failed`, verify `GRAPH_URI`, credentials, and container status.
2. If routes return `GraphDisabled`, set `GRAPH_ENABLED=true` and restart backend.
3. If snapshots are empty, confirm there is recent data in `monitoring_sessions` and `session_workstreams`.
4. If auth fails on admin endpoints, ensure requester is an admin in same organization.
5. Check `graph_sync_runs.metadata` for pipeline timing stats (`stageTimingsMs`) and mutation counts.
