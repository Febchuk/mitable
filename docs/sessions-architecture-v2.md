# Sessions Architecture v2 — Complete System Design

## Executive Summary

This document outlines the improved architecture for Watch Mode sessions. The key changes are:

1. **Storage**: Move from DB-stored base64 images to Supabase Storage
2. **DB as Event Log**: Lightweight frame rows in DB, manifest generated as derived view
3. **Incremental Analysis**: Use Groq Llama 4 vision for per-frame quick summaries during capture
4. **Multi-Window Correlation**: Group frames by timestamp and detect relationships
5. **User Context**: Inject GitHub commits, PRs, and Linear tickets at summary time (not session start)
6. **Dynamic Schema**: AI extracts context with required guardrails (`application`, `activity_type`)
7. **Smart Screenshot Selection**: Model-driven selection of important frames for exports

---

## 1. Storage Architecture

### Bucket Structure

```
Bucket: mitable-sessions (single bucket, private)

Path structure:
{org_id}/
  {user_id}/
    {session_id}/
      manifest_001.json      ← First chunk (up to 300 capture groups)
      manifest_002.json      ← Second chunk (if session is long)
      frames/
        frame_0001.png
        frame_0002.png
        frame_0003.png
        ...
```

### Why This Structure

| Decision                       | Rationale                                  |
| ------------------------------ | ------------------------------------------ |
| Single bucket                  | Simpler RLS policies, easier management    |
| Org → User → Session hierarchy | Natural isolation, easy bulk deletion      |
| `frames/` subfolder            | Keeps manifests at root, images organized  |
| Private bucket                 | Backend uses service key, no public access |

### Lifecycle

| Event                      | Action                                                   |
| -------------------------- | -------------------------------------------------------- |
| Session starts             | Create session row in DB, create storage folder          |
| Frame captured             | Upload PNG to `frames/`, INSERT frame row in DB          |
| 300 capture groups reached | Generate chunk summary, create next manifest             |
| Session ends               | Finalize current manifest, aggregate all chunk summaries |
| Session deleted            | Delete entire `{session}/` folder                        |
| Org deleted                | Delete entire `{org}/` folder                            |

---

## 2. Manifest.json Schema (v2)

### Single Manifest Chunk

