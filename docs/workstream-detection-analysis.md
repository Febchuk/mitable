# Workstream Detection Analysis & Recommendations

## Current Approach: Heuristic-Based Detection

### How It Works Now

Each capture is assigned to a workstream **independently** using pattern matching:

```
Capture 1: "[mitable] auth.ts - VS Code"     → "mitable" (window title pattern)
Capture 2: "Terminal (feature/auth-refactor)" → "auth-refactor" (git branch)
Capture 3: "JWT best practices - Chrome"      → "Google Chrome" (fallback to app)
Capture 4: "Slack - #engineering"             → "Communications" (app category)
Capture 5: "[mitable] auth.test.ts - VS Code" → "mitable" (window title pattern)
```

### Problems with Current Approach

| Problem | Example | Impact |
|---------|---------|--------|
| **No semantic understanding** | "JWT best practices" browsing is clearly related to "auth.ts" editing, but gets separate workstream | Over-fragmentation |
| **Inconsistent naming** | `mitable` vs `Mitable` vs `mitable-app` could be 3 workstreams | Duplicate workstreams |
| **No temporal reasoning** | Doesn't know that 5 minutes of research followed by 30 minutes of coding are the same task | Poor grouping |
| **Static assignment** | Once assigned, never reconsidered even if context changes | Can't self-correct |
| **Context-blind** | Doesn't use the `activityDescription` from AI classifier | Wastes available intelligence |

### Current Detection Priority

```
1. Linear Issue (session goal)     → 95% confidence
2. [project-name] in title         → 85% confidence
3. File path parent folder         → 75% confidence
4. Git branch in terminal          → 80% confidence
5. Communication apps              → 90% confidence (hardcoded)
6. Meeting apps                    → 90% confidence (hardcoded)
7. Design tool file name           → 70% confidence
8. Fallback: App name              → 50% confidence
```

---

## The Problem Visualized

### What We Get Now (Fragmented)

```
Timeline:  09:00    09:30    10:00    10:30    11:00
           ─────────────────────────────────────────

mitable       [████████]              [████████████]
              VS Code                  VS Code

auth-refactor        [████]
                     Terminal

Chrome                    [████████]
                          Research

Communications                              [████]
                                            Slack
```

**Result**: 4 workstreams when it should be 2 (Auth work + Communications)

### What We Want (Intelligent Grouping)

```
Timeline:  09:00    09:30    10:00    10:30    11:00
           ─────────────────────────────────────────

Auth System    [████████████████████████████████████]
Refactor       VS Code → Terminal → Chrome → VS Code
               "All related to implementing JWT auth"

Communications                              [████]
                                            Slack
```

---

## Options for Improvement

### Option A: Enhanced Heuristics (No AI)

**Approach**: Improve pattern matching and add temporal clustering

```typescript
// Temporal clustering: activities within 5 min of same app → merge
// Project name normalization: mitable, Mitable, mitable-app → "Mitable"
// Cross-app linking: if git branch matches project name → same workstream
```

**Pros**:
- Fast (no API calls)
- Free (no AI costs)
- Predictable behavior

**Cons**:
- Still can't understand semantics ("JWT research" → "auth work")
- Requires extensive rule maintenance
- Limited improvement ceiling

**Effort**: Low (1-2 days)
**Impact**: Moderate

---

### Option B: RLM Re-evaluation at Session End

**Approach**: After session ends, use LLM to analyze all captures and reassign workstreams

```typescript
// At session end, send to RLM:
const prompt = `
Given these ${captures.length} activities from a work session:

${captures.map(c => `
- ${c.capturedAt}: ${c.appName} - "${c.windowTitle}"
  Activity: ${c.activityDescription}
`).join('\n')}

Session Goal: "${session.linearIssueTitle || 'Not specified'}"

Group these into logical workstreams. A workstream is a coherent unit of work
(e.g., "Implementing JWT authentication", "Code review for PR #123").

Return JSON:
{
  "workstreams": [
    {
      "name": "Descriptive name",
      "captureIds": ["id1", "id2", ...],
      "summary": "Brief description of what was accomplished"
    }
  ]
}
`;
```

**Pros**:
- Semantic understanding (knows JWT research relates to auth coding)
- Can infer workstream names from activity patterns
- Uses existing activityDescription data
- One-time cost per session

**Cons**:
- Only runs at session end (no real-time benefit)
- API cost (~$0.01-0.05 per session depending on length)
- Adds latency to session end flow

**Effort**: Medium (2-3 days)
**Impact**: High

---

### Option C: Periodic RLM Re-evaluation During Session

**Approach**: Every N captures (e.g., 10) or every M minutes (e.g., 5), re-evaluate recent activity

```typescript
// Every 10 captures or 5 minutes:
const recentCaptures = captures.slice(-20); // Last 20 captures

const prompt = `
Recent activities in this work session:
${formatCaptures(recentCaptures)}

Current workstreams:
${currentWorkstreams.map(w => `- ${w.name}: ${w.captureCount} activities`).join('\n')}

