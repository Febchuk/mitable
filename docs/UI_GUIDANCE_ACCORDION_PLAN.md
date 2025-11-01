# UI Guidance with Accordion - Current State & Improvement Plan

**Last Updated:** Oct 31, 2025  
**Status:** Phase 1 Complete, Phase 2 Planning  
**Related Docs:**

- `ui_guidance_architecture.md` - Original iterative guidance design
- `WORKFLOW_REFACTOR_COMPLETE.md` - Recent separation from messages table

---

## Executive Summary

Mitable's UI Guidance system provides step-by-step visual assistance for completing tasks across any application. After refactoring to separate workflows from chat messages, we've identified architectural issues that need resolution before scaling.

**Current State:** ✅ Workflows separated into dedicated tables  
**Next Phase:** 🔧 Complete the separation, unify types, optimize accordion UX

---

## Architecture Overview

### What We Have Now

```
┌─────────────────────────────────────────────────┐
│             USER INTERACTION                     │
│  Chat → "How do I update the roadmap?"          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│          ORCHESTRATOR SERVICE                    │
│  Routes to VisualGuidanceAgent                  │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│        VISUAL GUIDANCE AGENT                     │
│  1. Searches knowledge (KnowledgeAgent)         │
│  2. Synthesizes workflow with GPT-4             │
│  3. Proposes workflow to user                   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│           USER CONFIRMS                          │
│  Says "yes" → Creates workflow_session          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│         WORKFLOW EXECUTION                       │
│  ┌──────────────────────────────────┐           │
│  │  workflow_sessions               │           │
│  │  - id, status, solution          │           │
│  │  - currentStepIndex              │           │
│  │  - workflowData (JSON)           │           │
│  └──────────────────────────────────┘           │
│  ┌──────────────────────────────────┐           │
│  │  workflow_interactions           │           │
│  │  - user questions                │           │
│  │  - AI responses                  │           │
│  │  - step progressions             │           │
│  └──────────────────────────────────┘           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│        FRONTEND ACCORDION                        │
│  Polls workflow API every 2s                    │
│  Renders steps, Q&A, interactions               │
└─────────────────────────────────────────────────┘
```

---

## Current Implementation Details

### Backend Components

**1. Database Tables**

```sql
-- Source of truth for workflow state
workflow_sessions (
  id, organization_id, conversation_id, user_id,
  solution, solution_explanation, search_query,
  status (active/completed/cancelled),
  current_step_index,
  workflow_data JSONB,  -- Full SolutionObject
  steps_modified, last_step_modified_at,
  created_at, updated_at
)

-- All interactions within workflow
workflow_interactions (
  id, workflow_session_id,
  type (step_progress/user_question/ai_response/step_modified/workflow_complete),
  role (user/assistant/system),
  content, related_step_index,
  metadata JSONB, created_at
)
```

**2. Services**

- `workflow.service.ts` - CRUD operations on workflow tables
- `guideGeneration.service.ts` - Retrieves workflow state for orchestrator
- `orchestrator.service.ts` - Routes messages to appropriate agents

**3. Agents**

- `visual-guidance.agent.ts` - Handles workflow creation, progression, Q&A
- `knowledge.agent.ts` - Searches company docs for workflow context

**4. API Routes**

- `GET /api/workflows/conversation/:conversationId/active` - Fetch active workflow + interactions
- `POST /api/workflows/:workflowId/cancel` - Cancel workflow

### Frontend Components

**1. Hooks**

- `useWorkflow.ts` - Polls backend every 2s for workflow updates

**2. Components**

- `WorkflowAccordion.tsx` - Main workflow UI (steps, Q&A, options)
- `WorkflowOptions.tsx` - Action buttons (Continue, Ask Question, Exit)
- `App.tsx` - Renders accordion alongside chat messages

**3. Data Flow**

```typescript
useWorkflow(conversationId)
  → polls /api/workflows/conversation/:id/active
  → returns { workflow, interactions }
  → WorkflowAccordion renders
```