```json
{
  "version": "2.0",
  "session_id": "sess_abc123",
  "org_id": "org_456",
  "user_id": "user_789",

  "chunk_index": 1,
  "chunk_range": {
    "start": "2025-12-18T10:00:00.000Z",
    "end": "2025-12-18T11:15:00.000Z"
  },
  "is_final": false,

  "user_profile": {
    "name": "Aurel",
    "role": "Backend Engineer",
    "team": "Platform"
  },

  // NOTE: Full user_context (GitHub commits/PRs, Linear tickets) is fetched
  // at summary time, NOT stored in manifest. This avoids stale context for
  // long sessions and reduces data exposure.

  "config": {
    "capture_interval_ms": 10000,
    "triggers": ["periodic", "focus_change"]
  },

  "watched_windows": [
    { "window_source_id": "window:123", "label": "VS Code - mitable" },
    { "window_source_id": "window:456", "label": "Chrome" }
  ],

  "capture_groups": [
    {
      "group_id": "grp_001",
      "timestamp": "2025-12-18T10:00:10.000Z",
      "frames": [
        {
          "frame_id": "frame_0001",
          "filename": "frames/frame_0001.png",
          "window_source_id": "window:123",
          "hash": "sha256:abc123",
          "analysis": {
            "summary": "User editing authenticateUser function in auth.service.ts",
            "context": {
              "application": "VS Code",
              "file": "auth.service.ts",
              "function": "authenticateUser",
              "activity_type": "coding",
              "language": "TypeScript"
            }
          }
        },
        {
          "frame_id": "frame_0002",
          "filename": "frames/frame_0002.png",
          "window_source_id": "window:456",
          "hash": "sha256:def456",
          "analysis": {
            "summary": "User viewing Linear ticket LIN-341: Add JWT authentication",
            "context": {
              "application": "Chrome",
              "website": "linear.app",
              "ticket_id": "LIN-341",
              "ticket_title": "Add JWT authentication",
              "activity_type": "task_tracking"
            }
          }
        }
      ],
      "group_correlation": {
        "related": true,
        "relationship": "User implementing LIN-341 (JWT auth) in auth.service.ts",
        "confidence": "high"
      }
    },
    {
      "group_id": "grp_002",
      "timestamp": "2025-12-18T10:00:20.000Z",
      "frames": [
        {
          "frame_id": "frame_0003",
          "filename": "frames/frame_0003.png",
          "window_source_id": "window:123",
          "hash": "sha256:abc123",
          "skipped": true,
          "skip_reason": "duplicate_hash"
        },
        {
          "frame_id": "frame_0004",
          "filename": "frames/frame_0004.png",
          "window_source_id": "window:456",
          "hash": "sha256:ghi789",
          "analysis": {
            "summary": "User watching YouTube video about Node.js authentication patterns",
            "context": {
              "application": "Chrome",
              "website": "youtube.com",
              "video_title": "JWT Auth Best Practices in Node.js",
              "activity_type": "learning"
            }
          }
        }
      ],
      "group_correlation": {
        "related": true,
        "relationship": "User researching JWT patterns relevant to current coding task",
        "confidence": "medium"
      }
    },
    {
      "group_id": "grp_003",
      "timestamp": "2025-12-18T10:05:30.000Z",
      "frames": [
        {
          "frame_id": "frame_0005",
          "filename": "frames/frame_0005.png",
          "window_source_id": "window:123",
          "hash": "sha256:jkl012",
          "analysis": {
            "summary": "User writing unit tests for authenticateUser function",
            "context": {
              "application": "VS Code",
              "file": "auth.service.test.ts",
              "activity_type": "testing"
            }
          }
        },
        {
          "frame_id": "frame_0006",
          "filename": "frames/frame_0006.png",
          "window_source_id": "window:456",
          "hash": "sha256:mno345",
          "analysis": {
            "summary": "User browsing unrelated YouTube video (music)",
            "context": {
              "application": "Chrome",
              "website": "youtube.com",
              "video_title": "Lo-fi beats to code to",
              "activity_type": "background_media"
            }
          }
        }
      ],
      "group_correlation": {
        "related": false,
        "relationship": null,
        "note": "Chrome window showing background music, not work-related"
      }
    }
  ],

  "chunk_summary": {
    "generated_at": "2025-12-18T11:15:05.000Z",
    "narrative": "First chunk: Aurel focused on implementing JWT authentication for ticket LIN-341. Work included editing auth.service.ts, researching best practices via YouTube tutorial, and writing unit tests. Chrome was used for task tracking (Linear) and research, with some background music.",
    "key_activities": ["coding", "testing", "research", "task_tracking"],
    "tickets_touched": ["LIN-341"],
    "files_touched": ["auth.service.ts", "auth.service.test.ts"]
  }
}
```

### Schema Design Principles

| Principle           | Implementation                                                  |
| ------------------- | --------------------------------------------------------------- |
| **Fixed fields**    | `frame_id`, `filename`, `timestamp`, `hash`, `window_source_id` |
| **Dynamic fields**  | `analysis.context` is AI-generated based on what's visible      |
| **Capture groups**  | Frames at same timestamp grouped for correlation                |
| **User context**    | Fetched at summary time (session end), not stored in manifest   |
| **Chunk summaries** | Generated when manifest reaches 300 groups or session ends      |
| **Future-proof**    | Format supports tool call enrichment in Phase 3                 |

---

## 3. Constraints & Limits

| Constraint                      | Value            | Rationale                                               |
| ------------------------------- | ---------------- | ------------------------------------------------------- |
| **Max watched windows**         | 5                | Simple UX, manageable correlation                       |
| **Capture groups per manifest** | 300              | ~50-80 min of active work, keeps LLM context manageable |
| **Correlation**                 | Skip if 1 window | No wasted compute for single-window sessions            |
| **Min capture interval**        | 10 seconds       | Balance between detail and storage/cost                 |

### Manifest Splitting Logic

```typescript
const MAX_CAPTURE_GROUPS_PER_MANIFEST = 300;

function shouldSplitManifest(currentManifest: Manifest): boolean {
  return currentManifest.capture_groups.length >= MAX_CAPTURE_GROUPS_PER_MANIFEST;
}

// When split occurs:
// 1. Generate chunk_summary for current manifest
// 2. Create new manifest_00X.json
// 3. Continue capturing into new manifest
```

---

