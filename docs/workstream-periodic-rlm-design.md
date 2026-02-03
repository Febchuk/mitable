# Periodic RLM Workstream Detection - Design Document

## Overview

Real-time intelligent workstream grouping using periodic RLM re-evaluation during active sessions. Provides accurate, semantically-aware workstream assignments as the user works.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CAPTURE FLOW                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Every 10 seconds: New capture arrives                                 │
│        │                                                                │
│        ▼                                                                │
│   ┌─────────────────────────────────────────┐                          │
│   │ Quick Heuristic Assignment (immediate)  │                          │
│   │ - Pattern matching for instant feedback │                          │
│   │ - Marked as "provisional"               │                          │
│   └─────────────────────────────────────────┘                          │
│        │                                                                │
│        ▼                                                                │
│   Capture stored with provisional workstream                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RLM RE-EVALUATION TRIGGER                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Trigger Conditions (whichever comes first):                          │
│   ├── Every 10 new captures                                            │
│   ├── Every 3 minutes of session time                                  │
│   └── On significant context switch (app category change)              │
│                                                                         │
│   Debounce: Minimum 60 seconds between RLM calls                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       RLM ANALYSIS                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Input:                                                                │
│   ├── All captures since last analysis (or all if first run)           │
│   ├── Current workstream state                                         │
│   ├── Session goal (Linear issue if set)                               │
│   └── Activity descriptions from classifier                            │
│                                                                         │
│   RLM Tasks:                                                            │
│   ├── Assign new captures to workstreams                               │
│   ├── Merge related workstreams                                        │
│   ├── Split unrelated captures                                         │
│   ├── Generate/update workstream names                                 │
│   └── Update workstream summaries                                      │
│                                                                         │
│   Output:                                                               │
│   ├── Updated workstream assignments for all captures                  │
│   ├── Workstream metadata (names, summaries, categories)               │
│   └── Confidence scores                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     UPDATE & BROADCAST                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   1. Update database with new assignments                              │
│   2. Broadcast via WebSocket to connected clients                      │
│   3. Frontend updates timeline visualization                           │
│   4. Smooth animation for workstream changes                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Trigger Logic

```typescript
// services/workstream-rlm.service.ts

interface RLMTriggerState {
  lastAnalysisAt: number;
  capturesSinceLastAnalysis: number;
  isAnalyzing: boolean;
}

const TRIGGER_CONFIG = {
  captureThreshold: 10, // Trigger after 10 new captures
  timeThresholdMs: 180000, // Trigger after 3 minutes
  minIntervalMs: 60000, // Minimum 60s between calls (debounce)
  contextSwitchTrigger: true, // Trigger on app category change
};

function shouldTriggerAnalysis(state: RLMTriggerState, capture: Capture): boolean {
  if (state.isAnalyzing) return false;

  const timeSinceLastAnalysis = Date.now() - state.lastAnalysisAt;
  if (timeSinceLastAnalysis < TRIGGER_CONFIG.minIntervalMs) return false;

  // Trigger conditions
  if (state.capturesSinceLastAnalysis >= TRIGGER_CONFIG.captureThreshold) return true;
  if (timeSinceLastAnalysis >= TRIGGER_CONFIG.timeThresholdMs) return true;
  if (isContextSwitch(capture) && TRIGGER_CONFIG.contextSwitchTrigger) return true;

  return false;
}

function isContextSwitch(capture: Capture): boolean {
  // Detect switches between: dev → comms, comms → meeting, etc.
  const prevCategory = getAppCategory(previousCapture?.appName);
  const currCategory = getAppCategory(capture.appName);
  return prevCategory !== currCategory;
}
```

---

## RLM Prompt (Incremental Analysis)

```typescript
const buildIncrementalPrompt = (
  newCaptures: Capture[],
  existingWorkstreams: Workstream[],
  sessionContext: SessionContext
) => `
You are continuously analyzing a work session to maintain accurate workstream groupings.

## Session Context
- Goal: ${sessionContext.linearIssueTitle || "General work session"}
- Session Duration: ${sessionContext.duration}
- Analysis #${sessionContext.analysisCount}

