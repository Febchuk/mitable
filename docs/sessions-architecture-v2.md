# Sessions Architecture v2 — Complete System Design

## Executive Summary

This document outlines the improved architecture for Watch Mode sessions. The key changes are:

1. **Local-First Storage**: Screenshots stored locally during capture, only Top-K important frames uploaded for summaries/exports
2. **DB as Event Log**: Lightweight frame metadata in DB (no images), manifest generated as derived view
3. **Incremental Analysis**: Use Groq Llama 4 vision for per-frame quick summaries during capture
4. **Delta Detection**: Track changes between consecutive frames to identify actual user actions vs passive viewing
5. **Per-Window Correlation**: Each window tagged with on-task/off-task status (not binary group-level)
6. **User Context**: Inject GitHub commits, PRs, and Linear tickets at summary time (not session start)
7. **Dynamic Schema**: AI extracts context with required guardrails (`application`, `activity_type`)
8. **Smart Screenshot Selection**: Importance scoring + Top-K selection for exports (algorithm defined below)

---

## 1. Storage Architecture

### Local-First Approach

Screenshots are stored **locally** during capture and used **ephemerally** for AI analysis. Only the Top-K important frames are uploaded to cloud storage for summaries and exports.

**Rationale**: A 1-hour session with 5 windows captures ~180-360 frames. We only need <10 frames for context in summaries/exports. Uploading all frames wastes bandwidth, storage costs, and provides no value.

### Local Storage Structure (During Capture)

```
~/Library/Application Support/Mitable/sessions/
  {session_id}/
    frames/
      frame_0001.png      ← Ephemeral, deleted after summary
      frame_0002.png
      ...
    metadata.json         ← Frame metadata for importance ranking
```

### Cloud Storage Structure (Top-K Only)

```
Bucket: mitable-sessions (single bucket, private)

Path structure:
{org_id}/
  {user_id}/
    {session_id}/
      summary.json              ← Final summary with embedded frame refs
      important_frames/
        frame_0042.png          ← Top-K selected frames only
        frame_0089.png
        frame_0156.png
        ...
```

### Why This Structure

| Decision                | Rationale                                      |
| ----------------------- | ---------------------------------------------- |
| Local-first             | 100s of frames captured, <10 needed for output |
| Ephemeral local storage | Auto-deleted after session summary generated   |
| Top-K upload only       | Reduces storage costs by 95%+, faster exports  |
| Private bucket          | Backend uses service key, no public access     |

### Lifecycle

| Event                      | Action                                                  |
| -------------------------- | ------------------------------------------------------- |
| Session starts             | Create session row in DB, create local folder           |
| Frame captured             | Save PNG locally, INSERT frame metadata in DB           |
| Frame analyzed             | Update importance_score in DB                           |
| 300 capture groups reached | Generate chunk summary (text only)                      |
| Session ends               | Run Top-K selection, upload important frames to Storage |
| Summary delivered          | Delete local frames folder                              |
| Session deleted            | Delete cloud `{session}/` folder                        |

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
            "delta": {
              "changed": true,
              "change_type": "content_edit",
              "change_description": "Added 3 new lines of JWT validation logic",
              "user_action": "typing"
            },
            "context": {
              "application": "VS Code",
              "file": "auth.service.ts",
              "function": "authenticateUser",
              "activity_type": "coding",
              "language": "TypeScript"
            },
            "on_task": true,
            "task_relevance": "Implementing JWT auth for LIN-341"
          },
          "importance_score": 0.85,
          "importance_reason": "Active code editing with visible changes"
        },
        {
          "frame_id": "frame_0002",
          "filename": "frames/frame_0002.png",
          "window_source_id": "window:456",
          "hash": "sha256:def456",
          "analysis": {
            "summary": "User viewing Linear ticket LIN-341: Add JWT authentication",
            "delta": {
              "changed": false,
              "change_type": "none",
              "change_description": "Same ticket view as previous frame",
              "user_action": "viewing"
            },
            "context": {
              "application": "Chrome",
              "website": "linear.app",
              "ticket_id": "LIN-341",
              "ticket_title": "Add JWT authentication",
              "activity_type": "task_tracking"
            },
            "on_task": true,
            "task_relevance": "Reference ticket for current work"
          },
          "importance_score": 0.6,
          "importance_reason": "Ticket context for work"
        }
      ]
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
            "delta": {
              "changed": true,
              "change_type": "navigation",
              "change_description": "Navigated from Linear to YouTube tutorial",
              "user_action": "browsing"
            },
            "context": {
              "application": "Chrome",
              "website": "youtube.com",
              "video_title": "JWT Auth Best Practices in Node.js",
              "activity_type": "learning"
            },
            "on_task": true,
            "task_relevance": "Learning video related to JWT implementation"
          },
          "importance_score": 0.5,
          "importance_reason": "Research related to current task"
        }
      ]
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
            "delta": {
              "changed": true,
              "change_type": "file_switch",
              "change_description": "Switched from auth.service.ts to auth.service.test.ts, added test case",
              "user_action": "typing"
            },
            "context": {
              "application": "VS Code",
              "file": "auth.service.test.ts",
              "activity_type": "testing"
            },
            "on_task": true,
            "task_relevance": "Writing tests for JWT auth"
          },
          "importance_score": 0.9,
          "importance_reason": "Test file creation - milestone"
        },
        {
          "frame_id": "frame_0006",
          "filename": "frames/frame_0006.png",
          "window_source_id": "window:456",
          "hash": "sha256:mno345",
          "analysis": {
            "summary": "User playing background music",
            "delta": {
              "changed": true,
              "change_type": "navigation",
              "change_description": "Navigated from tutorial to music video",
              "user_action": "browsing"
            },
            "context": {
              "application": "Chrome",
              "website": "youtube.com",
              "video_title": "Lo-fi beats to code to",
              "activity_type": "background_media"
            },
            "on_task": false,
            "task_relevance": null
          },
          "importance_score": 0.1,
          "importance_reason": "Background media, not work-related"
        }
      ]
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

| Principle                  | Implementation                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ |
| **Fixed fields**           | `frame_id`, `filename`, `timestamp`, `hash`, `window_source_id`                |
| **Delta tracking**         | `analysis.delta` captures what CHANGED between frames, not just what's visible |
| **Per-window correlation** | `on_task` and `task_relevance` per frame, not binary group-level               |
| **Dynamic context**        | `analysis.context` is AI-generated based on what's visible                     |
| **Importance scoring**     | `importance_score` (0-1) + `importance_reason` for Top-K selection             |
| **User context**           | Fetched at summary time (session end), not stored in manifest                  |
| **Chunk summaries**        | Generated when manifest reaches 300 groups or session ends                     |

### Per-Window Correlation (Not Group-Level)