## 4. Data Flow

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SESSION START                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  1. User clicks "Start Session" in Electron                              │
│  2. User selects windows to watch (max 5)                                │
│  3. Frontend sends: POST /api/monitoring/sessions                        │
│  4. Backend:                                                             │
│     a. Creates session row in DB (id, user, org, status, storage_path) │
│     b. Creates storage folder in Supabase Storage                       │
│     c. Returns session_id to frontend                                   │
│     (NOTE: User context fetched at summary time, NOT here)              │
│  5. Electron starts capture loop                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAPTURE LOOP ( at least every 10s)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  For each watched window:                                                │
│  1. Electron captures screenshot                                         │
│  2. Compute SHA-256 hash                                                │
│  3. If hash == previous hash for this window → skip (duplicate)         │
│  4. Else → POST /api/monitoring/sessions/:id/frame                      │
│     Body: { base64_image, window_source_id, timestamp, hash }           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKEND: Process Frame                                │
├─────────────────────────────────────────────────────────────────────────┤
│  POST /api/monitoring/sessions/:id/frame                                 │
│                                                                          │
│  STEP 1 - Parallel:                                                      │
│  ┌──────────────────────┐    ┌──────────────────────┐                   │
│  │ Upload PNG to        │    │ Groq Vision          │                   │
│  │ Supabase Storage     │    │ Llama 4 Scout        │                   │
│  │                      │    │ → quick_summary      │                   │
│  └──────────────────────┘    └──────────────────────┘                   │
│            │                           │                                 │
│            └───────────┬───────────────┘                                 │
│                        ▼                                                 │
│  STEP 2 - Sequential (after Groq returns):                              │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │ INSERT frame row into session_frames table (event log)   │           │
│  │ - Store: frame_id, storage_path, quick_summary,          │           │
│  │          activity_type, application, analysis_context    │           │
│  │ - Calculate importance_score based on content            │           │
│  └──────────────────────────────────────────────────────────┘           │
│                        │                                                 │
│                        ▼                                                 │
│  STEP 3 - If multi-window, compute group correlation:                   │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │ Send all images in group to Groq Vision                  │           │
│  │ INSERT correlation into session_group_correlations       │           │
│  └──────────────────────────────────────────────────────────┘           │
│                        │                                                 │
│                        ▼                                                 │
│  Return: { success, frame_id, analysis, group_correlation }             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    MID-SESSION UPDATE (optional)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  User clicks "Send Update" in PillView while session is still active    │
│  (Uses existing endpoint: POST /api/monitoring/sessions/:id/deliver)    │
│                                                                          │
│  1. Frontend triggers summary generation first (if needed)              │
│  2. Backend (async):                                                     │
│     a. Query all session_frames captured so far                         │
│     b. Generate manifest from current frames                            │
│     c. Fetch fresh user context (GitHub/Linear)                         │
│     d. Generate interim summary with Gemini                             │
│     e. Store as rawActivitySummary/finalSummary in DB                   │
│  3. Frontend calls existing /deliver endpoint                           │
│     a. Select important frames for Slack                                │
│     b. Send to Slack with "Session in progress" indicator               │
│  4. Session continues — capture loop keeps running                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SESSION END                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  1. User clicks "End Session"                                            │
│  2. Frontend sends: POST /api/monitoring/sessions/:id/end                │
│  3. Backend:                                                             │
│     a. Generate chunk_summary for current manifest (if not empty)       │
│     b. Mark current manifest as is_final: true                          │
│     c. Update DB session status = "summarizing"                         │
│     d. Trigger async final summary generation with Gemini 3.5 Pro       │
│     e. Return immediately to frontend                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FINAL SUMMARY (async)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Fetch user context NOW (GitHub commits/PRs, Linear tickets)         │
│  2. Generate manifests from DB (session_frames + correlations)          │
│  3. Generate chunk summaries for each manifest chunk                    │
│  4. Call Gemini 3.5 Pro with:                                           │
│     - Fresh user context                                                │
│     - All chunk summaries                                               │
│     - System prompt for structured output                               │
│  5. Select important frames (by importance_score) for exports           │
│  6. Store final summary + important_frame_ids in DB                     │
│  7. Update DB session status = "ready"                                  │
│  8. Send to Slack with important screenshots                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. AI Prompts

### Quick Summary (Groq Llama 4 Scout) — Per Frame

