# Benchmarks Feature - Implementation Plan

## Context

Mitable is evolving into an employee performance tool. Benchmarks let management communicate goals/expectations to employees, while employees see how they're trending toward those goals. The philosophy is **positive framing**: highlight accomplishments, surface actionable growth suggestions, and make gaining recognition easier -- never punitive.

Examples: A "Mentorship" benchmark detects 15min mentee meetings and suggests 30min weekly sessions. A "Cross-functional Collaboration" benchmark measures topic/category/app diversity to detect siloed work and recommends more coordination.

## Decisions

- **Both quantitative + qualitative** benchmarks (AI-assessed)
- **Separate `/benchmarks` page** for employees (new nav item)
- **Person-by-person assignment** — admins assign benchmarks to specific people (not role-based initially)
- **Pre-built benchmarks only** — no custom benchmark builder initially; prove concept first
- **Frequency:** daily, weekly, monthly (no annual)
- **Two measurement types:**
  - **Percentage of time** — e.g., "30% of time on cross-functional collaboration"
  - **Instance-based** — e.g., "30 minutes of mentorship per week"
- **Task-level analysis** — use task/activity block data for accuracy (not raw capture blocks)
- **Score = percentage achieved vs expected target** (simple, transparent)
- **Target roles:** EPD (Engineering, Product, Design) and Customer Success initially
- Employees see percentile (Top 1%, Top 10%, etc.) but NOT other people's data — always shown regardless of org size
- **Computation scheduling:** period-aligned — daily benchmarks compute daily (03:00), weekly on Mondays (03:30), monthly on 1st (04:00) via `node-cron`
- **AI provider:** Claude Haiku 4.5 → GPT-5 → DeepSeek fallback chain (standard RLM pattern)
- **Seed strategy:** seed script (`npm run db:seed`) for now, no auto-insert on first admin visit

---

## Phase 1: Database Schema

**New file:** `apps/backend/src/db/schema/benchmarks.schema.ts`

### Table: `benchmarks` (pre-built benchmark definitions)

| Column              | Type                    | Notes                                                                       |
| ------------------- | ----------------------- | --------------------------------------------------------------------------- |
| id                  | uuid PK                 |                                                                             |
| organizationId      | uuid FK → organizations | CASCADE                                                                     |
| createdByUserId     | uuid FK → users         | SET NULL                                                                    |
| name                | varchar(255)            | e.g., "Deep Focus Work"                                                     |
| description         | text                    | What this measures                                                          |
| category            | varchar(50)             | productivity, collaboration, growth, quality                                |
| metricType          | varchar(20)             | "quantitative" or "qualitative"                                             |
| measurementType     | varchar(20)             | "percentage_of_time" or "instance_based"                                    |
| metricConfig        | jsonb                   | Source mapping + computation details                                        |
| targetValue         | real                    | Numeric target (e.g., 30 for 30%, or 30 for 30 min)                         |
| targetUnit          | varchar(50)             | "percent", "minutes_per_week", "minutes_per_day", "count_per_week", "score" |
| targetDirection     | varchar(10)             | "higher_is_better", "lower_is_better", "in_range"                           |
| period              | varchar(20)             | "daily", "weekly", "monthly"                                                |
| isActive            | boolean                 | default true                                                                |
| isBuiltIn           | boolean                 | default true (all benchmarks are pre-built for now)                         |
| displayOrder        | integer                 |                                                                             |
| createdAt/updatedAt | timestamp               |                                                                             |

### Table: `benchmark_assignments` (person-by-person assignment)

Admins assign specific benchmarks to specific people. A benchmark only applies to a user if there's an assignment row.

| Column              | Type                    | Notes                                                              |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| id                  | uuid PK                 |                                                                    |
| benchmarkId         | uuid FK → benchmarks    | CASCADE                                                            |
| userId              | uuid FK → users         | CASCADE                                                            |
| organizationId      | uuid FK → organizations | CASCADE                                                            |
| assignedByUserId    | uuid FK → users         | SET NULL                                                           |
| targetOverride      | real                    | Optional per-person target override (null = use benchmark default) |
| isActive            | boolean                 | default true                                                       |
| assignedAt          | timestamp               |                                                                    |
| createdAt/updatedAt | timestamp               |                                                                    |
| **UNIQUE**          | (benchmarkId, userId)   |                                                                    |

**Why person-by-person:** Different people have different roles and growth areas. An engineer might get "AI Adoption" + "Mentorship" while a PM gets "Cross-functional Collaboration" + "Clear Communication". This also allows per-person target overrides (a senior engineer might have a higher mentorship target than a mid-level).

**metricConfig examples:**

```jsonc
// Percentage of time: cross-functional collaboration
{
  "measurementType": "percentage_of_time",
  "source": "activityBlocks",
  "computation": "percentageOfTime",
  "filter": { "matchSubscribers": "cross_team" },
  "aggregation": "avg_per_day"
}

// Instance-based: mentorship minutes per week
{
  "measurementType": "instance_based",
  "source": "activityBlocks",
  "computation": "sumMinutes",
  "filter": { "blockType": "meeting", "matchPattern": "mentorship|1:1|coaching" },
  "aggregation": "sum_per_period"
}

// Qualitative: AI adoption
{
  "evaluationPrompt": "Evaluate AI tool adoption...",
  "dataSourceHints": ["activityBlocks.apps", "userDailyActivities.appBreakdown"],
  "scoringRubric": "1-5 scale",
  "aiToolPatterns": ["Copilot", "ChatGPT", "Claude", "Cursor", "Gemini"]
}
```

### Table: `benchmark_snapshots` (computed progress per user per period)

| Column          | Type                               | Notes                                                |
| --------------- | ---------------------------------- | ---------------------------------------------------- |
| id              | uuid PK                            |                                                      |
| benchmarkId     | uuid FK → benchmarks               | CASCADE                                              |
| userId          | uuid FK → users                    | CASCADE                                              |
| organizationId  | uuid FK → organizations            | CASCADE                                              |
| periodStart     | date                               |                                                      |
| periodEnd       | date                               |                                                      |
| currentValue    | real                               | Computed metric value                                |
| targetValue     | real                               | Snapshotted target                                   |
| progressPercent | real                               | 0-100+                                               |
| percentileRank  | real                               | 0-100, where user stands vs org (e.g., 92 = top 8%)  |
| percentileLabel | varchar(20)                        | "top_1", "top_10", "top_25", "top_50", "bottom_half" |
| trend           | varchar(20)                        | improving, declining, stable, new                    |
| trendDelta      | real                               | Change from previous period                          |
| rawData         | jsonb                              | Source data for audit                                |
| aiInsight       | text                               | AI-generated positive insight                        |
| aiSuggestions   | jsonb                              | `["Try blocking 2hr focus slots..."]`                |
| accomplishments | jsonb                              | `["4 deep focus sessions over 90min"]`               |
| status          | varchar(20)                        | pending, computed, failed                            |
| computedAt      | timestamp                          |                                                      |
| createdAt       | timestamp                          |                                                      |
| **UNIQUE**      | (benchmarkId, userId, periodStart) |                                                      |