**Problem with group-level correlation**: In a 3-window group where VS Code and Linear are on-task but YouTube is playing music, a single `related: true/false` is ambiguous.

**Solution**: Each frame has its own `on_task` flag and `task_relevance` description:

```json
{
  "frames": [
    { "window": "VS Code", "on_task": true, "task_relevance": "Editing auth code" },
    { "window": "Linear", "on_task": true, "task_relevance": "Reference ticket" },
    { "window": "YouTube", "on_task": false, "task_relevance": null }
  ]
}
```

This allows the summary to accurately say: "2 of 3 windows were on-task" and filter appropriately.

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

## 4. Top-K Frame Selection Algorithm

At session end, we select the most important frames for upload and inclusion in exports. This reduces storage by 95%+ while preserving the most valuable visual context.

### Ranking Formula

```typescript
interface FrameScore {
  frame_id: string;
  final_score: number; // 0-1, higher = more important
}

function calculateFinalScore(frame: Frame): number {
  // Base score from Groq analysis (0-1)
  let score = frame.importance_score;

  // Boost for actual user actions (not just viewing)
  if (frame.delta.user_action === "typing") score += 0.15;
  if (frame.delta.user_action === "clicking") score += 0.1;

  // Boost for meaningful changes
  if (frame.delta.change_type === "content_edit") score += 0.2;
  if (frame.delta.change_type === "file_switch") score += 0.1;

  // Boost for milestone indicators
  if (frame.importance_reason?.includes("test")) score += 0.15;
  if (frame.importance_reason?.includes("error")) score += 0.2;
  if (frame.importance_reason?.includes("PR")) score += 0.2;
  if (frame.importance_reason?.includes("commit")) score += 0.15;
  if (frame.importance_reason?.includes("ticket")) score += 0.1;

  // Penalize off-task frames
  if (!frame.on_task) score *= 0.3;

  // Penalize duplicate content (same file, same function)
  if (frame.is_similar_to_previous) score *= 0.5;

  return Math.min(score, 1.0); // Cap at 1.0
}
```

### Selection Process

```typescript
const K = 10; // Max frames to upload

function selectTopKFrames(session: Session): Frame[] {
  const allFrames = session.frames.filter((f) => !f.skipped);
  const sessionDuration = session.ended_at - session.started_at;

  // TEMPORAL DIVERSITY: Divide session into time buckets
  // This prevents a burst of activity in first 10 minutes from dominating all slots
  const BUCKET_DURATION_MS = 15 * 60 * 1000; // 15-minute buckets
  const bucketCount = Math.max(1, Math.ceil(sessionDuration / BUCKET_DURATION_MS));
  const framesPerBucket = Math.ceil(K / bucketCount);

  // Partition frames into time buckets
  const buckets = partitionByTime(allFrames, bucketCount, session.started_at, session.ended_at);

  const selected: Frame[] = [];
  const seenContexts = new Map<string, number>();

  // Select top frames from each bucket
  for (const bucket of buckets) {
    // Score frames in this bucket
    const scored = bucket
      .map((f) => ({
        frame: f,
        score: calculateFinalScore(f),
      }))
      .sort((a, b) => b.score - a.score);

    let selectedFromBucket = 0;

    for (const { frame, score } of scored) {
      if (selectedFromBucket >= framesPerBucket) break;
      if (selected.length >= K) break;

      // Context diversity: max 2 frames of same file/website across entire session
      const contextKey = `${frame.context.application}:${frame.context.file || frame.context.website}`;
      const contextCount = seenContexts.get(contextKey) || 0;
      if (contextCount >= 2) continue;

      selected.push(frame);
      seenContexts.set(contextKey, contextCount + 1);
      selectedFromBucket++;
    }
  }

  // If we have spare slots (sparse buckets), fill from highest-scoring remaining
  if (selected.length < K) {
    const selectedIds = new Set(selected.map((f) => f.frame_id));
    const remaining = allFrames
      .filter((f) => !selectedIds.has(f.frame_id))
      .map((f) => ({ frame: f, score: calculateFinalScore(f) }))
      .sort((a, b) => b.score - a.score);

    for (const { frame } of remaining) {
      if (selected.length >= K) break;

      const contextKey = `${frame.context.application}:${frame.context.file || frame.context.website}`;
      const contextCount = seenContexts.get(contextKey) || 0;
      if (contextCount >= 2) continue;

      selected.push(frame);
      seenContexts.set(contextKey, contextCount + 1);
    }
  }

  // Sort by timestamp for chronological order in exports
  return selected.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function partitionByTime(
  frames: Frame[],
  bucketCount: number,
  startTime: number,
  endTime: number
): Frame[][] {
  const bucketDuration = (endTime - startTime) / bucketCount;
  const buckets: Frame[][] = Array.from({ length: bucketCount }, () => []);

  for (const frame of frames) {
    const frameTime = new Date(frame.timestamp).getTime();
    const bucketIndex = Math.min(
      bucketCount - 1,
      Math.floor((frameTime - startTime) / bucketDuration)
    );
    buckets[bucketIndex].push(frame);
  }

  return buckets;
}
```

### Diversity Guarantees

| Type         | Constraint                          | Rationale                                 |
| ------------ | ----------------------------------- | ----------------------------------------- |
| **Temporal** | Frames spread across 15-min buckets | Prevents burst activity from dominating   |
| **Context**  | Max 2 frames per file/website       | Ensures variety in visual output          |
| **Fallback** | Fill remaining slots by score       | Doesn't waste slots if buckets are sparse |

### What Qualifies as "Important"

| Signal               | Score Boost | Rationale                           |
| -------------------- | ----------- | ----------------------------------- |
| Active typing        | +0.15       | User is producing, not just viewing |
| Content edit visible | +0.20       | Actual code/doc change happened     |
| File switch          | +0.10       | Context change, likely new task     |
| Test file            | +0.15       | Milestone: testing work             |
| Error visible        | +0.20       | Debugging moment, diagnostic value  |
| PR/commit visible    | +0.20       | Milestone: code shipping            |
| Ticket visible       | +0.10       | Task context                        |
| Off-task             | ×0.30       | Heavily penalize background media   |

### Fallback: Ask Groq

If the scoring algorithm produces <K frames with score >0.5, we ask Groq to select:

```
You have {N} frames from a work session. Select the {K} most important frames to include in a summary.

Prioritize:
1. Frames showing completed work (commits, PRs, test passes)
2. Frames showing active editing (code changes visible)
3. Frames showing context (tickets, docs being referenced)

Avoid:
- Duplicate/similar frames
- Background media
- Static views with no changes

Return JSON array of frame_ids in chronological order.
```

---