## Current Workstreams
${existingWorkstreams
  .map(
    (w) => `
### ${w.name} (${w.id})
- Captures: ${w.captureCount}
- Duration: ${w.totalDurationMinutes} min
- Apps: ${w.appsUsed.join(", ")}
- Summary: ${w.summary}
- Category: ${w.category}
`
  )
  .join("\n")}

## New Activities Since Last Analysis
${newCaptures
  .map(
    (c, i) => `
[${c.id}] ${formatTime(c.capturedAt)}
  App: ${c.appName}
  Window: ${c.windowTitle}
  Activity: ${c.activityDescription}
  Provisional Assignment: ${c.provisionalWorkstream}
`
  )
  .join("\n")}

## Your Task

1. ASSIGN each new capture to the most appropriate workstream (existing or new)
2. MERGE workstreams if they represent the same logical task
3. RENAME workstreams if better names emerge from context
4. UPDATE summaries to reflect new activities

Guidelines:
- Prefer merging over creating new workstreams (aim for 3-6 total)
- "Communications" and "Meetings" should stay separate from development work
- Use the session goal to inform workstream naming when relevant
- Be consistent with previous assignments unless clearly wrong

## Output Format

{
  "assignments": {
    "<captureId>": "<workstreamId or 'new:Workstream Name'>"
  },
  "workstreams": {
    "<workstreamId>": {
      "name": "Updated or same name",
      "summary": "Updated summary including new activities",
      "category": "development|communication|meeting|research|review|other"
    }
  },
  "merges": [
    { "from": "<workstreamId>", "into": "<workstreamId>", "reason": "why" }
  ],
  "newWorkstreams": [
    {
      "id": "new-1",
      "name": "Workstream Name",
      "summary": "Initial summary",
      "category": "development"
    }
  ]
}
`;
```

---

## Service Implementation