---

## Issues Identified (Oct 31, 2025)

### 🔴 Critical Issue #1: Dual Storage Creates Bugs

**Problem:** Workflows are stored in BOTH places:

1. `workflow_sessions` table (source of truth)
2. `messages` table (duplicate data from legacy system)

**Bug Found:** When workflow completes, `retrieveLatestSolutionObject()` was checking `messages` table instead of `workflow_sessions`, causing orchestrator to think workflow was still active.

**Symptoms:**

- User completes/exits workflow
- Asks normal question
- System keeps routing to VisualGuidanceAgent
- Workflow accordion keeps appearing

**Fix Applied:** Changed `retrieveLatestSolutionObject()` to check `workflow_sessions.status === "active"`

**Root Cause:** Incomplete migration from messages-based to sessions-based storage

### 🟡 Issue #2: Type Fragmentation

**Problem:** Different field names in different places:

- `workflow_sessions.workflowData` uses `stepDescription`
- Shared `SolutionObject` type uses `description`
- Frontend expects `description`

**Current Workaround:** Manual transformation in `retrieveLatestSolutionObject()`

```typescript
stepList: workflowData.stepList.map((step) => ({
  stepNumber: step.stepNumber,
  description: step.description || step.stepDescription, // ⚠️ Hacky
  status: step.status,
}));
```

**Impact:**

- Maintenance burden
- Type safety compromised
- Future bugs likely

### 🟡 Issue #3: Accordion UX Limitations

**Current State:**

```
┌─────────────────────────────────┐
│  WORKFLOW ACCORDION             │
│  ┌─────────────────────────┐   │
│  │ Completed Steps         │   │  ← Good
│  │ - Step 1 ✓              │   │
│  │ - Step 2 ✓              │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ Current Step            │   │  ← Good
│  │ → Step 3                │   │
│  │   AI: Here's how...     │   │  ← Tied to step
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ Remaining Steps         │   │  ← Good
│  │ - Step 4                │   │
│  │ - Step 5                │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

**Missing:**

- Space for AI messages that aren't tied to a specific step
- Example: "I can't see your Slack screen right now, but here are the steps"
- Example: General troubleshooting advice during workflow
- Example: Context switches ("Looks like you switched to a different app")

**User Request:**

> "I want a space for the UI to say, hey, I can't see your Slack screen right now, but here are the steps. I also want normal AI messages that are not related to the steps, like about it seeing your screen or something."

---

## Phase 2: Improvement Plan

### Goal

Complete the separation of workflows from messages, unify types, and optimize accordion UX for a truly independent workflow experience.

### Timeline

- **Phase 2A:** Remove dual storage (2-3 hours)
- **Phase 2B:** Unify types (1 hour)
- **Phase 2C:** Add AI message space in accordion (2-3 hours)

---

## Phase 2A: Remove Dual Storage

### Objective

Workflows should ONLY exist in `workflow_sessions` + `workflow_interactions`. No workflow data in `messages` table.

### Changes Required

**1. Stop Writing Workflows to Messages**

Files to modify:

- `apps/backend/src/agents/visual-guidance.agent.ts`
- `apps/backend/src/tools/start-ui-guidance-workflow.tool.ts`
- `apps/backend/src/tools/guide-next-step.tool.ts`

Current behavior:

```typescript
// ❌ BAD - Creates message with workflow cardData
yield {
  type: "complete",
  messageType: "workflow",  // This saves to messages table
  content: "Perfect! Let's get started with step 1.",
  cardData: { ...solutionObject }
};
```

New behavior:

```typescript
// ✅ GOOD - Only saves to workflow_sessions
await workflowService.createWorkflowSession(...);
yield {
  type: "complete",
  messageType: "text",  // Regular message, no cardData
  content: "Perfect! Let's get started with step 1."
};
```

**2. Remove Deprecated Methods**

Delete from `guideGeneration.service.ts`:

- `storeSolutionObject()` - No longer needed
- `retrieveSolutionObject()` - No longer needed
- `updateSolutionObject()` - No longer needed

Keep only:

- `retrieveLatestSolutionObject()` - Checks `workflow_sessions` for active workflows

**3. Update Frontend**

`App.tsx` changes:

```typescript
// ❌ OLD - Render accordion based on message.cardData
{messages.map(msg => {
  if (msg.messageType === "workflow") {
    return <WorkflowAccordion cardData={msg.cardData} />;
  }
})}