## 5. Data Flow

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SESSION START                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  1. User clicks "Start Session" in Electron                              │
│  2. User selects windows to watch (max 5)                                │
│  3. User optionally sets session goal (improves on_task accuracy):      │
│     ┌──────────────────────────────────────────────────────┐            │
│     │ What are you working on? (optional)                  │            │
│     │ ┌──────────────────────────────────────────────────┐ │            │
│     │ │ Working on LIN-341: Add JWT authentication       │ │            │
│     │ └──────────────────────────────────────────────────┘ │            │
│     │ [Auto-detect from Linear] [Skip]                     │            │
│     └──────────────────────────────────────────────────────┘            │
│  4. Frontend sends: POST /api/monitoring/sessions                        │
│     Body: { watched_windows, session_goal? }                             │
│  5. Backend:                                                             │
│     a. Creates session row in DB (id, user, org, status, session_goal) │
│     b. Creates local storage folder path                                │
│     c. Returns session_id to frontend                                   │
│     (NOTE: User context fetched at summary time, NOT here)              │
│  6. Electron starts capture loop                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAPTURE LOOP (every 10s)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  For each watched window:                                                │
│  1. Electron captures screenshot                                         │
│  2. Compute SHA-256 hash                                                │
│  3. If hash == previous hash for this window → skip (duplicate)         │
│  4. Save PNG to local folder: ~/Library/.../sessions/{id}/frames/       │
│  5. POST /api/monitoring/sessions/:id/frame                             │
│     Body: {                                                              │
│       current_image: base64,      // Sent for analysis                  │
│       previous_image?: base64,    // For delta detection                │
│       window_source_id, timestamp, hash                                 │
│     }                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKEND: Process Frame                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ IMPORTANT: Image Handling Clarification                            │ │
│  │                                                                     │ │
│  │ • Images ARE sent to backend (base64) for Groq analysis           │ │
│  │ • Images are NOT persisted on backend — used transiently          │ │
│  │ • Images remain stored LOCALLY on Electron client                  │ │
│  │ • Only Top-K images uploaded to cloud at session END              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  STEP 1 - Groq Vision with Delta Detection:                             │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │ Send [previous_image, current_image] to Groq Vision      │           │
│  │ Prompt includes delta detection instructions             │           │
│  │ Returns:                                                  │           │
│  │   - summary (what user is doing NOW)                     │           │
│  │   - delta (what CHANGED between frames)                  │           │
│  │   - context (application, file, etc.)                    │           │
│  │   - on_task (is this work-related?)                      │           │
│  │   - importance_score (0-1 for Top-K selection)           │           │
│  └──────────────────────────────────────────────────────────┘           │
│                        │                                                 │
│                        ▼                                                 │
│  STEP 2 - Store Metadata Only (images discarded after Groq call):       │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │ INSERT frame row into session_frames table (event log)   │           │
│  │ - Store: frame_id, local_filename, quick_summary         │           │
│  │ - Store: delta_*, on_task, task_relevance                │           │
│  │ - Store: importance_score, importance_reason             │           │
│  │ - NO image blob stored in DB or backend filesystem       │           │
│  └──────────────────────────────────────────────────────────┘           │
│                        │                                                 │
│                        ▼                                                 │
│  Return: { success, frame_id, analysis }                                │
│                                                                          │
│  NOTE: No group correlation step — per-window on_task replaces it       │
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
│     a. Generate chunk_summary for current chunk (if not empty)          │
│     b. Update DB session status = "summarizing"                         │
│     c. Trigger async final summary + Top-K selection                    │
│     d. Return immediately to frontend                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FINAL SUMMARY + TOP-K UPLOAD (async)                  │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Fetch user context NOW (GitHub commits/PRs, Linear tickets)         │
│  2. Generate manifests from DB (session_frames with delta/on_task)      │
│  3. Generate chunk summaries (focus on ACTIONS, not observations)       │
│  4. Call Gemini 2.5 Pro with:                                           │
│     - Fresh user context                                                │
│     - All chunk summaries                                               │
│     - System prompt for structured output                               │
│  5. Run Top-K selection algorithm:                                      │
│     - Score all frames by importance + delta + diversity                │
│     - Select top 10 frames (max 2 per file/website)                     │
│     - Mark selected_for_export = TRUE in DB                             │
│  6. Electron uploads Top-K frames to Supabase Storage:                  │
│     - POST /api/monitoring/sessions/:id/upload-frames                   │
│     - Body: [{ frame_id, base64_image }, ...]                           │
│  7. Store final summary + important_frame_ids in DB                     │
│  8. Update DB session status = "ready"                                  │
│  9. Delete local frames folder (cleanup)                                │
│  10. Send to Slack with important screenshots                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Error Handling & Reliability

### Retry Infrastructure

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

async function withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
  let lastError: Error;
  let delay = RETRY_CONFIG.baseDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`[${context}] Attempt ${attempt} failed:`, error.message);

      if (attempt < RETRY_CONFIG.maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
      }
    }
  }

  throw new Error(
    `[${context}] All ${RETRY_CONFIG.maxRetries} attempts failed: ${lastError.message}`
  );
}
```

### Offline Queue for Network Failures

```typescript
interface QueuedFrame {
  session_id: string;
  frame_id: string;
  local_path: string;
  timestamp: string;
  queued_at: string;
  retry_count: number;
}

class FrameQueue {
  private queue: QueuedFrame[] = [];
  private isOnline: boolean = true;

  async enqueue(frame: QueuedFrame): Promise<void> {
    this.queue.push(frame);
    await this.persistQueue(); // Save to localStorage for crash recovery
  }

  async processQueue(): Promise<void> {
    if (!this.isOnline || this.queue.length === 0) return;

    const batch = this.queue.splice(0, 10); // Process 10 at a time

    for (const frame of batch) {
      try {
        await this.processFrame(frame);
      } catch (error) {
        frame.retry_count++;
        if (frame.retry_count < 5) {
          this.queue.push(frame); // Re-queue for retry
        } else {
          console.error(`Frame ${frame.frame_id} failed after 5 retries, marking as failed`);
          await this.markFrameFailed(frame);
        }
      }
    }
  }
}
```

### Graceful Degradation

```typescript
async function analyzeFrame(frame: Frame, sessionGoal?: string): Promise<FrameAnalysis> {
  try {
    // Try Groq vision analysis
    return await withRetry(() => groqVision.analyze(frame, sessionGoal), "Groq Vision");
  } catch (error) {
    // Fallback: Store frame with minimal metadata for later reprocessing
    console.warn("Groq unavailable, storing frame for later analysis");
    return {
      summary: null,
      delta: { changed: null, change_type: "unknown", user_action: "unknown" },
      context: { application: "unknown", activity_type: "unknown" },
      on_task: null,
      needs_reanalysis: true, // Flag for batch reprocessing later
      importance_score: 0.5, // Neutral score until analyzed
    };
  }
}
```

### Batch Frame Processing

Instead of processing each frame immediately, batch frames for efficiency:

```typescript
const BATCH_CONFIG = {
  intervalMs: 30000, // Process every 30 seconds
  maxBatchSize: 15, // Max frames per batch
  concurrencyLimit: 5, // Parallel API calls
};