```
You are analyzing a screenshot from a work monitoring session.

Return JSON with these fields:

1. "summary": 1-3 sentence description of what the user is doing
2. "context": an object with metadata visible in the screenshot

**REQUIRED fields in context (always include):**
- "application": The app name (VS Code, Chrome, Slack, etc.)
- "activity_type": One of: coding, research, communication, task_tracking, learning, testing, debugging, documentation, background_media, other

**OPTIONAL fields (include when visible):**
- For code editors: file, function, class, language, project
- For browsers: website, page_title, url_path
- For task trackers: ticket_id, ticket_title, status, priority
- For communication: channel, thread_topic, participants
- Any other relevant context: nest under "extra"

**IMPORTANCE scoring (include when applicable):**
- "importance": 0.0-1.0 score
- "importance_reason": Why this frame is important (e.g., "ticket mention", "error visible", "PR review", "test results")

Be specific and factual. Do not speculate beyond what's visible.

Example output for VS Code:
{
  "summary": "User editing authenticateUser function, adding JWT validation logic",
  "context": {
    "application": "VS Code",
    "file": "auth.service.ts",
    "function": "authenticateUser",
    "language": "TypeScript",
    "activity_type": "coding"
  }
}

Example output for Linear:
{
  "summary": "User viewing ticket LIN-341, checking acceptance criteria",
  "context": {
    "application": "Chrome",
    "website": "linear.app",
    "ticket_id": "LIN-341",
    "ticket_title": "Add JWT authentication",
    "status": "In Progress",
    "activity_type": "task_tracking"
  }
}

Example output for YouTube (work-related):
{
  "summary": "User watching tutorial on JWT authentication patterns",
  "context": {
    "application": "Chrome",
    "website": "youtube.com",
    "video_title": "JWT Auth Best Practices",
    "activity_type": "learning"
  }
}

Example output for YouTube (not work-related):
{
  "summary": "User playing background music",
  "context": {
    "application": "Chrome",
    "website": "youtube.com",
    "video_title": "Lo-fi beats",
    "activity_type": "background_media"
  }
}
```

### Group Correlation (Groq Llama 4 Scout Vision) — Per Capture Group (skip if single window)

This uses the **same vision model** as the quick summary, but sends **all images in the group** together. This is more robust than using text summaries because the model can see the actual screenshots and make better correlation judgments.

```
You are analyzing multiple screenshots captured at the same moment from different windows in a work monitoring session.

[IMAGE 1: First window screenshot]
[IMAGE 2: Second window screenshot]
[...additional images if more windows...]

These screenshots were taken simultaneously. Analyze whether the activities shown are related to the same work task.

Return JSON:
{
  "related": true/false,
  "relationship": "description of how they relate" or null,
  "confidence": "high/medium/low"
}

Guidelines:
- Code editor showing auth.service.ts + Browser showing Linear ticket "Add auth" → related
- Code editor showing code + YouTube showing music video → NOT related
- Code editor showing code + YouTube showing coding tutorial on same topic → related
- Slack discussion about a feature + code implementing that feature → related
- If one window shows background media (music, unrelated video), mark as NOT related

Be specific in the relationship description. Reference what you see in each screenshot.
```

### Chunk Summary (Groq qwen-qwq-32b OR meta-llama/llama-4-scout-17b-16e-instruct) — When Manifest Reaches 300 Groups

Use a capable reasoning model for chunk summaries since this aggregates many capture groups.

```
You are summarizing a chunk of a work session.

USER CONTEXT:
{manifest.user_context}

CAPTURE GROUPS IN THIS CHUNK:
{manifest.capture_groups.map(g => ({
  timestamp: g.timestamp,
  activities: g.frames.map(f => f.analysis?.summary).filter(Boolean),
  correlation: g.group_correlation
}))}

Generate a brief summary of this chunk:
{
  "narrative": "2-3 sentence summary of what happened in this time period",
  "key_activities": ["coding", "testing", etc.],
  "tickets_touched": ["LIN-XXX", ...],
  "files_touched": ["file.ts", ...]
}

Filter out background media and unrelated browsing unless it was relevant to work.
```

### Final Summary (Gemini 3.5 Pro) — At Session End