// ✅ NEW - Render accordion based on workflow API
{workflowData.workflow && (
  <WorkflowAccordion
    workflow={workflowData.workflow}
    interactions={workflowData.interactions}
  />
)}
```

**4. Database Cleanup (Optional)**

Add migration to remove old workflow messages:

```sql
-- Clean up legacy workflow messages
DELETE FROM messages
WHERE message_type = 'workflow';
```

### Success Criteria

- ✅ No `messageType: "workflow"` anywhere in codebase
- ✅ Accordion renders only from workflow API
- ✅ Chat messages completely independent from workflows
- ✅ Tests pass

---

## Phase 2B: Unify Types

### Objective

Single source of truth for workflow data structures. No more field name mismatches.

### Changes Required

**1. Update Workflow Schema**

`apps/backend/src/services/workflow.service.ts`:

```typescript
// Change from:
export interface SolutionObject {
  stepList: Array<{
    stepNumber: number;
    stepDescription: string; // ❌ Wrong name
    status: "pending" | "current" | "completed";
  }>;
}

// To:
export interface SolutionObject {
  stepList: Array<{
    stepNumber: number;
    description: string; // ✅ Consistent
    status: "pending" | "current" | "completed";
  }>;
}
```

**2. Update All References**

Search and replace in:

- `visual-guidance.agent.ts`
- `start-ui-guidance-workflow.tool.ts`
- `guide-next-step.tool.ts`
- Any tool that creates/modifies steps

**3. Database Migration**

```sql
-- Update existing workflow_data JSONB structure
UPDATE workflow_sessions
SET workflow_data = jsonb_set(
  workflow_data,
  '{stepList}',
  (
    SELECT jsonb_agg(
      jsonb_set(
        step,
        '{description}',
        step->'stepDescription'
      ) - 'stepDescription'
    )
    FROM jsonb_array_elements(workflow_data->'stepList') AS step
  )
)
WHERE workflow_data->'stepList' IS NOT NULL;
```

**4. Remove Transformation Logic**

Delete from `guideGeneration.service.ts`:

```typescript
// ❌ DELETE - No longer needed
stepList: (workflowData.stepList || []).map((step: any) => ({
  stepNumber: step.stepNumber,
  description: step.description || step.stepDescription,
  status: step.status,
}));
```

### Success Criteria

- ✅ Single `description` field everywhere
- ✅ No transformation logic needed
- ✅ TypeScript compiles without `as any` casts
- ✅ Existing workflows migrated

---

## Phase 2C: AI Message Space in Accordion

### Objective

Add dedicated space in accordion for AI messages that aren't tied to specific steps.

### Use Cases

**1. Screen Visibility Issues**

```
AI: "I can't see your Slack screen right now. Here are the steps you can follow:
     1. Open Slack
     2. Click #product-roadmap channel
     3. Look for the Canvas icon at the top"
```

**2. Context Switches**

```
AI: "I notice you switched to your browser. That's fine! The next step
     is to open Slack again."
```

**3. Troubleshooting**

```
User: "I don't see the button you mentioned"
AI: "Let me help debug this. Can you try:
     - Refreshing the page
     - Checking if you're logged in
     - Making sure you have the right permissions"
```

**4. General Q&A During Workflow**

```
User: "Why do we use Canvas instead of regular Slack messages?"
AI: "Great question! Canvas allows for..."
     (This isn't about a specific step, it's context/education)