class BatchProcessor {
  private pending: Frame[] = [];
  private timer: NodeJS.Timer;

  start(): void {
    this.timer = setInterval(() => this.processBatch(), BATCH_CONFIG.intervalMs);
  }

  addFrame(frame: Frame): void {
    this.pending.push(frame);

    // Process immediately if batch is full
    if (this.pending.length >= BATCH_CONFIG.maxBatchSize) {
      this.processBatch();
    }
  }

  private async processBatch(): Promise<void> {
    if (this.pending.length === 0) return;

    const batch = this.pending.splice(0, BATCH_CONFIG.maxBatchSize);

    // Process with concurrency limit
    await pMap(
      batch,
      async (frame) => {
        const analysis = await analyzeFrame(frame);
        await saveFrameMetadata(frame, analysis);
      },
      { concurrency: BATCH_CONFIG.concurrencyLimit }
    );
  }
}
```

### Streaming Interim Summaries

Show progress to user without ending session:

```typescript
const INTERIM_SUMMARY_INTERVAL = 15 * 60 * 1000; // Every 15 minutes

class InterimSummaryService {
  private timer: NodeJS.Timer;

  startForSession(sessionId: string): void {
    this.timer = setInterval(async () => {
      await this.generateAndEmit(sessionId);
    }, INTERIM_SUMMARY_INTERVAL);
  }

  private async generateAndEmit(sessionId: string): Promise<void> {
    // Get frames since last interim summary
    const frames = await db.query(
      `
      SELECT * FROM session_frames
      WHERE session_id = $1
        AND on_task = TRUE
        AND delta_changed = TRUE
      ORDER BY timestamp DESC
      LIMIT 50
    `,
      [sessionId]
    );

    if (frames.length === 0) return;

    // Generate quick summary (use Groq, not Gemini, for speed)
    const interim = await groq.summarize({
      frames: frames.map((f) => ({ summary: f.quick_summary, context: f.analysis_context })),
      prompt: "Summarize recent activity in 2-3 sentences",
    });

    // Emit to frontend via IPC
    emitToRenderer("session:interim-summary", {
      session_id: sessionId,
      summary: interim.text,
      frame_count: frames.length,
      top_activities: extractTopActivities(frames),
      generated_at: new Date().toISOString(),
    });
  }
}
```

### UI for Interim Summary

```
┌────────────────────────────────────────────────────────────────┐
│  📊 Session Progress (1h 23m active)                           │
├────────────────────────────────────────────────────────────────┤
│  Recent activity:                                               │
│  "Added JWT validation to auth.service.ts, wrote 3 unit tests, │
│   researched bcrypt best practices"                            │
│                                                                 │
│  📁 Files: auth.service.ts, auth.service.test.ts               │
│  🎯 On-task: 87%                                                │
│                                                                 │
│  [End Session]  [Send Update Now]                              │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. AI Prompts

### Quick Summary (Groq Llama 4 Scout) — Per Frame

This prompt receives TWO images: the **previous frame** and the **current frame** for the same window. This enables accurate delta detection.

````
You are analyzing two consecutive screenshots from the same window in a work monitoring session.

IMAGE 1: Previous frame (may be null if this is the first frame for this window)
IMAGE 2: Current frame

SESSION GOAL (if provided): {session_goal}
Example: "Working on LIN-341: Add JWT authentication"

Return JSON with these fields:

1. "summary": 1-3 sentence description of what the user is doing NOW (not what they did)
2. "delta": Object describing what CHANGED between frames
3. "context": Metadata visible in the current screenshot
4. "on_task": Boolean - is this window relevant to the SESSION GOAL (if provided) or general work?
5. "task_relevance": If on_task=true, brief description of how it relates to session goal

**DELTA object (CRITICAL - this prevents false attribution):**
```json
{
  "changed": true/false,
  "change_type": "content_edit" | "navigation" | "scroll" | "file_switch" | "none",
  "change_description": "What specifically changed",
  "user_action": "typing" | "clicking" | "scrolling" | "viewing" | "unknown"
}
````

**IMPORTANT**: If the frames look identical or nearly identical:

- Set `changed: false`
- Set `user_action: "viewing"`
- The summary should NOT claim the user "did" anything—say "viewing" or "has open"

**REQUIRED fields in context (always include):**

- "application": The app name (VS Code, Chrome, Slack, etc.)
- "activity_type": One of: coding, research, communication, task_tracking, learning, testing, debugging, documentation, background_media, other

**OPTIONAL fields (include when visible):**

- For code editors: file, function, class, language, project
- For browsers: website, page_title, url_path
- For task trackers: ticket_id, ticket_title, status, priority
- For communication: channel, thread_topic, participants

**IMPORTANCE scoring:**

- "importance": 0.0-1.0 score
- "importance_reason": Why this frame is important

**Scoring guidance:**

- 0.9+: Visible commit, PR merge, test pass/fail, error screen
- 0.7-0.9: Active code editing (visible changes), ticket update
- 0.5-0.7: File/page navigation, research, reference material
- 0.3-0.5: Static viewing, reading documentation
- 0.0-0.3: Background media, unrelated content

**Example: Code editor with changes**

```json
{
  "summary": "User added JWT validation logic to authenticateUser function",
  "delta": {
    "changed": true,
    "change_type": "content_edit",
    "change_description": "Added 3 lines of code for token validation",
    "user_action": "typing"
  },
  "context": {
    "application": "VS Code",
    "file": "auth.service.ts",
    "function": "authenticateUser",
    "language": "TypeScript",
    "activity_type": "coding"
  },
  "on_task": true,
  "task_relevance": "Implementing JWT authentication",
  "importance": 0.85,
  "importance_reason": "Active code editing with visible changes"
}
```

**Example: Static view (no change)**

```json
{
  "summary": "User has Linear ticket LIN-341 open for reference",
  "delta": {
    "changed": false,
    "change_type": "none",
    "change_description": "Same ticket view as previous frame",
    "user_action": "viewing"
  },
  "context": {
    "application": "Chrome",
    "website": "linear.app",
    "ticket_id": "LIN-341",
    "ticket_title": "Add JWT authentication",
    "activity_type": "task_tracking"
  },
  "on_task": true,
  "task_relevance": "Reference ticket for current work",
  "importance": 0.4,
  "importance_reason": "Static reference, no action"
}
```

**Example: Background media**

```json
{
  "summary": "User has background music playing",
  "delta": {
    "changed": true,
    "change_type": "navigation",
    "change_description": "Video progress advanced",
    "user_action": "viewing"
  },
  "context": {
    "application": "Chrome",
    "website": "youtube.com",
    "video_title": "Lo-fi beats",
    "activity_type": "background_media"
  },
  "on_task": false,
  "task_relevance": null,
  "importance": 0.1,
  "importance_reason": "Background media, not work-related"
}
```

```