```typescript
// services/workstream-rlm.service.ts

import { llmService } from "./llm.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, gt } from "drizzle-orm";
import { EventEmitter } from "events";

interface WorkstreamUpdate {
  sessionId: string;
  workstreams: Workstream[];
  assignments: Map<string, string>;
  timestamp: number;
}

class WorkstreamRLMService extends EventEmitter {
  private analysisStates = new Map<string, RLMTriggerState>();
  private analysisQueue = new Map<string, Promise<void>>();

  /**
   * Called after each capture is stored
   */
  async onCaptureAdded(sessionId: string, capture: Capture): Promise<void> {
    const state = this.getOrCreateState(sessionId);
    state.capturesSinceLastAnalysis++;

    if (this.shouldTriggerAnalysis(state, capture)) {
      // Don't await - run in background
      this.triggerAnalysis(sessionId).catch((err) => {
        console.error(`[WorkstreamRLM] Analysis failed for ${sessionId}:`, err);
      });
    }
  }

  /**
   * Trigger RLM analysis for a session
   */
  async triggerAnalysis(sessionId: string): Promise<void> {
    const state = this.getOrCreateState(sessionId);

    // Prevent concurrent analyses for same session
    if (state.isAnalyzing) {
      return;
    }

    // Check if already queued
    if (this.analysisQueue.has(sessionId)) {
      return this.analysisQueue.get(sessionId);
    }

    const analysisPromise = this.runAnalysis(sessionId, state);
    this.analysisQueue.set(sessionId, analysisPromise);

    try {
      await analysisPromise;
    } finally {
      this.analysisQueue.delete(sessionId);
    }
  }

  private async runAnalysis(sessionId: string, state: RLMTriggerState): Promise<void> {
    state.isAnalyzing = true;
    const startTime = Date.now();

    try {
      // 1. Fetch session context
      const session = await this.fetchSession(sessionId);
      if (!session || session.status !== "active") {
        return;
      }

      // 2. Fetch captures since last analysis
      const newCaptures = await this.fetchNewCaptures(sessionId, state.lastAnalysisAt);
      if (newCaptures.length === 0) {
        return;
      }

      // 3. Fetch current workstreams
      const existingWorkstreams = await this.fetchWorkstreams(sessionId);

      // 4. Build and send RLM prompt
      const prompt = this.buildIncrementalPrompt(newCaptures, existingWorkstreams, session);
      const response = await llmService.analyze(prompt, {
        model: "gpt-4o-mini", // Fast + cheap for incremental analysis
        temperature: 0.3,
        maxTokens: 2000,
      });

      // 5. Parse and validate response
      const analysis = this.parseAnalysisResponse(response);

      // 6. Apply updates to database
      await this.applyUpdates(sessionId, analysis, newCaptures);

      // 7. Emit update event for WebSocket broadcast
      const updatedWorkstreams = await this.fetchWorkstreams(sessionId);
      this.emit("workstreamsUpdated", {
        sessionId,
        workstreams: updatedWorkstreams,
        timestamp: Date.now(),
      } as WorkstreamUpdate);

      // 8. Update state
      state.lastAnalysisAt = Date.now();
      state.capturesSinceLastAnalysis = 0;

      console.log(
        `[WorkstreamRLM] Analysis completed for ${sessionId} in ${Date.now() - startTime}ms`
      );
    } catch (error) {
      console.error(`[WorkstreamRLM] Analysis error:`, error);
      throw error;
    } finally {
      state.isAnalyzing = false;
    }
  }

  private async applyUpdates(
    sessionId: string,
    analysis: AnalysisResult,
    captures: Capture[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Handle merges first
      for (const merge of analysis.merges) {
        await tx
          .update(schema.sessionCaptures)
          .set({ workstreamId: merge.into })
          .where(eq(schema.sessionCaptures.workstreamId, merge.from));

        await tx
          .delete(schema.sessionWorkstreams)
          .where(eq(schema.sessionWorkstreams.id, merge.from));
      }

      // 2. Create new workstreams
      for (const newWs of analysis.newWorkstreams) {
        await tx.insert(schema.sessionWorkstreams).values({
          id: newWs.id,
          sessionId,
          name: newWs.name,
          summary: newWs.summary,
          category: newWs.category,
          color: this.assignColor(newWs.id),
        });
      }

      // 3. Update existing workstreams
      for (const [wsId, updates] of Object.entries(analysis.workstreams)) {
        await tx
          .update(schema.sessionWorkstreams)
          .set({
            name: updates.name,
            summary: updates.summary,
            category: updates.category,
            updatedAt: new Date(),
          })
          .where(eq(schema.sessionWorkstreams.id, wsId));
      }

      // 4. Assign captures to workstreams
      for (const [captureId, workstreamId] of Object.entries(analysis.assignments)) {
        const wsId = workstreamId.startsWith("new:")
          ? analysis.newWorkstreams.find((w) => w.name === workstreamId.slice(4))?.id
          : workstreamId;

        await tx
          .update(schema.sessionCaptures)
          .set({
            workstreamId: wsId,
            workstreamProvisional: false,
          })
          .where(eq(schema.sessionCaptures.id, captureId));
      }
    });
  }

  /**
   * Force immediate analysis (e.g., when user opens timeline view)
   */
  async forceAnalysis(sessionId: string): Promise<void> {
    const state = this.getOrCreateState(sessionId);
    state.capturesSinceLastAnalysis = Infinity; // Force trigger
    await this.triggerAnalysis(sessionId);
  }

  /**
   * Final analysis at session end (more thorough)
   */
  async finalAnalysis(sessionId: string): Promise<void> {
    // Use more comprehensive prompt for final analysis
    // Include all captures, generate final summaries
    // Mark all workstreams as "final" (not provisional)
  }
}

export const workstreamRLMService = new WorkstreamRLMService();
```

---

## Database Schema Changes

```sql
-- New table: session_workstreams
CREATE TABLE session_workstreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES monitoring_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,  -- 'violet', 'blue', 'pink', etc.
  summary TEXT,
  category TEXT,  -- 'development', 'communication', 'meeting', etc.
  is_final BOOLEAN DEFAULT FALSE,  -- True after session ends
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_session_workstreams_session ON session_workstreams(session_id);

-- Add to session_captures
ALTER TABLE session_captures
  ADD COLUMN workstream_id UUID REFERENCES session_workstreams(id),
  ADD COLUMN workstream_provisional BOOLEAN DEFAULT TRUE;

CREATE INDEX idx_session_captures_workstream ON session_captures(workstream_id);
```

---

## WebSocket Integration