```

### Proposed UI Structure

```
┌─────────────────────────────────────────────────┐
│  WORKFLOW ACCORDION                              │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │ 🤖 AI MESSAGES (NEW)                   │    │ ← New section
│  │                                         │    │
│  │ "I can't see your screen right now,   │    │
│  │  but here's what you need to do..."    │    │
│  │                                         │    │
│  │ "Looks like you switched apps - no     │    │
│  │  problem! Continue when ready."        │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │ ✅ COMPLETED STEPS                     │    │
│  │ 1. Open Slack ✓                       │    │
│  │    AI: "Click Slack in your dock..."   │    │ ← Step-specific
│  └────────────────────────────────────────┘    │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │ → CURRENT STEP                         │    │
│  │ 2. Find the product channel            │    │
│  │    AI: "Look in the left sidebar..."   │    │ ← Step-specific
│  │                                         │    │
│  │    💬 Your Question:                   │    │
│  │    "I don't see it"                    │    │
│  │                                         │    │
│  │    ✨ Answer:                          │    │
│  │    "Try scrolling down in the          │    │ ← Step-specific Q&A
│  │     sidebar..."                        │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │ ⏸️ REMAINING STEPS                      │    │
│  │ 3. Click the Canvas icon               │    │
│  │ 4. Update the roadmap                  │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  [Continue] [Ask Something] [Exit]              │
└─────────────────────────────────────────────────┘
```

### Implementation

**1. Add New Interaction Type**

`workflow.service.ts`:

```typescript
export interface WorkflowInteraction {
  id: string;
  workflowSessionId: string;
  type:
    | "step_progress"
    | "user_question"
    | "ai_response"
    | "ai_context_message" // ← NEW
    | "step_modified"
    | "workflow_complete";
  role: "user" | "assistant" | "system";
  content: string | null;
  relatedStepIndex: number | null; // NULL for context messages
  metadata: any;
  createdAt: Date;
}
```

**2. Store Context Messages**

When AI provides general context (not tied to a step):

```typescript
await workflowService.addInteraction(
  workflowSessionId,
  "ai_context_message", // New type
  "assistant",
  "I can't see your Slack screen right now, but here are the steps...",
  null, // No specific step
  { reason: "screen_not_visible" }
);
```

**3. Render in Accordion**

`WorkflowAccordion.tsx`:

```typescript
// Filter context messages (no relatedStepIndex)
const contextMessages = interactions.filter(
  int => int.type === "ai_context_message" && int.relatedStepIndex === null
);

return (
  <div className="accordion">
    {/* AI Context Messages Section */}
    {contextMessages.length > 0 && (
      <div className="ai-messages-section">
        <p className="section-header">💬 AI Messages</p>
        {contextMessages.map(msg => (
          <AIMessage key={msg.id} content={msg.content} />
        ))}
      </div>
    )}

    {/* Existing step sections... */}
  </div>
);
```

**4. Agent Logic**

When to create context messages vs step-specific:

```typescript
// In visual-guidance.agent.ts

// Context message (general)
if (!context.screenshot) {
  await workflowService.addInteraction(
    activeWorkflow.id,
    "ai_context_message",
    "assistant",
    "I can't see your screen. Here's what to do next...",
    null // Not tied to specific step
  );
}