### Task Context Inference (Optional — Run Once Per Chunk)

Since each frame now has its own `on_task` flag, we no longer need per-group correlation. However, for chunks with multiple on-task windows, we can optionally infer the **shared task context** to improve summary quality.

This is run once per chunk (not per group) to reduce API calls.

```

You are analyzing a work session chunk. Here are summaries from on-task frames:

WINDOW 1 (VS Code):

- "User editing auth.service.ts, adding JWT validation"
- "User writing unit tests for authenticateUser"

WINDOW 2 (Chrome - Linear):

- "User viewing ticket LIN-341: Add JWT authentication"

WINDOW 3 (Chrome - YouTube):

- Excluded (on_task: false, background media)

What is the primary task being worked on in this chunk?

Return JSON:
{
"primary_task": "Implementing JWT authentication for ticket LIN-341",
"confidence": "high",
"evidence": [
"Linear ticket LIN-341 visible with title 'Add JWT authentication'",
"Code changes in auth.service.ts match ticket scope",
"Test file created for the authentication function"
]
}

```

**Note**: This replaces the per-group correlation model. Per-window `on_task` flags handle the 2-of-3-windows scenario that group-level correlation couldn't address.

### Chunk Summary (Groq qwen-qwq-32b OR meta-llama/llama-4-scout-17b-16e-instruct) — When Manifest Reaches 300 Groups

Use a capable reasoning model for chunk summaries since this aggregates many capture groups.

```

You are summarizing a chunk of a work session. Focus on what the user ACTUALLY DID (based on deltas), not just what was visible.

USER PROFILE:
{manifest.user_profile}

FRAMES WITH CHANGES (on_task only):
{manifest.capture_groups
.flatMap(g => g.frames)
.filter(f => f.on_task && f.delta?.changed)
.map(f => ({
timestamp: f.timestamp,
summary: f.summary,
change: f.delta.change_description,
action: f.delta.user_action,
context: f.context
}))
}

TASK CONTEXT (if inferred):
{chunk.primary_task}

Generate a summary that:

1. Describes what the user ACCOMPLISHED (based on visible changes, not just viewing)
2. Distinguishes between "edited", "viewed", and "researched"
3. Filters out background media and static reference views
4. Groups related activities into logical workstreams

Return JSON:
{
"narrative": "2-3 sentence summary focusing on user ACTIONS, not observations",
"key_activities": ["coding", "testing", etc.],
"tickets_touched": ["LIN-XXX", ...],
"files_touched": ["file.ts", ...],
"accomplishments": [
"Added JWT validation to auth.service.ts",
"Created unit tests for authenticateUser function"
]
}

**CRITICAL**: Do NOT say "user worked on X" if they only VIEWED X without making changes.

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

````

---

## 6. API Changes

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sessions/:id/frame` | POST | Upload single frame + get quick summary |
| `/sessions/:id/manifests` | GET | List all manifest chunks for a session |
| `/sessions/:id/manifests/:chunk` | GET | Download specific manifest chunk |

### Modified Endpoints

| Endpoint | Changes |
|----------|---------|
| `POST /sessions` | Creates session row in DB, creates storage folder |
| `POST /sessions/:id/end` | Finalizes manifest, triggers async summary |
| `DELETE /sessions/:id` | Deletes Storage folder + DB row |

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
````

---

## 7. Database Changes

### Simplified Schema

DB serves as the **append-only event log** for reliability. Manifest is a **derived view** generated from DB data. Images are stored locally during capture, then Top-K uploaded at session end.

```sql
-- Sessions table (lifecycle tracking)
CREATE TABLE monitoring_sessions (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'active',  -- active, paused, summarizing, ready
  session_goal TEXT,                    -- Optional: "Working on LIN-341: Add JWT auth"
  local_path TEXT,                      -- e.g., "~/Library/Application Support/Mitable/sessions/{id}"
  cloud_path TEXT,                      -- e.g., "org_123/user_456/sess_789" (populated at end)
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  -- Checkpoint fields for crash recovery
  last_checkpoint_at TIMESTAMPTZ,
  last_checkpoint_frame_id VARCHAR(50),
  recovery_status VARCHAR(20),          -- null, 'needs_recovery', 'recovered', 'discarded'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Frames table (EVENT LOG - append-only, lightweight, NO images)
-- This is the source of truth for frame metadata. Images stored locally.
CREATE TABLE session_frames (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  frame_id VARCHAR(50) NOT NULL,        -- e.g., "frame_0001"
  group_id VARCHAR(50) NOT NULL,        -- e.g., "grp_001" (frames at same timestamp)
  local_filename TEXT NOT NULL,         -- e.g., "frame_0001.png" (relative to session folder)
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

  -- Delta detection (CRITICAL for accurate summaries)
  delta_changed BOOLEAN DEFAULT FALSE,
  delta_change_type VARCHAR(20),        -- content_edit, navigation, scroll, file_switch, none
  delta_change_description TEXT,
  delta_user_action VARCHAR(20),        -- typing, clicking, scrolling, viewing, unknown

  -- Per-window task relevance (replaces group-level correlation)
  on_task BOOLEAN DEFAULT TRUE,
  task_relevance TEXT,                  -- e.g., "Implementing JWT auth for LIN-341"

  -- Importance scoring for Top-K selection
  importance_score FLOAT DEFAULT 0,     -- 0-1, higher = more important for exports
  importance_reason TEXT,               -- e.g., "Active code editing with visible changes"

  -- Flag for Top-K selected frames
  selected_for_export BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunk summaries (generated every 300 groups or at session end)
CREATE TABLE session_chunk_summaries (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  chunk_index INTEGER NOT NULL,
  chunk_start TIMESTAMPTZ NOT NULL,
  chunk_end TIMESTAMPTZ NOT NULL,
  narrative TEXT,
  key_activities TEXT[],
  tickets_touched TEXT[],
  files_touched TEXT[],
  accomplishments TEXT[],
  primary_task TEXT,                    -- Inferred from on-task frames
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Final summary
CREATE TABLE session_summaries (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  narrative TEXT,
  structured JSONB,
  important_frame_ids TEXT[],           -- Top-K frame IDs selected for exports
  generated_at TIMESTAMPTZ,
  model VARCHAR(50)
);

-- Indexes for common queries
CREATE INDEX idx_frames_session ON session_frames(session_id);
CREATE INDEX idx_frames_group ON session_frames(session_id, group_id);
CREATE INDEX idx_frames_importance ON session_frames(session_id, importance_score DESC);
CREATE INDEX idx_frames_on_task ON session_frames(session_id, on_task) WHERE on_task = TRUE;
CREATE INDEX idx_frames_delta ON session_frames(session_id, delta_changed) WHERE delta_changed = TRUE;
```