```
You are generating a work session summary.

USER CONTEXT:
{user_context}

SESSION INFO:
- Duration: {total_duration}
- Windows watched: {watched_windows}
- Total chunks: {chunk_count}

CHUNK SUMMARIES:
{chunks.map(c => ({
  chunk: c.chunk_index,
  time_range: c.chunk_range,
  summary: c.chunk_summary
}))}

INSTRUCTIONS:
1. Synthesize what the user accomplished during this entire session
2. Correlate activities with their tickets (Linear) and code (GitHub)
3. Identify what's done vs in-progress
4. Be specific about files, tickets, and PRs when mentioned
5. Filter out distractions unless they were relevant (e.g., research videos)

Return JSON:
{
  "narrative": "2-3 paragraph summary of the entire session",
  "structured": {
    "workstreams": [
      {
        "title": "descriptive title",
        "ticket": "LIN-XXX" or null,
        "pr": 234 or null,
        "files": ["file1.ts", "file2.ts"],
        "status": "done" or "in_progress",
        "activities": ["activity 1", "activity 2"]
      }
    ],
    "files_touched": ["all files worked on"],
    "tickets_impacted": ["all ticket IDs"],
    "time_breakdown": {
      "coding": "X min",
      "research": "X min",
      "communication": "X min",
      "testing": "X min"
    },
    "suggested_next_steps": ["suggestion 1", "suggestion 2"]
  }
}
```

---

## 6. API Changes

### New Endpoints

| Endpoint                         | Method | Purpose                                 |
| -------------------------------- | ------ | --------------------------------------- |
| `/sessions/:id/frame`            | POST   | Upload single frame + get quick summary |
| `/sessions/:id/manifests`        | GET    | List all manifest chunks for a session  |
| `/sessions/:id/manifests/:chunk` | GET    | Download specific manifest chunk        |

### Modified Endpoints

| Endpoint                 | Changes                                           |
| ------------------------ | ------------------------------------------------- |
| `POST /sessions`         | Creates session row in DB, creates storage folder |
| `POST /sessions/:id/end` | Finalizes manifest, triggers async summary        |
| `DELETE /sessions/:id`   | Deletes Storage folder + DB row                   |

### Request/Response: `POST /sessions/:id/frame`

```typescript
// Request
{
  image: string;              // base64 PNG
  window_source_id: string;   // which watched window
  timestamp: string;          // ISO timestamp
  hash: string;               // SHA-256
  trigger: "periodic" | "focus_change" | "manual";
}

// Response
{
  success: boolean;
  frame_id: string;
  analysis: {
    summary: string;
    context: Record<string, any>;  // Dynamic schema from Groq
  };
  skipped?: boolean;              // If duplicate hash
  group_correlation?: {           // If other frames at same timestamp (multi-window)
    related: boolean;
    relationship: string | null;
    confidence: "high" | "medium" | "low";
  };
  manifest_split?: boolean;       // True if this frame triggered a new manifest chunk
}
```

---

## 7. Database Changes

### Simplified Schema

DB serves as the **append-only event log** for reliability. Manifest is a **derived view** generated from DB data.

```sql
-- Sessions table (lifecycle tracking)
CREATE TABLE monitoring_sessions (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'active',  -- active, paused, summarizing, ready
  storage_path TEXT NOT NULL,           -- e.g., "org_123/user_456/sess_789"
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Frames table (EVENT LOG - append-only, lightweight)
-- This is the source of truth for frame data. Manifest is derived from this.
CREATE TABLE session_frames (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  frame_id VARCHAR(50) NOT NULL,        -- e.g., "frame_0001"
  group_id VARCHAR(50) NOT NULL,        -- e.g., "grp_001" (frames at same timestamp)
  storage_path TEXT NOT NULL,           -- e.g., "frames/frame_0001.png"
  window_source_id VARCHAR(100) NOT NULL,
  hash VARCHAR(64) NOT NULL,            -- SHA-256 for dedup
  timestamp TIMESTAMPTZ NOT NULL,
  trigger VARCHAR(20) NOT NULL,         -- periodic, focus_change, manual
  is_skipped BOOLEAN DEFAULT FALSE,
  skip_reason VARCHAR(50),

  -- Analysis results (from Groq vision)
  quick_summary TEXT,
  activity_type VARCHAR(50),            -- REQUIRED: coding, research, communication, etc.
  application VARCHAR(100),             -- REQUIRED: VS Code, Chrome, Slack, etc.
  analysis_context JSONB,               -- Dynamic context (file, ticket_id, url, etc.)

  -- Importance flag for smart screenshot selection
  importance_score FLOAT DEFAULT 0,     -- 0-1, higher = more important for exports
  importance_reason TEXT,               -- e.g., "ticket mention", "error screen", "PR page"

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group correlations (for multi-window sessions)
CREATE TABLE session_group_correlations (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  group_id VARCHAR(50) NOT NULL,
  related BOOLEAN NOT NULL,
  relationship TEXT,
  confidence VARCHAR(10),               -- high, medium, low
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Final summary
CREATE TABLE session_summaries (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  narrative TEXT,
  structured JSONB,
  important_frame_ids TEXT[],           -- Frame IDs selected for Slack/exports
  generated_at TIMESTAMPTZ,
  model VARCHAR(50)
);

-- Indexes for common queries
CREATE INDEX idx_frames_session ON session_frames(session_id);
CREATE INDEX idx_frames_group ON session_frames(session_id, group_id);
CREATE INDEX idx_frames_importance ON session_frames(session_id, importance_score DESC);
```

