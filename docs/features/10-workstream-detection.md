# 10. Workstream Detection

## Overview

Workstreams group related captures into logical units of work (e.g., "mitable-backend", "Sprint Planning", "Client X Deliverable"). Detection happens at two levels:

1. **Heuristic Detection** (per-capture) — Fast, rule-based detection from window titles and app context
2. **RLM-Based Analysis** (periodic) — AI-powered semantic grouping using Groq, runs periodically during a session

Workstreams power the timeline view in the Console window, showing how time was distributed across different projects and activities.

## Trigger

- **Per-capture**: `WorkstreamDetectionService.detectWorkstream()` called for each new capture
- **Periodic during session**: `WorkstreamRLMService` analyzes accumulated captures and groups them semantically
- **Session aggregation**: `WorkstreamAggregationService` computes final session-level workstream stats

## Flow Diagram

```mermaid
flowchart TB
    subgraph PerCapture["Per-Capture (Heuristic)"]
        CAP[New Capture] --> WDS[WorkstreamDetectionService]
        WDS --> LIN{Linear issue<br/>linked?}
        LIN -->|Yes| LR[Source: linear_issue<br/>Confidence: 0.95]
        LIN -->|No| BRK{Bracket pattern<br/>[project-name]?}
        BRK -->|Yes| BR[Source: window_title<br/>Confidence: 0.85]
        BRK -->|No| PTH{File path<br/>in title?}
        PTH -->|Yes| FP[Source: window_title<br/>Confidence: 0.80]
        PTH -->|No| APP{Deep work<br/>app?}
        APP -->|Yes| DW[Source: app_category<br/>Confidence: 0.70]
        APP -->|No| GEN[General category<br/>Confidence: 0.50]
    end

    subgraph Periodic["Periodic RLM Analysis"]
        ACC[Accumulated captures] --> WSR[WorkstreamRLMService]
        WSR --> |Groq LLM| SEM[Semantic workstream grouping]
        SEM --> |workstream names,<br/>categories, colors| DB[(workstreams table)]
        SEM --> EMIT[WorkstreamSocketEmitter]
        EMIT --> |WebSocket| UI[Console Timeline UI]
    end

    subgraph Aggregation["Session Aggregation"]
        SE[Session End / Query] --> WSA[WorkstreamAggregationService]
        WSA --> |Group captures by workstream| SEG[Time Segments]
        SEG --> |Merge gaps < 2min| STATS[Session Stats]
        STATS --> |totalMinutes, appBreakdown,<br/>workstream distribution| RES[API Response]
    end
```

## Step-by-Step Walkthrough

### Heuristic Detection (Per-Capture)

**File**: `apps/backend/src/domains/workstreams/services/workstream-detection.service.ts`

`detectWorkstream(context: CaptureContext)` returns a `WorkstreamAssignment`:

Priority order:

1. **Linear Issue** (confidence: 0.95)
   - If `linearIssueId` and `linearIssueTitle` are present, use issue title as workstream name
   - Highest confidence because it's explicitly linked by the user

2. **Bracket Pattern** (confidence: 0.85)
   - Matches `[project-name]` in window titles (common in VS Code, terminals)
   - e.g., VS Code title `[mitable] - src/app.ts` → workstream "mitable"

3. **File Path** (confidence: 0.80)
   - Matches `folder/file.ext` patterns in window titles
   - Extracts parent folder as workstream name

4. **App Category** (confidence: 0.70)
   - Deep work apps (VS Code, IntelliJ, Figma): use app name as workstream context
   - Communication apps (Slack, Teams): categorize as "Communication"
   - Meeting apps (Zoom, Meet): categorize as "Meetings"

5. **General** (confidence: 0.50)
   - Fallback: use the app name itself

Each result includes:

```typescript
{
  name: string; // "mitable-backend"
  normalizedName: string; // "mitable_backend" (for grouping)
  source: string; // "linear_issue" | "window_title" | "app_category"
  confidence: number; // 0.50 - 0.95
}
```