Should any recent activities be reassigned to different workstreams?
Should any workstreams be merged?

Return reassignments as JSON.
`;
```

**Pros**:
- Near real-time intelligent grouping
- Can show accurate workstreams during active session
- Self-correcting as context emerges

**Cons**:
- Higher API costs (multiple calls per session)
- Complexity of handling reassignments mid-session
- UI needs to handle workstream changes gracefully

**Effort**: High (4-5 days)
**Impact**: Very High

---

### Option D: Embedding-Based Clustering

**Approach**: Use embeddings to cluster semantically similar activities

```typescript
// 1. Generate embeddings for each capture's activity
const embeddings = await Promise.all(
  captures.map(c => embedService.embed(
    `${c.appName}: ${c.windowTitle} - ${c.activityDescription}`
  ))
);

// 2. Cluster using DBSCAN or k-means
const clusters = clusterEmbeddings(embeddings, {
  minClusterSize: 3,
  maxDistance: 0.3,
});

// 3. Name clusters using LLM (one call for all clusters)
const workstreamNames = await llm.nameWorkstreams(clusters);
```

**Pros**:
- Mathematically principled grouping
- Leverages existing embedding infrastructure
- Can handle large sessions efficiently

**Cons**:
- Clustering algorithms need tuning
- Still needs LLM for naming
- May produce non-intuitive groupings

**Effort**: Medium-High (3-4 days)
**Impact**: High

---

### Option E: Hybrid Approach (Recommended)

**Approach**: Combine heuristics for real-time + RLM for refinement

```
┌─────────────────────────────────────────────────────────────────┐
│                     DURING SESSION (Real-time)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Capture → Heuristic Detection → Provisional Workstream         │
│                                                                 │
│  - Fast pattern matching                                        │
│  - Temporal clustering (merge if same app within 5 min)         │
│  - Linear issue context if available                            │
│                                                                 │
│  Display: "Auth Work (provisional)" with dotted border          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AT SESSION END (Refinement)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  All Captures + Activity Descriptions → RLM Analysis            │
│                                                                 │
│  RLM Tasks:                                                     │
│  1. Merge related workstreams (auth-refactor + mitable → Auth)  │
│  2. Split unrelated captures (random browsing → separate)       │
│  3. Generate intelligent names ("JWT Authentication System")    │
│  4. Add workstream summaries for each                           │
│                                                                 │
│  Display: Final workstreams with solid borders                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**:

```typescript
// 1. During session: Use enhanced heuristics
function detectWorkstreamRealtime(capture, recentCaptures) {
  // Existing heuristics
  let assignment = heuristicDetection(capture);

  // Temporal clustering: if same app as last capture within 5 min, merge
  const lastCapture = recentCaptures[recentCaptures.length - 1];
  if (lastCapture &&
      capture.appName === lastCapture.appName &&
      getMinutesDiff(lastCapture.capturedAt, capture.capturedAt) < 5) {
    assignment = lastCapture.workstreamAssignment;
  }

  return { ...assignment, provisional: true };
}

// 2. At session end: RLM refinement
async function refineWorkstreamsWithRLM(sessionId) {
  const captures = await fetchSessionCaptures(sessionId);
  const session = await fetchSession(sessionId);

  const prompt = buildWorkstreamRefinementPrompt(captures, session);
  const refined = await llmService.analyze(prompt);

  // Update captures with final workstream assignments
  await updateCaptureWorkstreams(refined.assignments);

  // Store workstream metadata
  await storeWorkstreamSummaries(sessionId, refined.workstreams);

  return refined;
}
```

**Pros**:
- Best of both worlds
- Real-time feedback (even if provisional)
- High-quality final results
- Single RLM call per session (cost-effective)
- Can show "refinement in progress" state

**Cons**:
- Most complex to implement
- UI needs to handle provisional → final transition

**Effort**: Medium-High (3-4 days)
**Impact**: Very High

---

## Recommendation

### Phase 1 (Current): Enhanced Heuristics
**Already implemented** - temporal clustering, better normalization

### Phase 2 (Recommended Next): RLM Refinement at Session End

**Why this approach**:

1. **Leverages existing infrastructure**: RLM pipeline already exists for story generation
2. **Cost-effective**: One API call per session (~$0.02)
3. **High impact**: Transforms fragmented workstreams into coherent narratives
4. **Non-breaking**: Existing heuristics work as fallback
5. **Enables future features**: Workstream summaries, smart naming, activity insights

**Implementation Plan**:

```
Week 1:
├── Day 1-2: Design RLM prompt for workstream analysis
├── Day 3: Implement workstream refinement service
├── Day 4: Add database fields for refined workstreams
└── Day 5: Integrate with session end flow

Week 2:
├── Day 1-2: Update frontend to show provisional vs final
├── Day 3: Add workstream summaries to UI
├── Day 4: Testing and edge cases
└── Day 5: Documentation and monitoring
```

**Database Changes**:

```sql
-- Add to session_captures
ALTER TABLE session_captures ADD COLUMN workstream_id UUID;
ALTER TABLE session_captures ADD COLUMN workstream_provisional BOOLEAN DEFAULT true;