### Manifest Generation

Manifest is a **derived view**, generated on demand from DB:

```typescript
async function generateManifest(sessionId: string, chunkIndex: number): Promise<Manifest> {
  // Get distinct group_ids for this chunk (300 groups per chunk)
  // Page by group, not by raw frame count, to ensure consistent chunk boundaries
  const groups = await db.query(
    `
    SELECT DISTINCT group_id 
    FROM session_frames 
    WHERE session_id = $1 
    ORDER BY group_id
    LIMIT 300
    OFFSET $2
  `,
    [sessionId, (chunkIndex - 1) * 300]
  );

  const groupIds = groups.map((g) => g.group_id);

  // Query all frames for these groups
  const frames = await db.query(
    `
    SELECT * FROM session_frames 
    WHERE session_id = $1 AND group_id = ANY($2)
    ORDER BY timestamp, frame_id
  `,
    [sessionId, groupIds]
  );

  // Query correlations for these groups
  const correlations = await db.query(
    `
    SELECT * FROM session_group_correlations
    WHERE session_id = $1 AND group_id = ANY($2)
  `,
    [sessionId, groupIds]
  );

  // Build manifest structure
  return buildManifestFromFrames(frames, correlations);
}
```

### Migration Path

1. New sessions use DB event log + Storage for images
2. Manifest generated on demand (or cached at chunk boundaries)
3. Old sessions continue working (read from existing DB schema)
4. Eventually migrate old data or let it age out

---

## 8. Implementation Plan

### Phase 1: Storage Migration (2 days)

| Task                                              | Effort |
| ------------------------------------------------- | ------ |
| Create Supabase Storage bucket `mitable-sessions` | 0.5h   |
| Add Supabase Storage service to backend           | 2h     |
| Modify session start to create manifest_001.json  | 2h     |
| Modify frame upload to store PNG in Storage       | 3h     |
| Implement manifest update logic                   | 2h     |
| Modify session end to finalize manifest           | 2h     |
| Update delete to remove Storage folder            | 1h     |
| Testing                                           | 3h     |

### Phase 2: Incremental Analysis (1.5 days)

| Task                                                 | Effort |
| ---------------------------------------------------- | ------ |
| Add Groq SDK and Llama 4 Scout integration           | 2h     |
| Implement quick summary per frame                    | 2h     |
| Implement group correlation (skip for single window) | 2h     |
| Implement manifest splitting at 300 groups           | 2h     |
| Implement chunk summary generation                   | 2h     |
| Testing                                              | 2h     |

### Phase 3: User Context (0.5 days)

| Task                                                   | Effort |
| ------------------------------------------------------ | ------ |
| Fetch GitHub commits/PRs at session END (summary time) | 2h     |
| Fetch Linear tickets at session END                    | 1h     |
| Pass to final summarizer (not stored in manifest)      | 1h     |

### Phase 4: Final Summary (1 day)

| Task                                              | Effort |
| ------------------------------------------------- | ------ |
| Update final summary to read from manifest chunks | 2h     |
| Aggregate chunk summaries for long sessions       | 2h     |
| Generate structured output with GPT-4o/Gemini     | 2h     |
| Update Slack delivery with new format             | 1h     |
| Testing                                           | 1h     |

