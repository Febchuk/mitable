# Session Timeline Workstreams - Technical Documentation

## Overview

The Session Timeline feature provides a workstream-based visualization of monitoring sessions. Instead of grouping activity by application (VS Code, Slack, Chrome), it groups activity by **logical workstreams** - the actual tasks or projects the user is working on.

**Key Insight**: A single workstream like "Auth System Refactor" can span multiple applications (VS Code → Terminal → Chrome → VS Code) and have non-contiguous time segments (work → break → resume work).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Electron)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   SessionTimeline Component                                             │
│        │                                                                │
│        ├── useSessionWorkstreams() hook                                 │
│        │        │                                                       │
│        │        ├── fetchSessionWorkstreams() ──► Backend API           │
│        │        │                                                       │
│        │        └── transformToWorkstreams() ──► Client-side fallback   │
│        │                                                                │
│        ├── SessionStats (Layer 1)                                       │
│        ├── SwimlanesTimeline (Layer 2)                                  │
│        ├── WorkstreamCardsGrid (Layer 3)                                │
│        ├── SegmentDetailPanel (Layer 4)                                 │
│        └── WorkstreamLegend (Layer 5)                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Express)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   GET /api/monitoring/sessions/:id/workstreams                          │
│        │                                                                │
│        ├── Fetch session (verify ownership)                             │
│        │                                                                │
│        ├── Fetch session_captures from database                         │
│        │                                                                │
│        └── workstreamAggregationService.aggregateWorkstreams()          │
│                 │                                                       │
│                 ├── workstreamDetectionService.detectWorkstream()       │
│                 │        (for each capture)                             │
│                 │                                                       │
│                 ├── Group captures by normalized workstream name        │
│                 │                                                       │
│                 ├── Build time segments (handle gaps)                   │
│                 │                                                       │
│                 └── Calculate session statistics                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATABASE (PostgreSQL)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   monitoring_sessions                                                   │
│   ├── id, user_id, organization_id                                      │
│   ├── linear_issue_id, linear_issue_title (optional goal context)       │
│   └── status, started_at, ended_at                                      │
│                                                                         │
│   session_captures                                                      │
│   ├── id, session_id, sequence_number                                   │
│   ├── app_name, window_title                                            │
│   ├── activity_description, delta_change_description                    │
│   └── captured_at                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Capture Collection (During Session)

When a monitoring session is active, the Electron app captures screenshots at regular intervals (default: 10 seconds). Each capture includes:

```typescript
interface CaptureData {
  id: string;
  sequenceNumber: number;
  capturedAt: Date;
  appName: string | null; // "Code", "Google Chrome", "Slack"
  windowTitle: string | null; // "[mitable] - auth.ts - Visual Studio Code"
  activityDescription: string | null; // AI-classified activity
  deltaChangeDescription: string | null; // Visual delta description
}
```

### 2. Workstream Detection

For each capture, the `WorkstreamDetectionService` analyzes the context to determine which workstream it belongs to:

```typescript
// Priority order for workstream detection:

1. Linear Issue Context (if session has goal)
   → Session started with "Implement JWT auth [LIN-341]"
   → All captures default to "Implement JWT auth" workstream
   → Confidence: 0.95

2. Window Title Pattern [project-name]
   → "[mitable] - auth.ts - Visual Studio Code"
   → Extracted: "mitable"
   → Confidence: 0.85

3. File Path Parent Folder
   → "src/services/auth.ts - Visual Studio Code"
   → Extracted: "services"
   → Confidence: 0.75

4. Git Branch in Terminal
   → "zsh (feature/auth-refactor)"
   → Extracted: "auth-refactor"
   → Confidence: 0.80

5. Communication Apps → "Communications"
   → Slack, Teams, Mail, Outlook, Discord
   → Confidence: 0.90

6. Meeting Apps → "Meetings"
   → Zoom, Meet, WebEx, FaceTime
   → Confidence: 0.90

7. Design Tools with File Name
   → "Login Flow – Figma"
   → Extracted: "Login Flow"
   → Confidence: 0.70

8. Default: App Name
   → "Google Chrome"
   → Confidence: 0.50
```

### 3. Workstream Aggregation

Once all captures have workstream assignments, the `WorkstreamAggregationService` groups them:

```typescript
// Input: Array of captures with workstream assignments
// Output: Aggregated workstreams with segments and stats

function aggregateWorkstreams(captures, sessionContext) {
  // Step 1: Group captures by normalized workstream name
  const groups = new Map<string, CaptureData[]>();

  for (const capture of captures) {
    const assignment = detectWorkstream(capture);
    const name = assignment.normalizedName; // "Auth Refactor"

    if (!groups.has(name)) {
      groups.set(name, []);
    }
    groups.get(name).push(capture);
  }

  // Step 2: Build time segments for each workstream
  // Segments are split if gap > 10 minutes
  for (const [name, groupCaptures] of groups) {
    const segments = buildSegments(groupCaptures);
    // Example output:
    // [
    //   { startTime: "09:00", endTime: "10:45", durationMinutes: 105 },
    //   { startTime: "11:30", endTime: "12:30", durationMinutes: 60 }
    // ]
  }

  // Step 3: Calculate session statistics
  const stats = calculateSessionStats(workstreams);

  return { workstreams, sessionStats, sessionStartTime, sessionEndTime };
}
```

### 4. Time Segment Building

Non-contiguous work periods are handled by splitting into separate segments:

```
Timeline:  09:00  10:00  11:00  12:00  13:00
           ─────────────────────────────────

Captures:  ■ ■ ■ ■ ■ ■        ■ ■ ■ ■
           Auth work          Auth work
           (continuous)       (resumed)

Segments:  [─────────────]    [─────────]
           Segment 1          Segment 2
           09:00-10:45        11:30-12:30

Gap > 10 min = new segment
```

```typescript
function buildSegments(captures: CaptureData[]): TimeSegment[] {
  const MAX_GAP_MINUTES = 10;
  const segments: TimeSegment[] = [];
  let currentSegment = null;

  for (const capture of sortedCaptures) {
    if (!currentSegment) {
      currentSegment = { startTime: capture.capturedAt, endTime: capture.capturedAt };
    } else {
      const gap = getMinutesDiff(currentSegment.endTime, capture.capturedAt);

      if (gap > MAX_GAP_MINUTES) {
        // Finalize current segment, start new one
        segments.push(currentSegment);
        currentSegment = { startTime: capture.capturedAt, endTime: capture.capturedAt };
      } else {
        // Extend current segment
        currentSegment.endTime = capture.capturedAt;
      }
    }
  }

  segments.push(currentSegment);
  return segments;
}
```

### 5. Statistics Calculation

Session-level statistics are computed from the aggregated workstreams:

```typescript
interface SessionStats {
  totalTimeMinutes: number; // Sum of all workstream durations
  deepWorkMinutes: number; // Time in coding/design apps (non-interruption)
  deepWorkPercent: number; // (deepWorkMinutes / totalTimeMinutes) * 100
  interruptionCount: number; // Number of Communication/Meeting segments
  interruptionMinutes: number; // Total time in interruptions
  longestFocusMinutes: number; // Longest single segment duration
  longestFocusWorkstream: string; // Workstream name of longest segment
}

// Deep work apps:
const DEEP_WORK_APPS = [
  "code",
  "vscode",
  "intellij",
  "webstorm", // IDEs
  "terminal",
  "iterm", // Terminal
  "figma",
  "xd", // Design
];

// Interruption workstreams:
const INTERRUPTION_WORKSTREAMS = ["Communications", "Meetings"];
```

---

## API Reference

### GET /api/monitoring/sessions/:id/workstreams

Fetch aggregated workstreams for a session with timeline visualization data.

**Authentication**: Required (Bearer token)

**Path Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string (UUID) | Session ID |

**Response**: `WorkstreamResponse`

```typescript
interface WorkstreamResponse {
  workstreams: Workstream[];
  sessionStats: SessionStats;
  sessionStartTime: string; // ISO timestamp
  sessionEndTime: string; // ISO timestamp
}

interface Workstream {
  id: string; // Unique ID (e.g., "ws-1706789123-abc123")
  name: string; // Display name (e.g., "Auth System Refactor")
  color: WorkstreamColor; // "violet" | "blue" | "pink" | "emerald" | "amber" | "cyan"
  totalDurationMinutes: number; // Aggregated across all segments
  segments: TimeSegment[]; // Non-contiguous time blocks
  appsUsed: string[]; // Unique apps (e.g., ["VS Code", "Terminal"])
  captureCount: number; // Number of captures in this workstream
  dominantActivity: string; // Most common activity description
  captureIds?: string[]; // Optional: IDs for capture lookup
}

interface TimeSegment {
  startTime: string; // ISO timestamp
  endTime: string; // ISO timestamp
  durationMinutes: number;
}

interface SessionStats {
  totalTimeMinutes: number;
  deepWorkMinutes: number;
  deepWorkPercent: number;
  interruptionCount: number;
  interruptionMinutes: number;
  longestFocusMinutes: number;
  longestFocusWorkstream: string;
}
```

**Example Response**:

```json
{
  "workstreams": [
    {
      "id": "ws-1706789123456-abc123def",
      "name": "Auth System Refactor",
      "color": "violet",
      "totalDurationMinutes": 165,
      "segments": [
        {
          "startTime": "2025-01-15T09:00:00.000Z",
          "endTime": "2025-01-15T10:45:00.000Z",
          "durationMinutes": 105
        },
        {
          "startTime": "2025-01-15T11:30:00.000Z",
          "endTime": "2025-01-15T12:30:00.000Z",
          "durationMinutes": 60
        }
      ],
      "appsUsed": ["VS Code", "Terminal", "Chrome"],
      "captureCount": 42,
      "dominantActivity": "Editing auth.ts",
      "captureIds": ["cap-1", "cap-2", "cap-3"]
    },
    {
      "id": "ws-1706789123457-xyz789ghi",
      "name": "Communications",
      "color": "blue",
      "totalDurationMinutes": 45,
      "segments": [
        {
          "startTime": "2025-01-15T10:45:00.000Z",
          "endTime": "2025-01-15T11:30:00.000Z",
          "durationMinutes": 45
        }
      ],
      "appsUsed": ["Slack"],
      "captureCount": 12,
      "dominantActivity": "Messaging in #engineering",
      "captureIds": ["cap-10", "cap-11"]
    }
  ],
  "sessionStats": {
    "totalTimeMinutes": 210,
    "deepWorkMinutes": 165,
    "deepWorkPercent": 79,
    "interruptionCount": 1,
    "interruptionMinutes": 45,
    "longestFocusMinutes": 105,
    "longestFocusWorkstream": "Auth System Refactor"
  },
  "sessionStartTime": "2025-01-15T09:00:00.000Z",
  "sessionEndTime": "2025-01-15T12:30:00.000Z"
}
```

**Error Responses**:

| Status | Code                  | Description                   |
| ------ | --------------------- | ----------------------------- |
| 401    | Unauthorized          | Missing or invalid auth token |
| 403    | Forbidden             | User doesn't own this session |
| 404    | Not Found             | Session doesn't exist         |
| 500    | Internal Server Error | Server-side error             |

---

## Frontend Integration

### Using the Backend API (Recommended)

```typescript
import { useSessionWorkstreams } from "./SessionTimeline/hooks/useSessionWorkstreams";

function SessionTimeline({ sessionId, sessionStatus }) {
  const { data, isLoading, error, dataSource } = useSessionWorkstreams(sessionId, {
    useBackend: true,  // Use backend API (default)
    sessionStatus,
  });

  if (isLoading) return <Loading />;
  if (error) return <Error error={error} />;
  if (!data) return <Empty />;

  // dataSource tells you where data came from: "backend" | "client"
  console.log(`Data from: ${dataSource}`);

  return (
    <div>
      <SessionStats stats={data.sessionStats} />
      <SwimlanesTimeline workstreams={data.workstreams} />
      <WorkstreamCardsGrid workstreams={data.workstreams} />
    </div>
  );
}
```

### Fallback to Client-Side Transform

The `useSessionWorkstreams` hook automatically falls back to client-side transformation if the backend API fails:

```typescript
const { data, dataSource } = useSessionWorkstreams(sessionId);

// dataSource === "backend" → API succeeded
// dataSource === "client"  → API failed, used client-side transform
```

### Direct Client-Side Transform (No Backend)

```typescript
import { useSessionCaptures } from "@/hooks/queries/monitoring";
import { useWorkstreamTransform } from "./utils/workstreamTransform";

function SessionTimeline({ sessionId, sessionStatus }) {
  const { data: captures } = useSessionCaptures(sessionId, sessionStatus);
  const transformedData = useWorkstreamTransform(captures);

  // transformedData has same shape as backend response
}
```

---

## Color System

### Workstream Color Palette

Colors are assigned in order as workstreams are created:

| Index | Color   | Hex     | Tailwind Class   |
| ----- | ------- | ------- | ---------------- |
| 0     | Violet  | #8B5CF6 | `bg-violet-500`  |
| 1     | Blue    | #3B82F6 | `bg-blue-500`    |
| 2     | Pink    | #EC4899 | `bg-pink-500`    |
| 3     | Emerald | #10B981 | `bg-emerald-500` |
| 4     | Amber   | #F59E0B | `bg-amber-500`   |
| 5     | Cyan    | #06B6D4 | `bg-cyan-500`    |

Colors cycle: `workstream.color = COLORS[index % 6]`

### Color Utilities

```typescript
import { WORKSTREAM_COLOR_MAP } from "./utils/types";

const colorClasses = WORKSTREAM_COLOR_MAP[workstream.color];
// {
//   bg: "bg-violet-500",      // Background
//   border: "border-violet-500", // Border
//   text: "text-violet-500",   // Text
//   dim: "bg-violet-500/30"    // Dimmed (30% opacity)
// }
```

---

## UI Layers