**Note**: The `session_group_correlations` table has been removed. Per-window `on_task` flags replace group-level correlation.

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

  // Query all frames for these groups (includes per-window on_task flags)
  const frames = await db.query(
    `
    SELECT
      id, frame_id, group_id, local_filename, window_source_id,
      hash, timestamp, trigger, is_skipped, skip_reason,
      quick_summary, activity_type, application, analysis_context,
      delta_changed, delta_change_type, delta_change_description, delta_user_action,
      on_task, task_relevance,
      importance_score, importance_reason
    FROM session_frames
    WHERE session_id = $1 AND group_id = ANY($2)
    ORDER BY timestamp, frame_id
  `,
    [sessionId, groupIds]
  );

  // NOTE: No correlations query needed — on_task is per-frame now

  // Build manifest structure from frames
  return buildManifestFromFrames(frames);
}

function buildManifestFromFrames(frames: FrameRow[]): Manifest {
  // Group frames by group_id
  const groups = new Map<string, FrameRow[]>();
  for (const frame of frames) {
    const existing = groups.get(frame.group_id) || [];
    existing.push(frame);
    groups.set(frame.group_id, existing);
  }

  // Build capture_groups array
  const captureGroups = Array.from(groups.entries()).map(([groupId, groupFrames]) => ({
    group_id: groupId,
    timestamp: groupFrames[0].timestamp,
    frames: groupFrames.map((f) => ({
      frame_id: f.frame_id,
      filename: f.local_filename,
      window_source_id: f.window_source_id,
      hash: f.hash,
      skipped: f.is_skipped,
      skip_reason: f.skip_reason,
      analysis: f.is_skipped
        ? undefined
        : {
            summary: f.quick_summary,
            delta: {
              changed: f.delta_changed,
              change_type: f.delta_change_type,
              change_description: f.delta_change_description,
              user_action: f.delta_user_action,
            },
            context: {
              application: f.application,
              activity_type: f.activity_type,
              ...f.analysis_context,
            },
            on_task: f.on_task,
            task_relevance: f.task_relevance,
          },
      importance_score: f.importance_score,
      importance_reason: f.importance_reason,
    })),
  }));

  return { capture_groups: captureGroups };
}
```

### Migration Path

1. New sessions use DB event log + Storage for images
2. Manifest generated on demand (or cached at chunk boundaries)
3. Old sessions continue working (read from existing DB schema)
4. Eventually migrate old data or let it age out

---

## 8. Implementation Plan

### Phase 0: Foundation & Reliability (1 day) — NEW

| Task                                                    | Effort |
| ------------------------------------------------------- | ------ |
| Implement retry infrastructure with exponential backoff | 2h     |
| Add offline frame queue with localStorage persistence   | 2h     |
| Implement session checkpoint mechanism                  | 2h     |
| Add crash recovery detection and dialog                 | 2h     |

### Phase 1: Local Storage + Delta Detection (2 days)

| Task                                                      | Effort |
| --------------------------------------------------------- | ------ |
| Create local frames folder management                     | 1h     |
| Create Supabase Storage bucket `mitable-sessions`         | 0.5h   |
| Implement local frame storage with hash dedup             | 2h     |
| Modify session start with optional session goal           | 2h     |
| Implement delta detection (send prev + current to Groq)   | 3h     |
| Implement per-window on_task flags (no group correlation) | 2h     |
| Testing                                                   | 2h     |

### Phase 2: Incremental Analysis (1.5 days)

| Task                                              | Effort |
| ------------------------------------------------- | ------ |
| Add Groq SDK and Llama 4 Scout integration        | 2h     |
| Implement batch frame processor (30s intervals)   | 2h     |
| Implement quick summary with delta + session goal | 2h     |
| Implement manifest splitting at 300 groups        | 2h     |
| Implement chunk summary generation                | 2h     |
| Testing                                           | 2h     |

### Phase 3: Top-K + Upload (1 day)

| Task                                              | Effort |
| ------------------------------------------------- | ------ |
| Implement Top-K selection with temporal diversity | 3h     |
| Implement context diversity constraint            | 1h     |
| Implement Top-K frame upload at session end       | 2h     |
| Implement local frames cleanup after upload       | 1h     |
| Testing                                           | 1h     |

### Phase 4: Final Summary + Delivery (1 day)

| Task                                       | Effort |
| ------------------------------------------ | ------ |
| Fetch GitHub commits/PRs at session END    | 2h     |
| Fetch Linear tickets at session END        | 1h     |
| Generate final summary with Gemini 2.5 Pro | 2h     |
| Update Slack delivery with Top-K images    | 2h     |
| Testing                                    | 1h     |

### Phase 5: Interim Summaries + UX (1 day)

| Task                                                 | Effort |
| ---------------------------------------------------- | ------ |
| Implement streaming interim summaries (every 15 min) | 3h     |
| Add interim summary UI component                     | 2h     |
| Implement session pause/resume                       | 2h     |
| Add session goal input to StartSessionDialog         | 1h     |

### Phase 6: Privacy & Polish (0.5 days)

| Task                                        | Effort |
| ------------------------------------------- | ------ |
| Implement frame redaction API               | 2h     |
| Add redaction UI in frame preview           | 1h     |
| Update session card with new summary format | 1h     |

**Total: ~8 days**

### Priority Matrix

| Feature                      | Priority | Phase |
| ---------------------------- | -------- | ----- |
| Crash recovery + checkpoints | P0       | 0     |
| Local storage + Top-K upload | P0       | 1, 3  |
| Delta detection              | P0       | 1     |
| Per-window on_task           | P0       | 1     |
| Temporal diversity in Top-K  | P0       | 3     |
| Session goal for on_task     | P1       | 1     |
| Error handling/retry         | P1       | 0     |
| Batch frame processing       | P2       | 2     |
| Interim summaries            | P2       | 5     |
| Pause/Resume                 | P3       | 5     |
| Privacy/Redaction            | P3       | 6     |

---

## 9. Cost Analysis

### Per-Session Costs (1 hour, 5 windows, 50% dedup)

| Component                             | Calculation                      | Cost       |
| ------------------------------------- | -------------------------------- | ---------- |
| Groq Llama 4 (quick summary w/ delta) | 180 frames × 2 images × $0.00002 | ~$0.007    |
| Groq (task context inference)         | 1 chunk × $0.0005                | ~$0.0005   |
| Groq (chunk summary)                  | 1 chunk × $0.001                 | ~$0.001    |
| Gemini 2.5 Pro (final summary)        | 1 call × ~$0.02                  | ~$0.02     |
| Supabase Storage (Top-K only)         | 10 frames × 1MB × $0.021/GB      | ~$0.0002   |
| Local storage (ephemeral)             | 180 frames × 1MB                 | $0         |
| **Total per 1-hour session**          |                                  | **~$0.03** |

**Note**: Storage costs reduced by ~95% due to local-first approach with Top-K upload.

### Monthly Estimate

| Usage                 | Cost  |
| --------------------- | ----- |
| 100 sessions/month    | ~$3   |
| 1,000 sessions/month  | ~$30  |
| 10,000 sessions/month | ~$300 |

### Local Disk Usage

| Session Duration | Frames (est.) | Disk Usage | Auto-cleaned  |
| ---------------- | ------------- | ---------- | ------------- |
| 30 min           | ~90 frames    | ~90 MB     | After summary |
| 1 hour           | ~180 frames   | ~180 MB    | After summary |
| 4 hours          | ~720 frames   | ~720 MB    | After summary |

Local frames are automatically deleted after session summary is generated and Top-K frames are uploaded.

---

## 10. Why This Architecture

### Current Problems Solved

| Problem                            | Solution                                           |
| ---------------------------------- | -------------------------------------------------- |
| DB bloat from base64 images        | Local-first storage + Top-K upload                 |
| Uploading 100s of unneeded images  | Only Top-K important frames uploaded (~10)         |
| Weak summaries (no context)        | User context + incremental analysis                |
| All analysis at session end        | Quick summaries during capture                     |
| False attribution ("user did X")   | Delta detection distinguishes viewing vs action    |
| Ambiguous multi-window correlation | Per-window `on_task` flags (not group-level)       |
| Generic output                     | Structured JSON with workstreams + accomplishments |
| Fragile cleanup (setTimeout)       | Local storage auto-cleanup after summary           |
| Long sessions overwhelm LLM        | Manifest chunking with pre-summaries               |

### Future Capabilities Unlocked

| Feature              | How Manifest Enables It                             |
| -------------------- | --------------------------------------------------- |
| Tool call enrichment | user_context has PR numbers, ticket IDs for queries |
| Session export       | manifest.json is portable, self-contained           |
| Analytics            | Queryable structured data per chunk                 |
| Custom integrations  | Standard format for any consumer                    |
| Replay/timeline view | Ordered frames with timestamps and summaries        |

---

## 11. Session Recovery & Checkpoints

### Problem: Data Loss on Crash

If Electron crashes mid-session, all local frames could be lost before summary generation. A 3-hour session could vanish entirely.

### Solution: Periodic Checkpoints

```typescript
const CHECKPOINT_INTERVAL_FRAMES = 50; // Every 50 frames
const CHECKPOINT_INTERVAL_TIME = 15 * 60 * 1000; // OR every 15 minutes