### Phase 5: UI Updates (0.5 days)

| Task                                            | Effort |
| ----------------------------------------------- | ------ |
| Cap window selection at 5 in StartSessionDialog | 1h     |
| Show manifest chunk count in session detail     | 1h     |
| Update session card with new summary format     | 2h     |

**Total: ~6 days**

---

## 9. Cost Analysis

### Per-Session Costs (1 hour, 5 windows, 50% dedup)

| Component                      | Calculation                  | Cost       |
| ------------------------------ | ---------------------------- | ---------- |
| Groq Llama 4 (quick summary)   | 180 frames × $0.00002        | ~$0.004    |
| Groq text (correlation)        | 90 groups × $0.000005        | ~$0.0005   |
| Groq (chunk summary)           | 1 chunk × $0.001             | ~$0.001    |
| Gemini 3.5 pro (final summary) | 1 call × ~$0.02              | ~$0.02     |
| Supabase Storage               | 180 frames × 1MB × $0.021/GB | ~$0.004    |
| **Total per 1-hour session**   |                              | **~$0.03** |

### Monthly Estimate

| Usage                 | Cost  |
| --------------------- | ----- |
| 100 sessions/month    | ~$3   |
| 1,000 sessions/month  | ~$30  |
| 10,000 sessions/month | ~$300 |

---

## 10. Why This Architecture

### Current Problems Solved

| Problem                       | Solution                             |
| ----------------------------- | ------------------------------------ |
| DB bloat from base64 images   | Images in Supabase Storage           |
| Weak summaries (no context)   | User context + incremental analysis  |
| All analysis at session end   | Quick summaries during capture       |
| No multi-window understanding | Capture groups with correlation      |
| Generic output                | Structured JSON with workstreams     |
| Fragile cleanup (setTimeout)  | Storage lifecycle management         |
| Long sessions overwhelm LLM   | Manifest chunking with pre-summaries |

### Future Capabilities Unlocked

| Feature              | How Manifest Enables It                             |
| -------------------- | --------------------------------------------------- |
| Tool call enrichment | user_context has PR numbers, ticket IDs for queries |
| Session export       | manifest.json is portable, self-contained           |
| Analytics            | Queryable structured data per chunk                 |
| Custom integrations  | Standard format for any consumer                    |
| Replay/timeline view | Ordered frames with timestamps and summaries        |

---

## 11. Risk Mitigation

| Risk                               | Mitigation                                       |
| ---------------------------------- | ------------------------------------------------ |
| Groq rate limits                   | Implement exponential backoff, queue frames      |
| Storage costs grow                 | Set retention policy (delete after 30 days)      |
| Manifest corruption mid-write      | Atomic writes via temp file + rename             |
| Migration breaks existing sessions | Feature flag, run parallel with old system       |
| User forgets session running       | Auto-pause after 4 hours of no new unique frames |

---

## 12. Example: Long Session (4 hours, 3 windows)

```
Session: sess_abc123
Duration: 4 hours
Windows: VS Code, Chrome, Slack

Storage structure:
org_123/user_456/sess_abc123/
  manifest_001.json  (300 groups, ~80 min, chunk_summary ✓)
  manifest_002.json  (300 groups, ~75 min, chunk_summary ✓)
  manifest_003.json  (180 groups, ~65 min, is_final: true, chunk_summary ✓)
  frames/
    frame_0001.png ... frame_2340.png

Final summary input:
- user_context (GitHub, Linear)
- chunk_summary from manifest_001
- chunk_summary from manifest_002
- chunk_summary from manifest_003

Final summary output:
- Aggregated narrative across all 4 hours
- Unified workstreams, files, tickets
- Time breakdown for entire session
```

---

## Appendix: Correlation Skip Logic

```typescript
async function processFrameGroup(
  sessionId: string,
  frames: ProcessedFrame[],
  manifest: Manifest
): Promise<GroupCorrelation | null> {
  // Skip correlation for single-window sessions
  if (manifest.watched_windows.length === 1) {
    return null;
  }

  // Skip if only one frame in this group (others were duplicates)
  const nonSkippedFrames = frames.filter((f) => !f.skipped);
  if (nonSkippedFrames.length <= 1) {
    return null;
  }

  // Compute correlation
  return await computeGroupCorrelation(nonSkippedFrames);
}
```