### Layer 1: Session Stats Summary

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   Total Time    │    Deep Work    │  Interruptions  │  Longest Focus  │
│     5h 30m      │   4h 15m (77%)  │    3 (45min)    │   2h 15m        │
│                 │                 │                 │  Auth Refactor  │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### Layer 2: Swimlanes Timeline

```
           09:00    10:00    11:00    12:00    13:00    14:00
           ─────────────────────────────────────────────────────
Auth       │████████████████│        │██████████│              │
Refactor   └────────────────┘        └──────────┘

Slack      │                │████████│          │              │
Comms      └────────────────┘────────┘

Design     │                         │          │██████████████│
Review     └─────────────────────────┘          └──────────────┘
```

### Layer 3: Workstream Cards Grid

```
┌─────────────────────────────────────┐  ┌─────────────────────────────────────┐
│ ● Auth System Refactor              │  │ ● Slack Communications              │
│   2h 45m total                      │  │   45m total                         │
│   VS Code · Terminal · Chrome       │  │   Slack · Mail                      │
│   09:00-10:45, 11:30-12:26          │  │   10:45-11:30                       │
└─────────────────────────────────────┘  └─────────────────────────────────────┘
```

### Layer 4: Segment Detail Panel

Expandable panel showing screenshots and activity log for selected workstream.

### Layer 5: Bottom Legend

Clickable color dots for workstream selection.

---

## File Structure

```
packages/shared/src/
└── workstream.ts                    # Shared types (backend + frontend)

apps/backend/src/
├── routes/
│   └── monitoring.ts                # API endpoint
└── services/
    ├── workstream-detection.service.ts   # Workstream name detection
    └── workstream-aggregation.service.ts # Grouping + stats calculation

apps/electron/src/renderer/console/src/
├── services/
│   └── monitoringService.ts         # API client + types
└── components/views/employee/MonitoringView/SessionTimeline/
    ├── index.tsx                    # Main container
    ├── SessionStats.tsx             # Layer 1
    ├── SwimlanesTimeline.tsx        # Layer 2
    ├── WorkstreamCardsGrid.tsx      # Layer 3
    ├── WorkstreamCard.tsx           # Individual card
    ├── SegmentDetailPanel.tsx       # Layer 4
    ├── ScreenshotCarousel.tsx       # Screenshot viewer
    ├── ActivityLogList.tsx          # Activity list
    ├── hooks/
    │   └── useSessionWorkstreams.ts # Backend API hook
    └── utils/
        ├── types.ts                 # Frontend-specific types
        ├── workstreamTransform.ts   # Client-side transform (fallback)
        └── formatDuration.ts        # Duration formatting
```

---

## Configuration

### Detection Configuration

```typescript
// apps/backend/src/services/workstream-detection.service.ts

const CONFIG = {
  communicationApps: ["slack", "teams", "mail", "outlook", "messages", "discord"],
  meetingApps: ["zoom", "meet", "webex", "facetime"],
  deepWorkApps: ["code", "vscode", "intellij", "webstorm", "terminal", "iterm", "figma", "xd"],
};
```

### Aggregation Configuration

```typescript
// apps/backend/src/services/workstream-aggregation.service.ts

const CONFIG = {
  maxGapMinutes: 10, // Gap threshold for splitting segments
};
```

---

## Performance Considerations

### Backend

- **Database Query**: Single query fetches all captures for a session
- **Aggregation**: O(n) where n = number of captures
- **Target Response Time**: <500ms for sessions with 100+ captures

### Frontend

- **Caching**: React Query caches workstream data for 30 seconds
- **Memoization**: Transform functions use `useMemo` to prevent recalculation
- **Fallback**: Client-side transform available if backend is slow/unavailable

---

## Testing

### Unit Tests

```bash
# Backend services
npm test -w @mitable/backend -- --testPathPattern=workstream

# Frontend transform
npm test -w @mitable/electron -- --testPathPattern=workstreamTransform
```

### Integration Testing

1. Start a monitoring session with Linear issue context
2. Work across multiple apps (VS Code, Terminal, Slack)
3. End session and verify workstream grouping
4. Check that stats calculate correctly

### API Testing

```bash
# Fetch workstreams for a session
curl -X GET "http://localhost:3000/api/monitoring/sessions/{sessionId}/workstreams" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json"
```

---

## Future Enhancements (Phase 2+)

1. **AI-Powered Detection**: Use LLM to better classify workstreams based on content
2. **Linear Integration**: Auto-detect Linear issues from commits/PRs
3. **Workstream Persistence**: Store workstream assignments in database
4. **Custom Workstream Names**: Allow users to rename/merge workstreams
5. **Time Filtering**: Filter timeline by date range
6. **Export**: Generate PDF/Markdown reports per workstream