-- New table for workstream metadata
CREATE TABLE session_workstreams (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES monitoring_sessions(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  summary TEXT,
  capture_count INTEGER,
  total_duration_minutes INTEGER,
  apps_used TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  refined_at TIMESTAMP  -- NULL until RLM refinement
);
```

**API Changes**:

```typescript
// New endpoint for triggering refinement
POST /api/monitoring/sessions/:id/refine-workstreams

// Response includes refinement status
GET /api/monitoring/sessions/:id/workstreams
{
  "workstreams": [...],
  "refinementStatus": "pending" | "complete" | "failed",
  "refinedAt": "2025-01-15T12:00:00Z"
}
```

---

## RLM Prompt Design

### Workstream Refinement Prompt

```
You are analyzing a work session to identify logical workstreams.

## Session Context
- User: ${user.name} (${user.role})
- Session Goal: ${session.linearIssueTitle || "Not specified"}
- Duration: ${session.duration}
- Total Activities: ${captures.length}

## Activities (chronological)

${captures.map((c, i) => `
[${i + 1}] ${formatTime(c.capturedAt)}
    App: ${c.appName}
    Window: ${c.windowTitle}
    Activity: ${c.activityDescription || "No description"}
    Current Assignment: ${c.workstreamName} (${c.workstreamSource})
`).join('\n')}

## Current Workstream Assignments

${workstreams.map(w => `
- "${w.name}" (${w.captureCount} activities, ${w.totalDuration})
  Source: ${w.detectionSource}
`).join('\n')}

## Your Task

Analyze these activities and reorganize them into coherent workstreams.

A workstream should represent a logical unit of work, such as:
- A feature implementation ("Implementing user authentication")
- A bug fix ("Fixing checkout flow bug")
- A review task ("Reviewing PR #234")
- Communication/meetings (can remain as separate workstreams)

Guidelines:
1. MERGE workstreams that are clearly the same task (e.g., coding + related research)
2. SPLIT workstreams if they contain unrelated activities
3. KEEP communication and meetings as separate workstreams
4. Generate DESCRIPTIVE names (not just app names)
5. Maximum 5-7 workstreams per session (consolidate if needed)

## Output Format

Return valid JSON:
{
  "workstreams": [
    {
      "name": "Implementing JWT Authentication",
      "captureIds": [1, 2, 5, 8, 12, ...],
      "summary": "Implemented JWT token validation with refresh logic. Researched best practices and wrote unit tests.",
      "category": "development" | "communication" | "meeting" | "research" | "review" | "other"
    }
  ],
  "reasoning": "Brief explanation of major merge/split decisions"
}
```

### Expected Output

```json
{
  "workstreams": [
    {
      "name": "JWT Authentication Implementation",
      "captureIds": [1, 2, 3, 5, 6, 8, 9, 10],
      "summary": "Implemented JWT authentication system including token validation, refresh logic, and middleware. Researched security best practices on MDN and Stack Overflow.",
      "category": "development"
    },
    {
      "name": "Team Communication",
      "captureIds": [4, 7],
      "summary": "Responded to questions in #engineering channel and discussed auth approach with team lead.",
      "category": "communication"
    }
  ],
  "reasoning": "Merged 'mitable', 'auth-refactor', and Chrome research into single 'JWT Authentication' workstream as all activities were related to the same feature implementation. Kept Slack activities separate as they represent context switches."
}
```

---

## Cost Analysis

### RLM Refinement Cost per Session

| Session Length | Captures | Input Tokens | Output Tokens | Cost (GPT-4) |
|----------------|----------|--------------|---------------|--------------|
| 30 min | ~20 | ~2,000 | ~500 | ~$0.01 |
| 1 hour | ~40 | ~4,000 | ~800 | ~$0.02 |
| 2 hours | ~80 | ~8,000 | ~1,000 | ~$0.04 |
| 4 hours | ~160 | ~16,000 | ~1,500 | ~$0.08 |

**Monthly cost estimate** (assuming 20 sessions/day, 30 days):
- 600 sessions × $0.03 avg = **~$18/month** per active user

This is negligible compared to the value provided.

---

## Summary

| Approach | Effort | Impact | Cost | Recommendation |
|----------|--------|--------|------|----------------|
| Enhanced Heuristics | Low | Moderate | Free | ✅ Already done |
| RLM at Session End | Medium | High | ~$0.03/session | ✅ **Recommended** |
| Periodic RLM | High | Very High | ~$0.15/session | Future consideration |
| Embedding Clustering | Medium-High | High | ~$0.01/session | Alternative approach |
| Hybrid | Medium-High | Very High | ~$0.03/session | Ideal end state |

**My recommendation**: Implement **RLM Refinement at Session End** as the next enhancement. It provides the best ROI - significant improvement in workstream quality with minimal cost and reasonable implementation effort.