**Percentile computation:** After all users' `currentValue` is computed for a period, rank them and assign `percentileRank` (0-100 scale where 100 = best). `percentileLabel` is derived: >=99 → "top_1", >=90 → "top_10", >=75 → "top_25", >=50 → "top_50", else "bottom_half".

**Privacy rule:** Employees ONLY see their own percentile label (e.g., "Top 10%"), NOT other people's names or rankings. Admins see the full per-person breakdown with names, values, and rankings.

**No separate templates table** — since we're starting with pre-built benchmarks only, the benchmark definitions themselves are seeded into the `benchmarks` table with `isBuiltIn = true`. Admins can adjust targets but not create new benchmark types initially.

**Export from:** `apps/backend/src/db/schema/index.ts` (add `export * from "./benchmarks.schema"`)

**Migration:** `npm run db:generate && npm run db:push --workspace=apps/backend`

---

## Phase 2: Backend API + Computation Service

### Routes

**New file:** `apps/backend/src/routes/benchmarks.ts`

Follow patterns from `apps/backend/src/routes/admin-dashboard.ts` (uses `requireAuth`, `db`, Drizzle queries).

**Admin endpoints (require admin role):**

- `GET /api/admin/benchmarks` — List all org benchmarks (pre-built) with org-wide stats
- `GET /api/admin/benchmarks/:id` — Detail + per-person breakdown (names, values, rankings)
- `PUT /api/admin/benchmarks/:id` — Update target value/period
- `POST /api/admin/benchmarks/:id/compute` — Manually trigger computation

**Admin assignment endpoints:**

- `GET /api/admin/benchmarks/:id/assignments` — List who is assigned to this benchmark
- `POST /api/admin/benchmarks/:id/assign` — Assign benchmark to specific users `{ userIds: [...], targetOverride?: number }`
- `DELETE /api/admin/benchmarks/:id/assign/:userId` — Unassign from a user
- `PUT /api/admin/benchmarks/:id/assign/:userId` — Update per-person target override
- `GET /api/admin/people/:id/benchmarks` — All benchmarks assigned to a specific person