### RLM-Based Analysis (Periodic)

**File**: `apps/backend/src/domains/workstreams/services/workstream-rlm.service.ts`

Runs periodically during active sessions using **Groq** for fast inference:

1. **Track captures**: `trackCapture(sessionId, captureData)` accumulates captures in memory
2. **Trigger analysis** when enough new captures have accumulated or app category changes
3. **Fetch unassigned captures** from `session_captures` for the session
4. **Run Groq with workstream prompts** (`workstream-rlm-prompts.ts`):
   - Input: capture timeline with app names, window titles, activity descriptions
   - Output: `WorkstreamAnalysisResult` with named groups
5. **Create/update workstreams** in `workstreams` table:
   - Assign colors from palette (violet, blue, pink, emerald, amber, cyan)
   - Set category: `WorkstreamCategory`
6. **Update captures**: Set `workstreamId` on each classified capture
7. **Emit via WebSocket**: `WorkstreamSocketEmitter` pushes updates to the Console UI

**Analysis state per session**:

```typescript
{
  sessionId: string;
  lastAnalysisAt: number;
  lastAnalysisNumber: number;
  capturesSinceLastAnalysis: number;
  lastCaptureAppCategory: string | null;
  isAnalyzing: boolean;
  colorIndex: number;
}
```

### Session Aggregation

**File**: `apps/backend/src/domains/workstreams/services/workstream-aggregation.service.ts`

Used when rendering the session timeline or computing session stats:

1. **Group captures by workstream** — either from `workstreamId` (RLM-assigned) or heuristic detection
2. **Build time segments** — contiguous time ranges per workstream
3. **Merge gaps** — segments within 2 minutes of each other are merged (prevents micro-gaps)
4. **Calculate stats**:
   - `totalMinutes` per workstream
   - App breakdown within each workstream
   - Overall session statistics (`SessionStats`)
5. Returns `WorkstreamResponse` with workstreams, segments, and stats

## Data Stores

| Table              | Key Fields                                                     |
| ------------------ | -------------------------------------------------------------- |
| `workstreams`      | `id`, `sessionId`, `name`, `category`, `color`, `totalMinutes` |
| `session_captures` | `workstreamId` (FK to workstreams)                             |

## AI Models

| Model | Feature        | Purpose                                                |
| ----- | -------------- | ------------------------------------------------------ |
| Groq  | Workstream RLM | Fast semantic workstream grouping during live sessions |

## Key Files

| File                                                     | Purpose                              |
| -------------------------------------------------------- | ------------------------------------ |
| `workstreams/services/workstream-detection.service.ts`   | Heuristic per-capture detection      |
| `workstreams/services/workstream-rlm.service.ts`         | Periodic RLM-based analysis          |
| `workstreams/services/workstream-aggregation.service.ts` | Session-level grouping and stats     |
| `workstreams/services/workstream-socket-emitter.ts`      | Real-time WebSocket updates          |
| `workstreams/rlm/workstream-rlm-prompts.ts`              | Groq prompts for workstream analysis |
| `workstreams/rlm/workstream-environment.ts`              | RLM environment state                |
| `workstreams/rlm/workstream-tools.ts`                    | RLM tool definitions                 |
| `workstreams/schema/workstreams.schema.ts`               | Workstreams table definition         |

## Configuration

| Constant            | Value                                                        | Purpose                         |
| ------------------- | ------------------------------------------------------------ | ------------------------------- |
| `communicationApps` | slack, teams, mail, outlook, messages, discord               | Categorize as "Communication"   |
| `meetingApps`       | zoom, meet, webex, facetime                                  | Categorize as "Meetings"        |
| `deepWorkApps`      | code, vscode, intellij, webstorm, terminal, iterm, figma, xd | Categorize as deep work         |
| `maxGapMinutes`     | 2                                                            | Merge segments within 2 min gap |
| `WORKSTREAM_COLORS` | violet, blue, pink, emerald, amber, cyan                     | Color palette for workstreams   |