interface Checkpoint {
  session_id: string;
  checkpoint_id: string;
  frame_count: number;
  last_frame_id: string;
  last_frame_timestamp: string;
  local_path_verified: boolean;
  created_at: string;
}
```

### Checkpoint Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CHECKPOINT CREATION (every 50 frames or 15 min)      │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Verify local frames folder exists and contains expected frames      │
│  2. Write checkpoint record to DB:                                      │
│     - last_frame_id, frame_count, local_path_verified                  │
│  3. Generate mini-summary for checkpoint segment (optional)            │
│  4. Continue capture loop                                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    APP RESTART RECOVERY                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  1. On app launch, check for sessions with status = 'active'            │
│  2. If found, check local frames folder exists                         │
│  3. Recover options:                                                    │
│     a. Resume: Continue capture from last checkpoint                   │
│     b. End: Generate summary from captured frames                      │
│     c. Discard: Delete incomplete session                              │
│  4. Show recovery dialog to user                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Addition

```sql
-- Add to monitoring_sessions table
last_checkpoint_at TIMESTAMPTZ,
last_checkpoint_frame_id VARCHAR(50),
recovery_status VARCHAR(20)  -- null, 'needs_recovery', 'recovered', 'discarded'

-- Checkpoint history (optional, for debugging)
CREATE TABLE session_checkpoints (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  frame_count INTEGER NOT NULL,
  last_frame_id VARCHAR(50) NOT NULL,
  local_path_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Recovery Dialog UI

```
┌────────────────────────────────────────────────────┐
│  ⚠️  Incomplete Session Detected                    │
├────────────────────────────────────────────────────┤
│  Session started: Dec 18, 10:00 AM                 │
│  Last checkpoint: Dec 18, 11:45 AM                 │
│  Frames captured: 156                              │
│                                                    │
│  What would you like to do?                        │
│                                                    │
│  [Resume Session]  [End & Summarize]  [Discard]   │
└────────────────────────────────────────────────────┘
```

---

## 12. Session Pause/Resume

### Use Cases

- Lunch break or meeting interruption
- Context switch to unrelated work
- User wants to pause without losing progress

### Status Transitions

```
active → paused → active → summarizing → ready
                ↘ discarded
```

### Implementation

```typescript
// Pause session
async function pauseSession(sessionId: string): Promise<void> {
  // Stop capture loop
  captureLoop.stop();

  // Update DB status
  await db.query(
    `
    UPDATE monitoring_sessions
    SET status = 'paused', updated_at = NOW()
    WHERE id = $1
  `,
    [sessionId]
  );

  // Keep local frames folder intact
  // Stop interim summary timer
  interimSummaryService.stop();
}

// Resume session
async function resumeSession(sessionId: string): Promise<void> {
  // Update DB status
  await db.query(
    `
    UPDATE monitoring_sessions
    SET status = 'active', updated_at = NOW()
    WHERE id = $1
  `,
    [sessionId]
  );

  // Restart capture loop from last frame
  const lastFrame = await getLastFrame(sessionId);
  captureLoop.start(sessionId, lastFrame?.frame_id);

  // Restart interim summary timer
  interimSummaryService.startForSession(sessionId);
}
```

### UI Integration

```
┌────────────────────────────────────────────────────────────────┐
│  ⏸️ Session Paused (started 2h ago, paused 15m ago)            │
├────────────────────────────────────────────────────────────────┤
│  Frames captured: 156                                          │
│  Last activity: Editing auth.service.ts                        │
│                                                                 │
│  [Resume Session]  [End & Summarize]  [Discard]               │
└────────────────────────────────────────────────────────────────┘
```

---

## 13. Privacy & Redaction Controls

### Use Cases

- User accidentally captured sensitive content (passwords, personal info)
- Need to exclude specific frames from summary/export
- Compliance requirement to delete certain data

### Frame Redaction

```sql
-- Add to session_frames table
is_redacted BOOLEAN DEFAULT FALSE,
redacted_at TIMESTAMPTZ,
redacted_reason VARCHAR(100)  -- 'user_request', 'sensitive_content', 'compliance'
```

### API Endpoints

```typescript
// Redact a single frame
DELETE /api/monitoring/sessions/:sessionId/frames/:frameId
// Response: { success: true, message: 'Frame redacted' }

// Bulk redact frames
POST /api/monitoring/sessions/:sessionId/frames/redact
Body: { frame_ids: ['frame_001', 'frame_002'], reason: 'sensitive_content' }

// Get redaction audit log
GET /api/monitoring/sessions/:sessionId/redactions
```

### Implementation

```typescript
async function redactFrame(sessionId: string, frameId: string, reason: string): Promise<void> {
  // 1. Delete local image file
  const frame = await getFrame(sessionId, frameId);
  await fs.unlink(frame.local_path);

  // 2. Mark as redacted in DB (keep metadata for audit)
  await db.query(
    `
    UPDATE session_frames
    SET is_redacted = TRUE,
        redacted_at = NOW(),
        redacted_reason = $3,
        -- Clear analysis data
        quick_summary = '[REDACTED]',
        analysis_context = NULL,
        importance_score = 0
    WHERE session_id = $1 AND frame_id = $2
  `,
    [sessionId, frameId, reason]
  );

  // 3. If frame was selected for export, remove from selection
  await db.query(
    `
    UPDATE session_frames
    SET selected_for_export = FALSE
    WHERE session_id = $1 AND frame_id = $2
  `,
    [sessionId, frameId]
  );

  // 4. Log redaction for compliance
  await auditLog.record({
    action: "frame_redacted",
    session_id: sessionId,
    frame_id: frameId,
    reason,
    timestamp: new Date(),
  });
}
```

### Exclusion from Summaries

Redacted frames are automatically excluded:

```typescript
// In generateManifest()
const frames = await db.query(
  `
  SELECT * FROM session_frames
  WHERE session_id = $1
    AND group_id = ANY($2)
    AND is_redacted = FALSE  -- Exclude redacted frames
  ORDER BY timestamp, frame_id
`,
  [sessionId, groupIds]
);
```

### UI for Redaction

```
┌────────────────────────────────────────────────────────────────┐
│  🖼️ Frame Preview                               [⋮] Options    │
├────────────────────────────────────────────────────────────────┤
│  [Screenshot image]                                            │
│                                                                 │
│  Captured: 10:45 AM                                            │
│  Window: Chrome - Gmail                                        │
│  Summary: User viewing email inbox                             │
│                                                                 │
│  [🗑️ Delete Frame]  [⚠️ Report Sensitive Content]             │
└────────────────────────────────────────────────────────────────┘
```

---

## 14. Risk Mitigation

| Risk                               | Mitigation                                                       |
| ---------------------------------- | ---------------------------------------------------------------- |
| **App crash mid-session**          | Checkpoints every 50 frames / 15 min, recovery dialog on restart |
| Groq rate limits                   | Implement exponential backoff, queue frames                      |
| Storage costs grow                 | Set retention policy (delete after 30 days)                      |
| Manifest corruption mid-write      | Atomic writes via temp file + rename                             |
| Migration breaks existing sessions | Feature flag, run parallel with old system                       |
| User forgets session running       | Auto-pause after 4 hours of no new unique frames                 |
| Network failure mid-capture        | Offline queue with retry on reconnect                            |
| **Sensitive content captured**     | Redaction controls with audit logging                            |

---

## 15. Example: Long Session (4 hours, 3 windows)

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

## Appendix A: Delta Detection Implementation

```typescript
interface DeltaResult {
  changed: boolean;
  change_type: "content_edit" | "navigation" | "scroll" | "file_switch" | "none";
  change_description: string;
  user_action: "typing" | "clicking" | "scrolling" | "viewing" | "unknown";
}

// Track previous frame per window for delta detection
const previousFrames = new Map<string, { path: string; hash: string }>();

async function analyzeFrameWithDelta(
  sessionId: string,
  windowSourceId: string,
  currentFramePath: string,
  currentHash: string
): Promise<FrameAnalysis> {
  const previous = previousFrames.get(windowSourceId);

  // First frame for this window — no delta possible
  if (!previous) {
    previousFrames.set(windowSourceId, { path: currentFramePath, hash: currentHash });
    return await analyzeFrame(null, currentFramePath);
  }

  // Hash match — identical frame, skip analysis
  if (previous.hash === currentHash) {
    return { skipped: true, skip_reason: "duplicate_hash" };
  }

  // Send BOTH frames to Groq for delta detection
  const analysis = await groqVision.analyze({
    images: [previous.path, currentFramePath],
    prompt: DELTA_DETECTION_PROMPT,
  });

  // Update previous frame reference
  previousFrames.set(windowSourceId, { path: currentFramePath, hash: currentHash });

  return analysis;
}
```

## Appendix B: Top-K Frame Selection

```typescript
const TOP_K = 10;

async function selectImportantFrames(sessionId: string): Promise<string[]> {
  // Get all non-skipped, on-task frames with changes
  const candidates = await db.query(
    `
    SELECT frame_id, importance_score, importance_reason,
           delta_change_type, delta_user_action, application,
           analysis_context->>'file' as file,
           analysis_context->>'website' as website
    FROM session_frames
    WHERE session_id = $1
      AND NOT is_skipped
      AND on_task = TRUE
      AND delta_changed = TRUE
    ORDER BY importance_score DESC
  `,
    [sessionId]
  );

  // Apply diversity constraint and select Top-K
  const selected: string[] = [];
  const contextCounts = new Map<string, number>();

  for (const frame of candidates) {
    if (selected.length >= TOP_K) break;

    // Diversity: max 2 frames per file/website
    const contextKey = `${frame.application}:${frame.file || frame.website || "unknown"}`;
    const count = contextCounts.get(contextKey) || 0;
    if (count >= 2) continue;

    selected.push(frame.frame_id);
    contextCounts.set(contextKey, count + 1);
  }

  // Fallback: if <K frames, ask Groq to help select
  if (selected.length < TOP_K) {
    const additionalFrames = await groqSelectFrames(sessionId, TOP_K - selected.length, selected);
    selected.push(...additionalFrames);
  }

  // Mark selected frames in DB
  await db.query(
    `
    UPDATE session_frames
    SET selected_for_export = TRUE
    WHERE session_id = $1 AND frame_id = ANY($2)
  `,
    [sessionId, selected]
  );

  return selected;
}
```