// Step-specific message
else {
  await workflowService.addInteraction(
    activeWorkflow.id,
    "ai_response",
    "assistant",
    "Click the button in the top right...",
    activeWorkflow.currentStepIndex // Tied to current step
  );
}
```

### Success Criteria

- ✅ Context messages appear in dedicated section
- ✅ Step-specific messages stay with their steps
- ✅ Q&A still inline with current step
- ✅ No confusion about where messages appear
- ✅ Better UX for long workflows with context switches

---

## Migration Strategy

### Order of Operations

1. **Phase 2B First** (Unify Types)
   - Least risky
   - Quick wins
   - Enables cleaner Phase 2A

2. **Phase 2A Second** (Remove Dual Storage)
   - More complex
   - Requires careful testing
   - Builds on unified types

3. **Phase 2C Third** (AI Messages)
   - UX enhancement
   - Depends on clean data model
   - Can iterate after launch

### Rollback Plan

If issues arise:

1. Keep `workflow_sessions` as source of truth
2. Temporarily re-enable message writes
3. Fix forward, not backward (no data loss)

---

## Testing Strategy

### Unit Tests

- `workflow.service.ts` - All CRUD operations
- Type transformations removed
- Interaction type handling

### Integration Tests

- Workflow creation flow (no message writes)
- Step progression (only workflow tables updated)
- Q&A during workflow (correct interaction types)
- Context messages vs step messages

### E2E Tests

- Start workflow → Accordion appears
- Progress through steps → No chat messages created
- Ask question mid-workflow → Shows in correct section
- Exit workflow → Clean state

### Manual QA Checklist

- [ ] Start workflow with "How do I...?"
- [ ] Confirm workflow start
- [ ] Progress through 3 steps
- [ ] Ask question during step 2
- [ ] Verify no workflow messages in chat
- [ ] Verify accordion shows all interactions
- [ ] Exit workflow
- [ ] Ask normal question (should route to KnowledgeAgent)
- [ ] Verify completed workflow stays visible but collapsed

---

## Success Metrics

### Technical

- 🎯 Zero workflow data in `messages` table
- 🎯 Single source of truth (`workflow_sessions`)
- 🎯 No type transformations needed
- 🎯 TypeScript strict mode passes

### UX

- 🎯 Context messages clearly separated from steps
- 🎯 Users can ask questions freely during workflow
- 🎯 No confusion about where AI responses appear
- 🎯 Accordion feels like independent experience

### Performance

- 🎯 Polling continues at 2s (acceptable for now)
- 🎯 No N+1 queries when loading workflow
- 🎯 Accordion renders <100ms

---

## Future Enhancements (Post-Phase 2)

### WebSockets (Phase 3)

Replace polling with real-time updates:

- Backend emits on workflow changes
- Frontend listens and updates instantly
- 95% reduction in API calls

### Sidebar UI (Phase 4)

Move accordion to persistent sidebar:

- Always visible during workflow
- Chat and workflow don't compete for space
- Better UX for long workflows

### Video Recording (Phase 5)

Capture successful workflows:

- Generate training materials
- Share with team members
- Improve workflow templates

---

## Appendix

### Related Files

**Backend:**

- `apps/backend/src/services/workflow.service.ts`
- `apps/backend/src/services/guideGeneration.service.ts`
- `apps/backend/src/services/orchestrator.service.ts`
- `apps/backend/src/agents/visual-guidance.agent.ts`
- `apps/backend/src/routes/workflows.ts`

**Frontend:**

- `apps/electron/src/renderer/conversation/src/hooks/useWorkflow.ts`
- `apps/electron/src/renderer/conversation/src/components/WorkflowAccordion.tsx`
- `apps/electron/src/renderer/conversation/src/App.tsx`

**Database:**

- `apps/backend/src/db/schema/workflow-sessions.schema.ts`
- `apps/backend/src/db/migrations/0007_add_workflow_tables.sql`

### Key Decisions

**Why not WebSockets now?**

- Polling works for MVP
- Want to stabilize data model first
- Will implement in Phase 3

**Why separate AI messages section?**

- Context switches are common (app switching, screen visibility)
- Educational Q&A doesn't belong tied to specific steps
- Users need clear feedback when AI can't see screen

**Why remove from messages table entirely?**

- Single source of truth prevents bugs
- Cleaner architecture for scaling
- Easier to maintain long-term

---

**Document Owner:** Engineering Team  
**Next Review:** After Phase 2A completion  
**Questions?** See `ui_guidance_architecture.md` for original design principles