**Employee endpoints (self-scoped, no other users' data exposed):**

- `GET /api/my-benchmarks` — All benchmarks assigned to me + latest snapshot (includes `percentileLabel` but NO other users' names/values)
- `GET /api/my-benchmarks/:id` — Detail with trend history + percentile rank
- `GET /api/my-benchmarks/:id/history` — Historical snapshots for charting (own data only)

**Mount in:** `apps/backend/src/routes.ts` (central route registration file)

### Computation Service

**New file:** `apps/backend/src/services/benchmark-computation.service.ts`

**Quantitative computation flow:**

1. Read `metricConfig` to determine source table + field + aggregation
2. Query `userDailyActivities` (or `activityBlocks`) for the benchmark period
3. Compute aggregate (avg, sum, count, etc.)
4. Compare to `targetValue` → `progressPercent`
5. Compare to previous snapshot → `trend` + `trendDelta`

**Supported quantitative mappings (all from existing data):**

| Benchmark               | Source                                   | Computation                                                                                              |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Deep Focus Work         | `userDailyActivities`                    | `totalWorkMinutes - totalMeetingMinutes` avg/day                                                         |
| Meeting Load            | `userDailyActivities`                    | `totalMeetingMinutes` avg/day                                                                            |
| Active Days             | `userDailyActivities`                    | COUNT rows WHERE totalActiveMinutes > 30                                                                 |
| Cross-functional Collab | `activityBlocks` + `userDailyActivities` | Diversity score: COUNT DISTINCT topics (weight 0.5) + categories (0.3) + apps (0.2), normalized to 0-100 |
| App Diversity           | `userDailyActivities`                    | JSON array length of `appBreakdown`                                                                      |

### AI Insight Service

**New file:** `apps/backend/src/services/benchmark-insight.service.ts`

**For ALL benchmarks** (after computing value), call Claude Haiku 4.5 (with GPT-5 → DeepSeek fallback) to generate:

- Accomplishment highlights (positive framing)
- Actionable suggestions
- For qualitative benchmarks: score (1-5) + textual assessment

Follow the AI integration pattern from `apps/backend/src/services/rlm/block-analyzer-rlm.service.ts`.

**Positive framing enforced at prompt level** — system prompt mandates growth-oriented language, never punitive.

### Computation Scheduling

**New file:** `apps/backend/src/cron/jobs/benchmark-compute.job.ts`

Period-aligned cron jobs using `node-cron` (already in codebase, initialized in `apps/backend/src/index.ts:83`):

```typescript
// Daily benchmarks — run at 03:00 every day
cron.schedule("0 3 * * *", () => runBenchmarkCompute("daily"));

// Weekly benchmarks — run at 03:30 every Monday
cron.schedule("30 3 * * 1", () => runBenchmarkCompute("weekly"));

// Monthly benchmarks — run at 04:00 on 1st of each month
cron.schedule("0 4 1 * *", () => runBenchmarkCompute("monthly"));
```

Guard with `isRunning` flag per period type (pattern from existing cron jobs). Register in `apps/backend/src/cron/index.ts`.

**Period boundaries:**

- Daily: yesterday (00:00–23:59)
- Weekly: previous Monday–Sunday
- Monthly: previous calendar month (1st to last day)

Admin manual trigger via `POST /api/admin/benchmarks/:id/compute` remains available.

---

## Phase 3: Admin Frontend — Benchmarks Management

### Navigation

**File:** `apps/electron/src/renderer/console/src/components/navigation/Nav.tsx`

- Add `<NavItem to="/benchmarks" icon={Target} label="Benchmarks" />` in the admin nav block (between Reports and People)

### Routes

**File:** `apps/electron/src/renderer/console/src/App.tsx`

- `/benchmarks` → `<BenchmarksView />`
- `/benchmarks/new` → `<BenchmarkForm />`
- `/benchmarks/:id` → `<BenchmarkDetail />`
- `/benchmarks/:id/edit` → `<BenchmarkForm />`

### Components

**New directory:** `apps/electron/src/renderer/console/src/components/views/admin/BenchmarksView/`

| File                         | Purpose                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `index.tsx`                  | List view — grid of pre-built benchmark cards, filter by category                                        |
| `BenchmarkCard.tsx`          | Summary card: name, category badge, assigned count, team avg progress bar, trend arrow                   |
| `BenchmarkDetail.tsx`        | Single benchmark — org-wide stats, per-person table (name, value, progress%, percentile, trend, insight) |
| `AssignBenchmarkModal.tsx`   | Modal to assign benchmark to people — multi-select user list with optional target override               |
| `BenchmarkSettingsPanel.tsx` | Edit target value/period for a benchmark                                                                 |

### Hooks + Service

**New file:** `apps/electron/src/renderer/console/src/services/benchmarkService.ts`

- API functions: `fetchBenchmarks()`, `updateBenchmark()`, `fetchBenchmarkDetail()`, `assignBenchmark()`, `unassignBenchmark()`, `updateAssignment()`, `fetchPersonBenchmarks()`

**New directory:** `apps/electron/src/renderer/console/src/hooks/queries/benchmarks/`

- `useBenchmarks.ts` — admin list
- `useBenchmarkDetail.ts` — admin detail with people breakdown
- `useBenchmarkAssignments.ts` — manage assignments
- `usePersonBenchmarks.ts` — benchmarks for a specific person (admin view)

---

## Phase 4: Employee Frontend — My Benchmarks

### Navigation

**File:** `apps/electron/src/renderer/console/src/components/navigation/Nav.tsx`

- Add `<NavItem to="/benchmarks" icon={Target} label="Benchmarks" />` in employee nav (between Me and Agent)

### Routes

**File:** `apps/electron/src/renderer/console/src/App.tsx`

- `/benchmarks` → `<MyBenchmarksView />` (employee) or `<BenchmarksView />` (admin) — route renders based on `isAdminView`

### Components

**New directory:** `apps/electron/src/renderer/console/src/components/views/employee/BenchmarksView/`

| File                        | Purpose                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`                 | List of my benchmarks with progress cards, period selector                                                            |
| `BenchmarkProgressCard.tsx` | Name, progress bar (green >80%, yellow 50-80%, neutral below), current vs target, trend arrow, accomplishment callout |
| `BenchmarkDetailView.tsx`   | Single benchmark — historical trend chart, AI suggestions, accomplishment timeline                                    |

**Key UX elements:**

- Celebration moments when benchmarks exceeded (confetti/badge)
- Accomplishment highlights front and center ("You had 4 deep focus sessions this week!")
- Actionable suggestions framed as growth opportunities, not deficiencies
- Historical trend mini-chart showing improvement over time

### Hooks

**New files in:** `apps/electron/src/renderer/console/src/hooks/queries/benchmarks/`

- `useMyBenchmarks.ts` — employee's benchmark list + latest snapshots
- `useMyBenchmarkDetail.ts` — single benchmark with history

---

## Phase 5: Pre-built Templates + Seed Data

**New file:** `apps/backend/src/db/seeds/benchmark-templates.ts`

Ship with these pre-built benchmarks (seeded into `benchmarks` table with `isBuiltIn = true`):

**Core EPD Benchmarks:**

1. **AI Adoption & Tool Usage** (qualitative) — AI evaluates usage of AI tools from app data; how effectively they leverage AI in workflows
2. **Clear Communication** (instance-based) — minutes spent on communication activities (Slack, email, docs, standups) per week; frequency of proactive status updates
3. **Cross-functional Collaboration** (diversity score) — composite score measuring topic/category/app diversity as a proxy for collaboration breadth (no team/department field exists on users; `subscriberName` = external client, not internal team)
4. **Mentorship & Development** (instance-based) — minutes of 1:1s, coaching sessions, code review walkthroughs per week
5. **Proactive vs Reactive Work** (qualitative) — AI evaluates ratio of planned/proactive work vs interrupt-driven/reactive work from task patterns

**Supporting Benchmarks:** 6. **Deep Focus Work** (instance-based) — avg daily focus minutes (work minus meetings) 7. **Meeting Efficiency** (percentage of time) — meeting time as % of active time 8. **Consistent Engagement** (instance-based) — active working days per week 9. **Work-Life Balance** (instance-based) — daily active hours in healthy range

Seed via `npm run db:seed --workspace=apps/backend` or auto-insert on first org admin visit.

---

## Pre-built Benchmark Specifications

Each template below includes: what it measures, exactly how it's computed from existing data, the SQL/Drizzle query logic, and what AI insights look like.

### 1. AI Adoption & Tool Usage (Qualitative — AI-Assessed)

**What it measures:** How effectively the employee leverages AI tools in their workflow.

**Measurement type:** Score (1-5, mapped to 0-100%)

**Data sources:**

- `userDailyActivities.appBreakdown` — filter for AI-related apps
- `activityBlocks` — blocks where `apps` array contains AI tools
- `activityBlocks.description` — mentions of AI-assisted work

**Computation:**

```sql
-- Gather app usage data
SELECT activity_date, app_breakdown, category_breakdown
FROM user_daily_activities
WHERE user_id = $userId
  AND activity_date BETWEEN $periodStart AND $periodEnd
  AND status = 'completed'

-- Gather activity blocks involving AI tools
SELECT name, description, apps, duration_minutes, category
FROM activity_blocks ab
JOIN user_daily_activities uda ON ab.daily_activity_id = uda.id
WHERE ab.user_id = $userId
  AND uda.activity_date BETWEEN $periodStart AND $periodEnd
```

The service filters `appBreakdown` entries matching known AI tool names (`["Copilot", "ChatGPT", "Claude", "Gemini", "Cursor", "Windsurf", "v0", "Replit", "Cody", "Tabnine", "Amazon Q"]`), computes total AI tool minutes, then passes all context to the LLM for scoring.

**metricConfig:**

```json
{
  "evaluationPrompt": "Evaluate AI tool adoption and effectiveness in the employee's workflow...",
  "dataSourceHints": [
    "userDailyActivities.appBreakdown",
    "activityBlocks.apps",
    "activityBlocks.description"
  ],
  "scoringRubric": "1-5: 1=no AI usage, 2=occasional/passive, 3=regular integrated usage, 4=AI-augmented productivity across tools, 5=AI-first workflow with measurable efficiency gains",
  "aiToolPatterns": [
    "Copilot",
    "ChatGPT",
    "Claude",
    "Gemini",
    "Cursor",
    "Windsurf",
    "v0",
    "Replit",
    "Cody",
    "Tabnine",
    "Amazon Q"
  ]
}
```

**Target:** 4/5 score (higher is better)

**Score → percentage:** `(score / 5) * 100` = progressPercent

**Example AI insights:**

- "Used Copilot in 12 coding sessions — try extending to code reviews too"
- "Great ChatGPT usage for research! Consider using Claude for longer document drafts"

---

### 2. Clear Communication (Instance-Based)

**What it measures:** Minutes spent on communication activities per week — Slack messages, email composition, status update writing, standup participation, and documentation sharing.

**Measurement type:** Minutes per week

**Data sources:**

- `activityBlocks` — blocks where `apps` include communication tools OR `category` involves communication
- `userDailyActivities.appBreakdown` — minutes in Slack, Gmail, Outlook, Teams
- `userDailyActivities.categoryBreakdown` — "communication" category minutes

**Computation:**

```sql
-- Option A: Sum communication category minutes from daily activities
SELECT SUM(
  (SELECT COALESCE(SUM((elem->>'minutes')::int), 0)
   FROM jsonb_array_elements(category_breakdown) AS elem
   WHERE elem->>'category' ILIKE '%communication%')
) as comm_minutes
FROM user_daily_activities
WHERE user_id = $userId
  AND activity_date BETWEEN $periodStart AND $periodEnd
  AND status = 'completed'

-- Option B: Sum activity blocks that are communication-related
SELECT SUM(duration_minutes) as comm_minutes
FROM activity_blocks ab
JOIN user_daily_activities uda ON ab.daily_activity_id = uda.id
WHERE ab.user_id = $userId
  AND uda.activity_date BETWEEN $periodStart AND $periodEnd
  AND (
    ab.category ILIKE '%communication%'
    OR ab.apps::text ILIKE ANY(ARRAY['%Slack%', '%Gmail%', '%Outlook%', '%Teams%'])
  )
```

**metricConfig:**

```json
{
  "measurementType": "instance_based",
  "source": "activityBlocks",
  "computation": "sumMinutes",
  "filter": {
    "categoryMatch": "communication",
    "appMatch": ["Slack", "Gmail", "Outlook", "Teams", "Loom", "Notion"]
  },
  "aggregation": "sum_per_period"
}
```

**Target:** 120 min/week (higher is better — ensuring sufficient communication)

**AI insight context:** Pass the communication blocks with descriptions so AI can assess communication quality (e.g., "You spent 90 min on Slack but only 10 min on async docs — try writing more status updates to reach distributed teammates").

---

### 3. Cross-functional Collaboration (Diversity Score)

**What it measures:** The diversity of an employee's work across different topics, categories, and tools. Higher diversity indicates more cross-functional engagement rather than siloed work.

**Note:** There is no team/department field on users, and `subscriberName` represents external clients (not internal teams). This benchmark uses topic/category/app diversity as a collaboration proxy instead.

**Measurement type:** Composite score (0-100)

**Data sources:**

- `activityBlocks.topicName` — count distinct topics worked on
- `activityBlocks.category` — count distinct work categories
- `userDailyActivities.appBreakdown` — count distinct apps used

**Computation:**

```sql
-- Count distinct topics in period
SELECT COUNT(DISTINCT topic_name) as topic_count
FROM activity_blocks ab
JOIN user_daily_activities uda ON ab.daily_activity_id = uda.id
WHERE ab.user_id = $userId
  AND uda.activity_date BETWEEN $periodStart AND $periodEnd
  AND ab.topic_name IS NOT NULL
  AND ab.topic_name NOT IN ('', 'unknown', 'n/a')

-- Count distinct categories in period
SELECT COUNT(DISTINCT category) as category_count
FROM activity_blocks ab
JOIN user_daily_activities uda ON ab.daily_activity_id = uda.id
WHERE ab.user_id = $userId
  AND uda.activity_date BETWEEN $periodStart AND $periodEnd
  AND ab.category IS NOT NULL

-- Count distinct apps from daily activity app_breakdown JSONB
-- (parse appBreakdown array, count distinct app names)

-- Score = weighted composite:
--   topic_diversity:    min(topic_count / 10, 1.0) * 50   (0-50 points)
--   category_diversity: min(category_count / 5, 1.0) * 30  (0-30 points)
--   app_diversity:      min(app_count / 10, 1.0) * 20      (0-20 points)
-- Total: 0-100
```

**metricConfig:**

```json
{
  "measurementType": "percentage_of_time",
  "source": "activityBlocks",
  "computation": "diversityScore",
  "components": {
    "topicDiversity": { "weight": 0.5, "maxExpected": 10 },
    "categoryDiversity": { "weight": 0.3, "maxExpected": 5 },
    "appDiversity": { "weight": 0.2, "maxExpected": 10 }
  },
  "aggregation": "composite_per_period"
}
```

**Target:** 70/100 diversity score (higher is better)

**AI insight context:** Pass the distinct topics, categories, and apps so AI identifies gaps (e.g., "You worked across 8 topics but all in the 'coding' category — try engaging in design reviews or documentation to broaden your impact").

---

### 4. Mentorship & Development (Instance-Based)

**What it measures:** Total minutes spent on mentorship and development activities per week — 1:1 meetings, coaching sessions, code review walkthroughs, pair programming, knowledge sharing.

**Measurement type:** Minutes per week

**Data source:** `activityBlocks` — meeting blocks matching mentorship patterns

**Computation:**

```sql
-- Sum minutes of mentorship-related activity blocks
SELECT SUM(duration_minutes) as mentorship_minutes
FROM activity_blocks ab
JOIN user_daily_activities uda ON ab.daily_activity_id = uda.id
WHERE ab.user_id = $userId
  AND uda.activity_date BETWEEN $periodStart AND $periodEnd
  AND (
    -- Meeting blocks that look like 1:1s or coaching (name/description matching only)
    (ab.block_type IN ('meeting', 'granola', 'fireflies') AND (
      ab.name ILIKE ANY(ARRAY['%1:1%', '%1-on-1%', '%one on one%', '%mentorship%', '%coaching%', '%onboarding%'])
      OR ab.description ILIKE ANY(ARRAY['%mentor%', '%coach%', '%pair program%', '%code review walkthrough%', '%knowledge sharing%'])
    ))
    -- Work blocks that are mentorship-related
    OR ab.category ILIKE '%mentor%'
    OR ab.category ILIKE '%review%'
  )
```

**Note on task-level analysis:** We use activity blocks (tasks) not raw captures. The Day Analyzer RLM already classifies blocks with names, descriptions, and categories that indicate mentorship activity. This gives much more accurate results than trying to parse raw screenshots. We rely solely on name/description pattern matching — `participants` JSONB is only populated by Granola/Fireflies integrations and would be empty for most users.

**metricConfig:**

```json
{
  "measurementType": "instance_based",
  "source": "activityBlocks",
  "computation": "sumMinutes",
  "filter": {
    "blockType": ["meeting", "granola", "fireflies"],
    "nameMatch": ["1:1", "1-on-1", "one on one", "mentorship", "coaching", "onboarding"],
    "descriptionMatch": [
      "mentor",
      "coach",
      "pair program",
      "code review walkthrough",
      "knowledge sharing"
    ],
    "categoryMatch": ["mentor", "review"]
  },
  "aggregation": "sum_per_period"
}
```

**Target:** 30 min/week (higher is better)

**AI insight context:** Pass matching meeting blocks with participant names and durations so AI can identify patterns (e.g., "You met with your mentee twice this week for 15 min each — try extending to 30 min for deeper discussions").

---

### 5. Proactive vs Reactive Work (Qualitative — AI-Assessed)

**What it measures:** The ratio of planned, proactive work (pre-scheduled tasks, project milestones, strategic initiatives) vs interrupt-driven, reactive work (ad-hoc requests, firefighting, unplanned context switches).

**Measurement type:** Score (1-5, mapped to 0-100%)

**Data sources:**

- `activityBlocks` — block names, descriptions, timing patterns, category
- `userDailyActivities` — daily summaries, key accomplishments
- `activityBlocks` sequence and timing — frequent short blocks suggest reactive work; long sustained blocks suggest proactive

**How the AI evaluates this:**

The AI examines several signals from task-level data:

1. **Block duration distribution** — Many short blocks (<15 min) suggest reactive/interrupt-driven work. Longer blocks (>45 min) suggest planned, proactive work.
2. **Block descriptions** — Words like "fix", "urgent", "bug", "firefight", "ad-hoc" suggest reactive. Words like "implement", "design", "plan", "research", "milestone" suggest proactive.
3. **Context switches** — High count of distinct topics/apps per hour suggests reactive mode.
4. **Meeting patterns** — Many unscheduled/ad-hoc meetings vs recurring planned meetings.
5. **Time-of-day patterns** — Reactive workers often have fragmented mornings; proactive workers have sustained focus blocks.

**Computation:**

```sql
-- Get all activity blocks for the period with timing details
SELECT
  name, description, block_type, category,
  start_time, end_time, duration_minutes,
  apps, topic_name, subscriber_name, sequence_number
FROM activity_blocks ab
JOIN user_daily_activities uda ON ab.daily_activity_id = uda.id
WHERE ab.user_id = $userId
  AND uda.activity_date BETWEEN $periodStart AND $periodEnd
ORDER BY ab.start_time

-- Also get daily summaries for context
SELECT activity_date, day_summary, key_accomplishments
FROM user_daily_activities
WHERE user_id = $userId
  AND activity_date BETWEEN $periodStart AND $periodEnd
  AND status = 'completed'
```

**AI evaluation prompt:**

```
System: You are evaluating the balance of proactive vs reactive work patterns.

Analyze the employee's activity blocks for the period and score on a 1-5 scale:
- 1 = Mostly reactive (>80% firefighting, ad-hoc, interrupt-driven)
- 2 = Heavily reactive (60-80% reactive)
- 3 = Balanced (roughly 50/50 proactive vs reactive)
- 4 = Mostly proactive (60-80% planned, strategic work)
- 5 = Highly proactive (>80% planned, self-directed, strategic)

Signals to examine:
- Block duration distribution (short fragmented = reactive, long sustained = proactive)
- Block descriptions (fix/urgent/bug = reactive, implement/design/plan = proactive)
- Context switch frequency (many topic changes per hour = reactive)
- Meeting types (ad-hoc vs recurring/planned)

Rules:
- Frame positively — highlight proactive wins first
- Provide specific, actionable suggestions for becoming more proactive
- Reference their actual data in accomplishments

Respond as JSON: { "score": number, "reasoning": string, "accomplishments": string[], "suggestions": string[] }
```

**metricConfig:**

```json
{
  "evaluationPrompt": "Evaluate proactive vs reactive work balance from activity patterns...",
  "dataSourceHints": [
    "activityBlocks.name",
    "activityBlocks.description",
    "activityBlocks.durationMinutes",
    "activityBlocks.startTime",
    "userDailyActivities.daySummary"
  ],
  "scoringRubric": "1-5: 1=mostly reactive/firefighting, 3=balanced, 5=highly proactive/strategic",
  "proactiveSignals": [
    "implement",
    "design",
    "plan",
    "research",
    "milestone",
    "spec",
    "architecture"
  ],
  "reactiveSignals": ["fix", "urgent", "bug", "firefight", "ad-hoc", "hotfix", "escalation"]
}
```

**Target:** 4/5 score (higher is better)

**Example AI insights:**

- "72% of your work blocks this week were sustained focus sessions (>45 min) — strong proactive pattern"
- "Tuesday had 8 context switches before noon — consider batching Slack responses to reduce interruptions"
- "Your Friday was highly proactive with a 3-hour design sprint — more of that!"

---

### 6. Deep Focus Work (Instance-Based)

**What it measures:** Average daily minutes of uninterrupted focus work (work time minus meeting time).

**Measurement type:** Minutes per day

**Data source:** `userDailyActivities`

**Computation:**

```sql
SELECT AVG(total_work_minutes - total_meeting_minutes) as focus_avg
FROM user_daily_activities
WHERE user_id = $userId
  AND activity_date BETWEEN $periodStart AND $periodEnd
  AND period_type = 'daily'
  AND status = 'completed'
```

**metricConfig:**

```json
{
  "measurementType": "instance_based",
  "source": "userDailyActivities",
  "computation": "avg(totalWorkMinutes - totalMeetingMinutes)",
  "aggregation": "avg_per_day"
}
```

**Target:** 120 min/day (higher is better)

**Score:** `(currentValue / targetValue) * 100`

---

### 7. Meeting Efficiency (Percentage of Time)

**What it measures:** Meeting time as a percentage of total active time.

**Measurement type:** Percentage of time

**Data source:** `userDailyActivities`

**Computation:**

```sql
SELECT AVG(meeting_percentage) as avg_meeting_pct
FROM user_daily_activities
WHERE user_id = $userId
  AND activity_date BETWEEN $periodStart AND $periodEnd
  AND period_type = 'daily'
  AND status = 'completed'
```

**metricConfig:**

```json
{
  "measurementType": "percentage_of_time",
  "source": "userDailyActivities",
  "computation": "avg(meetingPercentage)",
  "aggregation": "avg_per_day"
}
```

**Target:** <30% (`targetDirection: "lower_is_better"`)

**Score for lower_is_better:** At/below target → 100%. Above: `(targetValue / currentValue) * 100`.

---

### 8. Consistent Engagement (Instance-Based)

**What it measures:** Active working days per period (days with >30 minutes of tracked activity).

**Measurement type:** Count per week

**Data source:** `userDailyActivities`

**Computation:**

```sql
SELECT COUNT(*) as active_days
FROM user_daily_activities
WHERE user_id = $userId
  AND activity_date BETWEEN $periodStart AND $periodEnd
  AND period_type = 'daily'
  AND total_active_minutes > 30
  AND status = 'completed'
```

**metricConfig:**

```json
{
  "measurementType": "instance_based",
  "source": "userDailyActivities",
  "computation": "count(*) WHERE totalActiveMinutes > 30",
  "aggregation": "count_per_period"
}
```

**Target:** 5 days/week (higher is better)

---

### 9. Work-Life Balance (Instance-Based)

**What it measures:** Average daily active hours — should fall within a healthy range.

**Measurement type:** Hours per day (in-range)

**Data source:** `userDailyActivities`

**Computation:**

```sql
SELECT AVG(total_active_minutes / 60.0) as avg_hours
FROM user_daily_activities
WHERE user_id = $userId
  AND activity_date BETWEEN $periodStart AND $periodEnd
  AND period_type = 'daily'
  AND total_active_minutes > 0
  AND status = 'completed'
```

**metricConfig:**

```json
{
  "measurementType": "instance_based",
  "source": "userDailyActivities",
  "computation": "avg(totalActiveMinutes / 60)",
  "aggregation": "avg_per_day",
  "targetRange": [6, 9]
}
```

**Target:** 6-9 hours/day (`targetDirection: "in_range"`, `targetValue`: 7.5)

**Score for in_range:** Within range → 100%. Below: `(value / rangeMin) * 100`. Above: `(rangeMax / value) * 100`.

---

## Backend Computation Architecture

### How Benchmark Computation Works End-to-End

**New files:**

- `apps/backend/src/services/benchmark-computation.service.ts` — orchestrator
- `apps/backend/src/services/benchmark-insight.service.ts` — AI evaluation + insights
- `apps/backend/src/services/benchmark-environment.ts` — stateful context (follows RLM environment pattern)
- `apps/backend/src/services/benchmark-prompts.ts` — system/user prompts

### Computation Flow

```
┌─────────────────────────────────────────────────────┐
│           Benchmark Computation Service              │
│                                                      │
│  1. Load all active benchmarks for org               │
│  2. For each benchmark:                              │
│     ├─ Determine period boundaries (periodStart/End) │
│     ├─ Get assigned users (from benchmark_assignments)│
│     └─ For each assigned user:                       │
│        ├─ IF quantitative:                           │
│        │   ├─ Run SQL query based on metricConfig    │
│        │   ├─ Compute currentValue                   │
│        │   └─ Calculate progressPercent vs target    │
│        ├─ IF qualitative:                            │
│        │   ├─ Gather context data (blocks, apps)     │
│        │   ├─ Call AI with evaluation prompt          │
│        │   ├─ Parse score + reasoning                │
│        │   └─ Map score to progressPercent           │
│        ├─ Look up previous snapshot for trend        │
│        ├─ Compute percentile across all users        │
│        └─ Generate AI insight + suggestions          │
│  3. Upsert all benchmark_snapshots                   │
│  4. Update percentile ranks across all users         │
└─────────────────────────────────────────────────────┘
```

### Quantitative Resolution

The computation service uses a **metric resolver** pattern — a switch on the `metricConfig.computation` string that maps to Drizzle queries:

```typescript
// benchmark-computation.service.ts

async resolveQuantitative(
  benchmark: Benchmark,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const config = benchmark.metricConfig as QuantitativeConfig;

  switch (config.computation) {
    case "avg(totalWorkMinutes - totalMeetingMinutes)":
      return this.avgFocusMinutes(userId, periodStart, periodEnd);

    case "avg(meetingPercentage)":
      return this.avgMeetingPercentage(userId, periodStart, periodEnd);

    case "count(*) WHERE totalActiveMinutes > 30":
      return this.countActiveDays(userId, periodStart, periodEnd);

    case "avg(totalActiveMinutes / 60)":
      return this.avgActiveHours(userId, periodStart, periodEnd);

    case "diversityScore":
      return this.computeDiversityScore(userId, periodStart, periodEnd, config.components);

    default:
      throw new Error(`Unknown computation: ${config.computation}`);
  }
}
```

Each resolver method is a focused Drizzle query against `userDailyActivities` or `activityBlocks`.

### Qualitative Resolution

Follows the RLM pattern from `block-analyzer-rlm.service.ts`:

```typescript
async resolveQualitative(
  benchmark: Benchmark,
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ score: number; reasoning: string; accomplishments: string[]; suggestions: string[] }> {
  const config = benchmark.metricConfig as QualitativeConfig;

  // 1. Gather context data based on dataSourceHints
  const contextData = await this.gatherQualitativeContext(
    userId, periodStart, periodEnd, config.dataSourceHints
  );

  // 2. Build prompt
  const systemPrompt = buildBenchmarkEvaluationPrompt(
    benchmark.name, config.evaluationPrompt, config.scoringRubric
  );

  // 3. Call AI (Claude Haiku 4.5 → GPT-5 → DeepSeek V3.2 fallback chain)
  const response = await this.callAI(systemPrompt, contextData);

  // 4. Parse structured response
  return parseJsonResponse(response);
}
```

### Percentile Computation

After ALL users have their `currentValue` computed for a benchmark+period:

```typescript
async computePercentiles(benchmarkId: string, periodStart: Date): Promise<void> {
  // Get all snapshots for this benchmark+period, ordered by currentValue
  const snapshots = await db.select()
    .from(benchmarkSnapshots)
    .where(and(
      eq(benchmarkSnapshots.benchmarkId, benchmarkId),
      eq(benchmarkSnapshots.periodStart, periodStart)
    ))
    .orderBy(asc(benchmarkSnapshots.currentValue));

  const total = snapshots.length;

  for (let i = 0; i < total; i++) {
    const percentileRank = ((i + 1) / total) * 100;
    // For "lower_is_better" benchmarks, invert the rank
    const adjustedRank = benchmark.targetDirection === "lower_is_better"
      ? 100 - percentileRank + (100 / total)
      : percentileRank;

    const label = adjustedRank >= 99 ? "top_1"
      : adjustedRank >= 90 ? "top_10"
      : adjustedRank >= 75 ? "top_25"
      : adjustedRank >= 50 ? "top_50"
      : "bottom_half";

    await db.update(benchmarkSnapshots)
      .set({ percentileRank: adjustedRank, percentileLabel: label })
      .where(eq(benchmarkSnapshots.id, snapshots[i].id));
  }
}
```

### AI Insight Generation (All Benchmarks)

After computing value and percentile, generate positive-framing insights:

```typescript
async generateInsight(
  benchmark: Benchmark,
  snapshot: BenchmarkSnapshot,
  contextData: any
): Promise<{ insight: string; suggestions: string[]; accomplishments: string[] }> {
  const prompt = `
You are generating a positive, growth-oriented performance insight.

Benchmark: ${benchmark.name}
Current value: ${snapshot.currentValue} (target: ${snapshot.targetValue})
Progress: ${snapshot.progressPercent}%
Percentile: ${snapshot.percentileLabel}
Trend: ${snapshot.trend} (${snapshot.trendDelta > 0 ? '+' : ''}${snapshot.trendDelta})

Rules:
- NEVER frame anything negatively or punitively
- Lead with accomplishments — what they DID well
- Frame gaps as opportunities for growth, not failures
- Suggestions must be specific and actionable (tied to their actual data)
- If they're below target, focus on their improvement trajectory
- If they exceed target, celebrate it

Respond as JSON:
{
  "insight": "1-2 sentence positive summary",
  "accomplishments": ["specific thing they did well", ...],
  "suggestions": ["specific actionable suggestion", ...]
}`;

  return this.callAI(prompt, contextData);
}
```

### No Custom Benchmarks (Phase 1)

Phase 1 ships with the 9 pre-built benchmarks only. Admins can adjust targets and assign/unassign people, but cannot create new benchmark definitions. This simplifies the UX and lets us prove the concept before building a full benchmark builder.

**Future (Phase 2):** Add a custom benchmark builder where admins can define new benchmarks by selecting from available data sources:

| Source                         | Fields Available                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `userDailyActivities`          | totalWorkMinutes, totalMeetingMinutes, totalActiveMinutes, workPercentage, meetingPercentage |
| `userDailyActivities` JSONB    | appBreakdown, categoryBreakdown, topicBreakdown, subscriberBreakdown                         |
| `activityBlocks`               | blockType, name, durationMinutes, apps, category, participants, subscriberName, topicName    |
| `activityBlocks.rawTranscript` | Meeting transcripts (qualitative only)                                                       |

---

## UI Mockups

### Admin: Benchmarks List View (`/benchmarks` in admin mode)

Pre-built benchmarks are always visible. Cards show how many people are assigned and aggregate progress.

```
┌─────────────────────────────────────────────────────────────────┐
│  Benchmarks                                                     │
│                                                                 │
│  ┌─ Filter ──────────────────────────────────────────────────┐  │
│  │  All ·  Productivity ·  Collaboration ·  Growth · Quality │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ── Core EPD Benchmarks ─────────────────────────────────────   │
│                                                                 │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │  AI Adoption & Tool Usage   │ │  Clear Communication        ││
│  │ GROWTH · Weekly · AI        │ │ COLLABORATION · Weekly       ││
│  │                             │ │                              ││
│  │ Assigned: 4 people          │ │ Assigned: 6 people           ││
│  │ Avg Score: ██████░░  72%    │ │ Avg: ████████░░  80%         ││
│  │ ↑ Improving                 │ │ → Stable                     ││
│  │                  [Manage →] │ │                   [Manage →] ││
│  └─────────────────────────────┘ └─────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │  Cross-functional Collab    │ │  Mentorship & Development   ││
│  │ COLLABORATION · Weekly      │ │ GROWTH · Weekly              ││
│  │                             │ │                              ││
│  │ Assigned: 5 people          │ │ Assigned: 3 people           ││
│  │ Avg: ██████████░░  62%      │ │ Avg: ████████████░░  78%     ││
│  │ → Stable                    │ │ ↑ Improving                  ││
│  │                  [Manage →] │ │                   [Manage →] ││
│  └─────────────────────────────┘ └─────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────┐                                │
│  │  Proactive vs Reactive      │                                │
│  │ QUALITY · Weekly · AI       │                                │
│  │                             │                                │
│  │ Assigned: 4 people          │                                │
│  │ Avg Score: █████████░  85%  │                                │
│  │ ↑ Improving                 │                                │
│  │                  [Manage →] │                                │
│  └─────────────────────────────┘                                │
│                                                                 │
│  ── Supporting Benchmarks ───────────────────────────────────   │
│                                                                 │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │  Deep Focus Work            │ │  Meeting Efficiency          ││
│  │ PRODUCTIVITY · Weekly       │ │ PRODUCTIVITY · Weekly        ││
│  │ Assigned: 5 people          │ │ Assigned: 6 people           ││
│  │ Avg: ████████████░░  78%    │ │ Avg: █████████████░  88%     ││
│  │                  [Manage →] │ │                   [Manage →] ││
│  └─────────────────────────────┘ └─────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │  Consistent Engagement      │ │  Work-Life Balance           ││
│  │ PRODUCTIVITY · Weekly       │ │ QUALITY · Weekly             ││
│  │ Assigned: 8 people          │ │ Assigned: 8 people           ││
│  │ Avg: ██████████████░  92%   │ │ Avg: █████████████░░  82%    ││
│  │                  [Manage →] │ │                   [Manage →] ││
│  └─────────────────────────────┘ └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Admin: Assign Benchmark Modal (person-by-person)

Opened when clicking [Manage →] on a benchmark card. Shows who is assigned and lets admin add/remove people.

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Adoption & Tool Usage                                [x]    │
│  Manage Assignments                                             │
│                                                                 │
│  Default Target: 4/5 score · Weekly                  [Edit]     │
│                                                                 │
│  ── Currently Assigned ──────────────────────────────────────   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Sarah Chen (Engineer)      Target: 4/5 (default)  [x]  │    │
│  │ Alex Kim (Engineer)        Target: 4/5 (default)  [x]  │    │
│  │ Jordan Lee (Designer)      Target: 3/5 (custom)   [x]  │    │
│  │ Pat Rivera (PM)            Target: 4/5 (default)  [x]  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ── Add People ──────────────────────────────────────────────   │
│                                                                 │
│  Search by name...                                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ [ ] Sam Taylor (Engineer)                               │    │
│  │ [ ] Morgan Davis (CS Lead)                              │    │
│  │ [ ] Casey Jones (Product Manager)                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [ ] Set custom target for selected                             │
│                                                                 │
│                                  [Cancel]  [Save Assignments]   │
└─────────────────────────────────────────────────────────────────┘
```

### Admin: Benchmark Detail View (`/benchmarks/:id`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Benchmarks                                       [Edit] [:]  │
│                                                                 │
│  Deep Focus Work                                                │
│  Track uninterrupted focus time · PRODUCTIVITY · Weekly         │
│  Target: 120 min/day (higher is better)                         │
│                                                                 │
│  ── Organization Overview ───────────────────────────────────   │
│                                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ Team Average   │  │ On Track      │  │ Trend         │       │
│  │    78%         │  │    3 / 5      │  │  ↑ +8%        │       │
│  │ 94 min/day     │  │   people      │  │  vs last week │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│                                                                 │
│  ── Team Breakdown ──────────────────────────────────────────   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Name           Value    Progress     Trend    Insight   │    │
│  │─────────────────────────────────────────────────────────│    │
│  │ Sarah Chen     142 min  ████████ 118%  ↑ +12%  Star!   │    │
│  │ Alex Kim       115 min  ██████░░  96%  ↑  +5%  On pace │    │
│  │ Jordan Lee     98 min   █████░░░  82%  ↑  +3%  Growing │    │
│  │ Pat Rivera     72 min   ███░░░░░  60%  → Same  Tip     │    │
│  │ Sam Taylor     54 min   ██░░░░░░  45%  ↑  +8%  Gaining │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ── AI Insight for Pat Rivera ───────────────────────────────   │
│  │ Pat's focus time is growing! They tend to have most      │   │
│  │ meetings before noon. Suggestion: Try blocking 2-3hr     │   │
│  │ afternoon focus slots — Pat's most productive app usage   │   │
│  │ happens between 1-4pm.                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Employee: My Benchmarks List (`/benchmarks` in employee mode)

**Key privacy rule:** Employees see their own value, progress %, percentile label (e.g., "Top 10%"), and AI insights. They NEVER see other employees' names or values.

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Benchmarks                     Week of Mar 23 [< >]       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Deep Focus Work                             This Week    │   │
│  │                                                          │   │
│  │ ████████████████████░░░░░  82%            ┌───────────┐  │   │
│  │ 98 min / 120 min daily avg                │  Top 10%  │  │   │
│  │ ↑ +12% vs last week                       └───────────┘  │   │
│  │                                                          │   │
│  │ ┌─ Accomplishments ─────────────────────────────────┐    │   │
│  │ │ * 3 deep focus sessions over 90 minutes           │    │   │
│  │ │ * Longest uninterrupted session: 2h 15m on Tue    │    │   │
│  │ │ * Focus time up 12% from last week                │    │   │
│  │ └──────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │ Tip: Try blocking your calendar 9-11am — your data      │   │
│  │ shows mornings are your most productive focus window.    │   │
│  │                                              [See More →]│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Cross-functional Collaboration              This Week    │   │
│  │                                                          │   │
│  │ ██████████████████████████  100% ✓        ┌───────────┐  │   │
│  │ 4 / 3 teams collaborated with             │  Top 1%   │  │   │
│  │ ↑ +1 team vs last week                    └───────────┘  │   │
│  │                                                          │   │
│  │ ┌─ Accomplishments ─────────────────────────────────┐    │   │
│  │ │ * Collaborated with Design, Backend, QA, Product  │    │   │
│  │ │ * Led cross-team sync on Thursday                 │    │   │
│  │ └──────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │ Benchmark exceeded! Great cross-team collaboration.      │   │
│  │                                              [See More →]│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AI Adoption                                 This Week    │   │
│  │                                                          │   │
│  │ ██████████████████░░░░░░  72%             ┌───────────┐  │   │
│  │ Score: 3.6 / 5.0 (AI-assessed)           │  Top 25%  │  │   │
│  │ ↑ Improving                               └───────────┘  │   │
│  │                                                          │   │
│  │ ┌─ Accomplishments ─────────────────────────────────┐    │   │
│  │ │ * Used Copilot in 12 coding sessions this week    │    │   │
│  │ │ * Leveraged ChatGPT for 3 research tasks          │    │   │
│  │ └──────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │ Tip: Try using AI for code reviews and PR descriptions  │   │
│  │ — teams using AI for reviews ship 20% faster.           │   │
│  │                                              [See More →]│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Mentorship                                 This Month    │   │
│  │                                                          │   │
│  │ ████████████████░░░░░░░░░  65%            ┌───────────┐  │   │
│  │ Score: 3.2 / 5.0 (AI-assessed)           │  Top 50%  │  │   │
│  │ ↑ Improving                               └───────────┘  │   │
│  │                                                          │   │
│  │ ┌─ Accomplishments ─────────────────────────────────┐    │   │
│  │ │ * Met with mentee 2x this month (up from 1x)     │    │   │
│  │ │ * Shared 3 code review walkthroughs               │    │   │
│  │ └──────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │ Tip: Your mentee meetings average 15 min — consider     │   │
│  │ extending to 30 min for deeper discussions.              │   │
│  │                                              [See More →]│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Work-Life Balance                           This Week    │   │
│  │                                                          │   │
│  │ █████████████████████░░░░  85%            ┌───────────┐  │   │
│  │ 7.2h / 6-9h target range                 │  Top 25%  │  │   │
│  │ → Stable                                  └───────────┘  │   │
│  │                                                          │   │
│  │ ┌─ Accomplishments ─────────────────────────────────┐    │   │
│  │ │ * Healthy work hours all 5 days this week         │    │   │
│  │ │ * No sessions past 6:30pm — nice boundary!        │    │   │
│  │ └──────────────────────────────────────────────────┘    │   │
│  │                                              [See More →]│   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Employee: Benchmark Detail View (`/benchmarks/:id` in employee mode)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Your Benchmarks                                              │
│                                                                 │
│  Deep Focus Work                                                │
│  Uninterrupted focus time per day · Target: 120 min             │
│                                                                 │
│  ── Current Period: Week of Mar 23 ──────────────────────────   │
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  Progress    │ │  Daily Avg  │ │ vs Last Wk  │ │ Percentile│ │
│  │     82%      │ │   98 min    │ │  ↑ +12%     │ │  Top 10%  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                 │
│  ── 8-Week Trend ────────────────────────────────────────────   │
│                                                                 │
│       120 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ target             │
│  min  110 ┤                              /                      │
│       100 ┤                         /───/                       │
│        90 ┤                    /───/                             │
│        80 ┤              /────/                                  │
│        70 ┤        /────/                                        │
│        60 ┤──/────/                                              │
│            W1   W2   W3   W4   W5   W6   W7   W8               │
│                                                                 │
│  ── This Week's Accomplishments ─────────────────────────────   │
│                                                                 │
│  * 3 deep focus sessions over 90 minutes                       │
│  * Longest session: 2h 15m on Tuesday (VS Code, Figma)         │
│  * Focus time increased 12% week-over-week                     │
│  * Most productive hours: 9am-11am consistently                │
│                                                                 │
│  ── Suggestions ─────────────────────────────────────────────   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Block your calendar 9-11am daily                         │   │
│  │ Your data shows this is your peak focus window. A        │   │
│  │ recurring block could add ~20 min of focus daily.        │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ Try "Do Not Disturb" during afternoon coding             │   │
│  │ You average 3 context switches between 2-4pm. Reducing   │   │
│  │ interruptions here could boost your afternoon focus.     │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │ You're close! Just 22 more min/day to hit target         │   │
│  │ At your current improvement rate, you'll reach 120       │   │
│  │ min/day in about 2-3 weeks. Keep it up!                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ── Daily Breakdown This Week ───────────────────────────────   │
│                                                                 │
│  Mon  ████████████████░░░░  89 min                              │
│  Tue  ██████████████████████  135 min  Best day!                │
│  Wed  ████████████████░░░░  92 min                              │
│  Thu  ██████████░░░░░░░░░░  68 min  (3 meetings)               │
│  Fri  ██████████████████░░  108 min                             │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation Updates (Both Modes)

```
ADMIN NAV:                         EMPLOYEE NAV:
┌──────────────┐                   ┌──────────────┐
│  Dashboard   │                   │  Calendar     │
│  Agent       │                   │  Me           │
│  Reports     │                   │  Benchmarks   │  ← NEW
│  Benchmarks  │  ← NEW           │  Agent        │
│  People      │                   │  Docs         │
└──────────────┘                   │  Uploads      │
                                   └──────────────┘
```

---

## Implementation Order

1. **Schema + migration** — `benchmarks.schema.ts` (benchmarks, benchmark_assignments, benchmark_snapshots), export from `schema/index.ts`, run `db:push`
2. **Seed pre-built benchmarks** — `apps/backend/src/db/seeds/benchmark-templates.ts`, insert 9 benchmark definitions with `isBuiltIn = true` via `npm run db:seed`
3. **Computation service** — `benchmark-computation.service.ts` with quantitative resolvers (incl. diversity score + mentorship name matching) and qualitative AI evaluation via Claude Haiku 4.5 chain
4. **AI insight service** — `benchmark-insight.service.ts` for positive-framing insight generation on all benchmarks, following RLM pattern from `block-analyzer-rlm.service.ts`
5. **Backend routes** — `apps/backend/src/routes/benchmarks.ts` with admin CRUD + assignment + employee self-scoped endpoints, register in `routes.ts` using `verifyAdmin()` pattern from `admin-dashboard.ts`
6. **Cron jobs** — `apps/backend/src/cron/jobs/benchmark-compute.job.ts` with period-aligned scheduling (daily 03:00, weekly Mon 03:30, monthly 1st 04:00), register in `cron/index.ts`
7. **Admin UI** — BenchmarksView with card grid, AssignBenchmarkModal (shadcn Dialog), BenchmarkDetail with per-person table (custom row rendering)
8. **Employee UI** — MyBenchmarksView with progress cards (Card + ProgressBar + Badge), BenchmarkDetailView with trend charts (Recharts)
9. **Nav + routing** — Add Benchmarks NavItem (lucide-react `Target` icon) for both admin and employee in `Nav.tsx`, add routes in `App.tsx`

---

## Verification

1. **Schema**: Run `npm run db:push --workspace=apps/backend` and verify 3 tables created in Drizzle Studio (`npm run db:studio`)
2. **Seed data**: Verify 9 pre-built benchmarks appear in `benchmarks` table with `is_built_in = true`
3. **Assignment flow**: Assign a benchmark to a user via `/api/admin/benchmarks/:id/assign`, verify `benchmark_assignments` row created
4. **Computation**: Trigger `/api/admin/benchmarks/:id/compute`, verify `benchmark_snapshots` created with correct values
5. **Percentile**: Assign benchmark to 3+ users, compute all, verify percentile ranks and labels
6. **Admin UI**: Navigate to `/benchmarks` in admin mode, click [Manage], assign people, view detail with per-person table
7. **Employee UI**: Switch to employee mode, navigate to `/benchmarks`, verify only assigned benchmarks show with progress bars and percentile badges
8. **Privacy**: Confirm employee API responses contain NO other users' names or values
9. **AI insights**: Verify qualitative benchmarks (AI Adoption, Proactive vs Reactive) produce scores and positive-framing suggestions
10. **Typecheck**: `npm run typecheck` passes
11. **Tests**: Add tests for computation service, assignment routes, and percentile logic