```typescript
// Real-time updates to connected clients

// In main.ts or socket handler
workstreamRLMService.on("workstreamsUpdated", (update: WorkstreamUpdate) => {
  // Broadcast to all clients watching this session
  io.to(`session:${update.sessionId}`).emit("workstreams:updated", {
    workstreams: update.workstreams,
    timestamp: update.timestamp,
  });
});

// Frontend subscription
useEffect(() => {
  const socket = io(API_URL);
  socket.emit("subscribe", { sessionId });

  socket.on("workstreams:updated", (data) => {
    // Update local state with new workstreams
    queryClient.setQueryData(["session-workstreams", sessionId], data.workstreams);
  });

  return () => socket.disconnect();
}, [sessionId]);
```

---

## Frontend Updates

```typescript
// Smooth transitions when workstreams change

function SwimlanesTimeline({ workstreams }) {
  return (
    <AnimatePresence mode="popLayout">
      {workstreams.map((ws) => (
        <motion.div
          key={ws.id}
          layout
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <WorkstreamLane workstream={ws} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

// Show "analyzing" indicator
function WorkstreamCard({ workstream, isAnalyzing }) {
  return (
    <div className={cn(
      "border rounded-lg p-4",
      workstream.isProvisional && "border-dashed opacity-80"
    )}>
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${colorMap[workstream.color].bg}`} />
        <span className="font-medium">{workstream.name}</span>
        {isAnalyzing && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {workstream.isProvisional && (
          <span className="text-xs text-muted-foreground">(analyzing...)</span>
        )}
      </div>
    </div>
  );
}
```

---

## API Endpoints

```typescript
// GET /api/monitoring/sessions/:id/workstreams
// Returns current workstreams with real-time subscription info

// POST /api/monitoring/sessions/:id/workstreams/analyze
// Force immediate RLM analysis (called when user opens timeline)

// WebSocket: session:workstreams:updated
// Real-time updates when workstreams change
```

---

## Performance Considerations

### RLM Call Optimization

```typescript
// Use gpt-4o-mini for incremental (fast, cheap)
// Use gpt-4o for final analysis (thorough)

const MODEL_CONFIG = {
  incremental: {
    model: "gpt-4o-mini",
    maxTokens: 1500,
    temperature: 0.3,
  },
  final: {
    model: "gpt-4o",
    maxTokens: 3000,
    temperature: 0.2,
  },
};
```

### Caching

```typescript
// Cache workstream state in memory during active session
// Only hit database for persistence
// Use Redis for multi-instance deployments
```

### Batching

```typescript
// If multiple captures arrive quickly, batch them
// Only send one RLM request with all new captures
```

---

## Implementation Timeline

### Week 1: Core Infrastructure

- Day 1: Database schema changes + migrations
- Day 2: WorkstreamRLMService skeleton + trigger logic
- Day 3: RLM prompt design + testing
- Day 4: Database update logic + transactions
- Day 5: Integration with capture flow

### Week 2: Real-time Updates

- Day 1: WebSocket integration
- Day 2: Frontend subscription + state management
- Day 3: Animation + UI polish
- Day 4: Force analysis endpoint + final analysis
- Day 5: Testing + edge cases

### Week 3: Polish

- Day 1-2: Performance optimization
- Day 3: Error handling + retry logic
- Day 4: Monitoring + logging
- Day 5: Documentation

---

## Cost Estimate (Revised)

Using gpt-4o-mini for incremental analysis:

| Session Length | Analyses | Input Tokens | Output Tokens | Cost   |
| -------------- | -------- | ------------ | ------------- | ------ |
| 30 min         | ~10      | ~15,000      | ~5,000        | ~$0.01 |
| 1 hour         | ~20      | ~30,000      | ~10,000       | ~$0.02 |
| 2 hours        | ~40      | ~60,000      | ~20,000       | ~$0.04 |
| 4 hours        | ~80      | ~120,000     | ~40,000       | ~$0.08 |

**Monthly estimate**: ~$50-100/month per active user (20 sessions/day)

Still very reasonable for the value provided.

---

## Summary

Periodic RLM provides:

- **Real-time intelligent grouping** as user works
- **Self-correcting workstreams** that improve over time
- **Semantic understanding** of activity relationships
- **Smooth UI updates** via WebSocket

The extra complexity is worth it for the significantly better user experience.
