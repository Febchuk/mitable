# Workflow System Architecture - Developer Guide

**Author:** Aurel & Febe  
**Last Updated:** November 1, 2025  
**For:** Mikun (Developer Handoff)

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema & Relationships](#database-schema--relationships)
3. [Workflow-Message Integration](#workflow-message-integration)
4. [Frontend Data Fetching & Polling](#frontend-data-fetching--polling)
5. [AI Context & Step Answering](#ai-context--step-answering)
6. [Accordion UI Pattern](#accordion-ui-pattern)
7. [Context-Aware Screenshots](#context-aware-screenshots)
8. [Key Files Reference](#key-files-reference)

---

## Overview

The workflow system provides **interactive step-by-step guidance** for users to complete tasks (e.g., "Update product roadmap in Slack"). Workflows are fully integrated into the chat message stream and persist across app restarts.

### Key Principles

- **Workflows ARE messages** - Not separate entities
- **Polling for real-time updates** - Shared polling service
- **Context-aware AI** - AI knows which app and workflow step
- **Collapsible UI** - Accordion pattern in message stream

---

## Database Schema & Relationships

### Core Tables

#### `messages` Table

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversationId UUID NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'user' | 'assistant'
  content TEXT,
  messageType VARCHAR(50), -- 'text' | 'workflow' | 'experts'
  workflowId UUID, -- Reference to workflow_sessions.id (NOT a FK)
  cardData JSONB, -- Workflow metadata
  createdAt TIMESTAMP,
  -- ... other fields
);
```

**Why `workflowId` is NOT a foreign key:**

- Prevents cascade deletion issues
- Allows workflow to be "soft deleted" while message persists
- Manual cleanup when needed

**cardData structure for workflow messages:**

```json
{
  "workflowId": "uuid",
  "solution": "Update product roadmap in Slack",
  "stepCount": 5
}
```

#### `workflow_sessions` Table

```sql
CREATE TABLE workflow_sessions (
  id UUID PRIMARY KEY,
  conversationId UUID NOT NULL,
  solution TEXT NOT NULL,
  searchQuery TEXT,
  currentStepIndex INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  workflowData JSONB, -- Full SolutionObject
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**workflowData structure:**

```json
{
  "solution": "Update product roadmap in Slack",
  "solutionExplanation": "...",
  "searchQuery": "slack canvas update",
  "stepList": [
    {
      "stepNumber": 0,
      "description": "Pre-flight: Let me verify I can see Slack...",
      "status": "completed"
    },
    {
      "stepNumber": 1,
      "description": "Open the #product-team channel",
      "status": "pending"
    }
  ],
  "supportingData": [...]
}
```

#### `workflow_interactions` Table

```sql
CREATE TABLE workflow_interactions (
  id UUID PRIMARY KEY,
  workflowSessionId UUID REFERENCES workflow_sessions(id),
  type VARCHAR(50) NOT NULL, -- 'ai_response' | 'user_question' | 'ai_context_message'
  role VARCHAR(50) NOT NULL, -- 'user' | 'assistant'
  content TEXT,
  relatedStepIndex INTEGER, -- Which step this interaction belongs to (null = global)
  metadata JSONB,
  createdAt TIMESTAMP
);
```

**Interaction Types:**

- `ai_response` - Initial AI guidance for a step
- `user_question` - User asked a question during workflow
- `ai_context_message` - General AI message not tied to specific step

### Relationships

```
conversations (1) ──< messages (N)
                      │
                      │ workflowId (soft reference)
                      ▼
                 workflow_sessions (1)
                      │
                      ├──< workflow_interactions (N)
                      │
                      └── conversationId ──> conversations (1)
```

**Critical:** A workflow has TWO references to conversation:

1. Via the message with `workflowId`
2. Direct `conversationId` in `workflow_sessions`

This ensures:

- Workflows appear in chronological order (via messages)
- Fast workflow lookups by conversationId
- Persistence across app restarts

---

## Workflow-Message Integration

### Why Workflows Are Messages

**Before (Bad):**

- Workflows stored separately
- Connected only by `conversationId` + timestamp matching
- Disappeared on app restart
- No chronological ordering in chat

**After (Good):**

- Workflow created → insert into `workflow_sessions` **AND** `messages`
- Perfect chronological ordering
- Persist across restarts
- Clean architecture

### Workflow Creation Flow

```typescript
// Backend: apps/backend/src/services/workflow.service.ts

async createWorkflowSession(conversationId: string, solutionObject: SolutionObject) {
  // 1. Insert workflow session
  const [session] = await db.insert(workflow_sessions).values({
    conversationId,
    solution: solutionObject.solution,
    searchQuery: solutionObject.searchQuery,
    currentStepIndex: 0,
    status: "active",
    workflowData: solutionObject,
  }).returning();

  // 2. Insert message with workflowId
  await db.insert(messages).values({
    conversationId,
    role: "assistant",
    content: `Starting workflow: ${solutionObject.solution}`,
    messageType: "workflow",
    workflowId: session.id, // ✅ Link to workflow
    cardData: {
      workflowId: session.id,
      solution: solutionObject.solution,
      stepCount: solutionObject.stepList?.length || 0,
    },
  });

  return session;
}
```

**Key insight:** The message acts as the "anchor" in the chat stream, while `workflow_sessions` holds the full state.

---

## Frontend Data Fetching & Polling

### Architecture Decision: Shared Polling Hook

**Problem:** Initially, `ChatDetail.tsx` and `App.tsx` had duplicate polling logic, causing:

- Redundant API calls
- Inconsistent state
- Wasted computation

**Solution:** Unified polling in `useWorkflowPolling` hook.

### Shared Polling Hook

**File:** `apps/electron/src/renderer/console/src/hooks/useWorkflowPolling.ts`

```typescript
export function useWorkflowPolling(
  messages: Message[],
  conversationId: string | null
): Map<string, { workflow: WorkflowData; interactions: WorkflowInteraction[] }> {
  const [workflowsData, setWorkflowsData] = useState<Map<string, any>>(new Map());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Extract workflow messages
  const workflowMessages = useMemo(
    () => messages.filter((msg) => msg.messageType === "workflow" && msg.workflowId),
    [messages]
  );

  // Fetch workflow data
  const fetchWorkflows = useCallback(async () => {
    if (workflowMessages.length === 0) return;

    const workflowIds = workflowMessages
      .map((msg) => msg.workflowId || msg.cardData?.workflowId)
      .filter(Boolean);

    // Batch fetch: /api/workflows/batch?ids=id1,id2,id3
    const response = await fetch(
      `http://localhost:3000/api/workflows/batch?ids=${workflowIds.join(",")}`
    );
    const data = await response.json();

    // Update state
    const newMap = new Map();
    data.workflows.forEach((wf) => {
      newMap.set(wf.workflow.id, wf);
    });
    setWorkflowsData(newMap);
  }, [workflowMessages]);

  // Smart polling: only poll if there are active workflows
  useEffect(() => {
    const hasActiveWorkflows = Array.from(workflowsData.values()).some(
      (data) => data.workflow.status === "active"
    );

    if (hasActiveWorkflows) {
      // Start polling every 2 seconds
      pollingIntervalRef.current = setInterval(fetchWorkflows, 2000);
    } else {
      // Stop polling when all workflows complete/cancel
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [workflowsData, fetchWorkflows]);

  return workflowsData;
}
```

### Why This Design?

1. **Single source of truth** - One hook, one polling loop
2. **Smart polling** - Stops when no active workflows
3. **Batch fetching** - One API call for all workflows
4. **Shared state** - Both ChatDetail and App use same data

### Usage in Components

```typescript
// apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx

function ChatDetail() {
  const messages = useMessages(chatId);

  // ✅ Use shared polling hook
  const workflowsData = useWorkflowPolling(messages, chatId);

  // Render workflows inline
  return (
    <div>
      {messages.map(msg => {
        if (msg.messageType === "workflow") {
          const workflowData = workflowsData.get(msg.workflowId);
          return <WorkflowAccordion workflow={workflowData.workflow} />;
        }
        return <RegularMessage message={msg} />;
      })}
    </div>
  );
}
```

### Batch Endpoint

**Backend:** `apps/backend/src/routes/workflows.ts`

```typescript
// GET /api/workflows/batch?ids=id1,id2,id3
router.get("/batch", async (req: Request, res: Response) => {
  const ids = (req.query.ids as string)?.split(",") || [];

  const workflows = await Promise.all(ids.map((id) => workflowService.getWorkflowById(id)));

  return res.json({ workflows });
});
```

**Why batch?**

- Reduces HTTP overhead (1 request vs N requests)
- Atomic snapshot of all workflow states
- Better for React rendering (single state update)

---

## AI Context & Step Answering

### How AI Knows What to Answer

The AI system has two specialized agents:

#### 1. Visual Guidance Agent

**File:** `apps/backend/src/agents/visual-guidance.agent.ts`

**Responsibilities:**

- Handles all workflow interactions
- Routes to appropriate tools based on user action
- Maintains workflow context

**Tool Selection Logic:**

```typescript
async *handleMessage(context: ToolContext) {
  // Active workflow exists
  if (context.workflowState) {
    const questionType = this.classifyWorkflowQuestion(userMessage);

    if (questionType === "visual") {
      // User can't find UI element → use analyze_workflow_screen tool
      yield* this.analyzeScreenTool.execute(...);
    } else {
      // User asking conceptual question → use respond_with_text
      yield* this.textResponseTool.execute(...);
    }
  }
}
```

#### 2. Text Response Agent

**File:** `apps/backend/src/agents/text-response.agent.ts`

**Enhanced for Workflow Context:**

```typescript
const systemPrompt = `
You are Febe, an AI assistant helping users complete workflows.

${
  context.workflowState
    ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ACTIVE WORKFLOW CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current Task: ${context.workflowState.solution}
Current Step: ${context.workflowState.currentStepIndex + 1} of ${context.workflowState.totalSteps}
Step Description: ${currentStep.description}

Target Application: ${detectedApp} ← IMPORTANT: User is working in this app

Your answers should:
1. Be specific to the current workflow step
2. Reference the target application naturally
3. Keep user focused on completing this step
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    : ""
}
`;
```

**Why this matters:**

- AI knows exactly which step user is on
- AI won't give generic answers
- AI references correct application (e.g., "In Slack..." not "In the app...")

### Context-Aware Screenshot Analysis

**File:** `apps/backend/src/services/gemini-vision.service.ts`

```typescript
async analyzeStepExecution(screenshot, solutionObject, currentStep, history) {
  // Extract target app from workflow
  const combinedText = `${solutionObject.solution} ${solutionObject.searchQuery}`.toLowerCase();
  let targetApp = 'unknown';

  if (combinedText.includes('slack')) targetApp = 'Slack';
  else if (combinedText.includes('notion')) targetApp = 'Notion';
  // ... etc

  const prompt = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TARGET APPLICATION: ${targetApp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: The screenshot should show ${targetApp}.
If you see ${targetApp} in the screenshot, analyze it.
If you DON'T see ${targetApp} (e.g., Mitable, code editor, wrong app),
tell the user to switch to ${targetApp}.

Current Step: ${currentStep.description}
Your job: Look at the screenshot of ${targetApp} and tell the user
EXACTLY which UI element to click/interact with.
  `;

  // ... send to Gemini Vision API
}
```

**Result:** AI provides correct, context-aware guidance even if user has multiple windows open.

### Step Progression & Interaction Logging

**Every workflow interaction is logged:**

```typescript
// When user asks question
await workflowService.addInteraction(
  workflowId,
  "user_question",
  "user",
  userMessage,
  currentStepIndex
);

// When AI responds
await workflowService.addInteraction(
  workflowId,
  "ai_response",
  "assistant",
  aiResponse,
  currentStepIndex
);
```

**This enables:**

- Full conversation history per step
- Debugging workflow issues
- Analytics on where users get stuck

---

## Accordion UI Pattern

### Why Accordion Instead of Separate View?

**Considered Approaches:**

| Approach               | Pros                                                             | Cons                                   |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| **Separate Modal**     | Full screen, no distractions                                     | Loses chat context, feels disconnected |
| **Sidebar Panel**      | Persistent view                                                  | Takes up screen space, complex layout  |
| **Accordion (chosen)** | ✅ In message stream<br>✅ Collapsible<br>✅ Chronological order | Needs scrolling for long workflows     |

### Accordion Design Decisions

**File:** `apps/electron/src/renderer/conversation/src/components/WorkflowAccordion.tsx`

#### 1. Collapsible Conversation History

**Problem:** Long workflows with many Q&A exchanges become unreadable.

**Solution:** Each completed step has collapsible conversation:

```typescript
// Track which steps are expanded (Set of step indices)
const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

// In render
{stepList.slice(0, stepsCompleted).map((step, index) => {
  const isExpanded = expandedSteps.has(index);

  return (
    <div>
      <div className="flex items-center justify-between">
        <p>✅ {step.description}</p>
        <button onClick={() => toggleStep(index)}>
          {isExpanded ? "Hide" : `Show (${questionCount} Q)`}
        </button>
      </div>

      {isExpanded && (
        <div>
          <p>Q: {userQuestion}</p>
          <p>A: {aiAnswer}</p>
        </div>
      )}
    </div>
  );
})}
```

**Why Set<number> not individual useState?**

- React Hook rules: Can't call hooks inside loops
- Set allows dynamic tracking of any number of steps
- Single state update = better performance

#### 2. Simplified Message Styling

**Before:** Bulky message bubbles with profile icons  
**After:** Clean Q:/A: format

```typescript
// Simple text instead of component
<p className="text-sm text-blue-300">
  <span className="opacity-60">Q:</span> {userQuestion}
</p>
<p className="text-sm text-gray-300">
  <span className="opacity-60">A:</span> {aiAnswer}
</p>
```

**Benefits:**

- Less visual clutter
- Faster rendering (no complex components)
- More content visible at once

#### 3. Always-Visible Chat Input

**User can ask questions at any step without leaving workflow:**

```typescript
<div className="mt-4 sticky bottom-0 bg-[#1E1E28] p-3">
  <input
    placeholder="Ask a question about this step..."
    value={chatInput}
    onChange={(e) => setChatInput(e.target.value)}
  />
  <button onClick={handleAskQuestion}>Send</button>
</div>
```

**Key decision:** Disable main chat input when workflow active, force all interaction through accordion.

```typescript
// ChatDetail.tsx
const hasActiveWorkflow = Array.from(workflowsData.values()).some(
  data => data.workflow.status === "active"
);

<input
  disabled={hasActiveWorkflow}
  placeholder={hasActiveWorkflow ? "Use the chat in the workflow above..." : "Type your message..."}
/>
```

---

## Context-Aware Screenshots

### How Screenshots Know Which App to Capture

**Problem:** User has Slack in background, Mitable in foreground. AI takes screenshot of Mitable and gets confused.

**Solution:** Workflow context extraction + targeted window capture.

### Frontend: Target App Detection

**File:** `apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx`

```typescript
const handleWorkflowOptionSelect = async (option) => {
  // Get active workflow
  const activeWorkflow = Array.from(workflowsData.values()).find(
    (data) => data.workflow.status === "active"
  );

  // Extract target app from workflow solution/searchQuery
  let targetApp: string | undefined;
  if (activeWorkflow) {
    const solution = activeWorkflow.workflow.solution.toLowerCase();
    const searchQuery = activeWorkflow.workflow.searchQuery?.toLowerCase() || "";
    const combinedText = `${solution} ${searchQuery}`;

    // Detect app
    if (combinedText.includes("slack")) targetApp = "Slack";
    else if (combinedText.includes("notion")) targetApp = "Notion";
    // ... etc
  }

  // Pass to screenshot capture
  screenshot = await window.consoleAPI.captureScreenshot(targetApp);
};
```

### Preload: Pass to Main Process

**File:** `apps/electron/src/preload/console.ts`

```typescript
captureScreenshot: async (targetApp?: string): Promise<string | null> => {
  const result = await ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREENSHOT, {
    targetApp, // ← Pass to main process
  });
  return result?.dataUrl || null;
};
```

### Main Process: Targeted Window Capture

**File:** `apps/electron/src/main.ts`

```typescript
ipcMain.handle(IPC_CHANNELS.CAPTURE_SCREENSHOT, async (_event, payload) => {
  const { targetApp } = payload || {};

  if (targetApp) {
    // Try to capture specific window
    const result = await captureService.captureWindowByApp(targetApp, false);
    if (result) {
      return { dataUrl: result.dataUrl, metadata: result.metadata };
    }
  }

  // Fallback: full screen
  return await captureService.capture({ mode: "full-screen" });
});
```

### Capture Service: Find Target Window

**File:** `apps/electron/src/services/captureService.ts`

```typescript
async captureWindowByApp(appName: string, excludeMitable: boolean) {
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    fetchWindowIcons: false,
  });

  // Priority 1: Find desktop app (not in browser)
  let targetSource = sources.find(
    source =>
      source.name.toLowerCase().includes(appName.toLowerCase()) &&
      !this.isBrowserWindow(source.name)
  );

  // Priority 2: Find browser tab with app name
  if (!targetSource) {
    targetSource = sources.find(source =>
      source.name.toLowerCase().includes(appName.toLowerCase())
    );
  }

  if (!targetSource) return null;

  // Capture this specific window
  return await this.captureWindow(targetSource.id);
}
```

**Result:** Even if Slack is minimized or behind other windows, we capture Slack specifically.

---

## Key Files Reference

### Backend

| File                                                 | Purpose                                              |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `apps/backend/src/services/workflow.service.ts`      | Workflow CRUD, step progression, interaction logging |
| `apps/backend/src/agents/visual-guidance.agent.ts`   | Routes workflow interactions to appropriate tools    |
| `apps/backend/src/agents/text-response.agent.ts`     | Handles conceptual questions with workflow context   |
| `apps/backend/src/services/gemini-vision.service.ts` | Analyzes screenshots with target app context         |
| `apps/backend/src/services/orchestrator.service.ts`  | Routes messages to correct agent                     |
| `apps/backend/src/routes/workflows.ts`               | Workflow API endpoints (batch fetch, progress, etc.) |
| `apps/backend/src/db/schema/workflows.schema.ts`     | Database schema definitions                          |

### Frontend

| File                                                                                        | Purpose                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `apps/electron/src/renderer/console/src/hooks/useWorkflowPolling.ts`                        | Shared polling logic for workflows        |
| `apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx` | Main chat view, integrates workflows      |
| `apps/electron/src/renderer/conversation/src/components/WorkflowAccordion.tsx`              | Workflow UI component                     |
| `apps/electron/src/preload/console.ts`                                                      | IPC bridge for screenshot capture         |
| `apps/electron/src/main.ts`                                                                 | Main process, handles IPC for screenshots |
| `apps/electron/src/services/captureService.ts`                                              | Screenshot capture with app targeting     |

### Database

| File                                                 | Purpose                              |
| ---------------------------------------------------- | ------------------------------------ |
| `apps/backend/src/db/migrations/0005_blue_brood.sql` | Added `workflowId` to messages table |

---

## Quick Reference: Data Flow Diagrams

### Workflow Creation Flow

```
User: "Update roadmap in Slack"
    ↓
Orchestrator → Visual Guidance Agent
    ↓
start_ui_guidance_workflow tool
    ↓
WorkflowService.createWorkflowSession()
    ├─→ INSERT workflow_sessions (status: active, workflowData: {...})
    └─→ INSERT messages (messageType: workflow, workflowId: session.id)
    ↓
Frontend polls /api/workflows/batch
    ↓
WorkflowAccordion renders in message stream
```

### Step Progression Flow

```
User clicks "Next Step" button
    ↓
Frontend: handleWorkflowOptionSelect()
    ├─→ Capture screenshot (with targetApp context)
    ├─→ Send message with metadata: { workflowAction: "progress_step" }
    └─→ Backend receives message
    ↓
Orchestrator → Visual Guidance Agent
    ↓
progressWorkflowTool.execute()
    ├─→ WorkflowService.progressStep(workflowId)
    ├─→ Update currentStepIndex
    ├─→ Analyze screenshot for new step
    └─→ Add interaction (ai_response, currentStepIndex)
    ↓
Frontend polling detects change
    ↓
WorkflowAccordion re-renders with new step highlighted
```

### Question Answering Flow

```
User types question in workflow accordion
    ↓
Frontend: Send message with metadata: { workflowAction: "custom_question" }
    ↓
Backend: Visual Guidance Agent receives message
    ↓
Classify question type:
├─→ "visual" (e.g., "Where is the button?")
│   └─→ analyze_workflow_screen tool
│       ├─→ Get current workflow state
│       ├─→ Analyze screenshot with Gemini Vision
│       └─→ Return targeted visual guidance
│
└─→ "conceptual" (e.g., "Why do I need this step?")
    └─→ respond_with_text tool
        ├─→ Include workflow context in prompt
        ├─→ Reference target app naturally
        └─→ Return contextual answer
    ↓
Add interactions:
├─→ user_question (user, question, stepIndex)
└─→ ai_response (assistant, answer, stepIndex)
    ↓
Frontend polling fetches updated interactions
    ↓
WorkflowAccordion displays Q&A under current step
```

---

## Common Pitfalls & Solutions

### Pitfall 1: React Hook in Map Loop

**❌ Wrong:**

```typescript
{
  steps.map((step, index) => {
    const [expanded, setExpanded] = useState(false); // ERROR!
  });
}
```

**✅ Correct:**

```typescript
const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

{
  steps.map((step, index) => {
    const isExpanded = expandedSteps.has(index);
  });
}
```

### Pitfall 2: Polling Never Stops

**❌ Wrong:**

```typescript
useEffect(() => {
  const interval = setInterval(fetchWorkflows, 2000); // Always polls!
  return () => clearInterval(interval);
}, []);
```

**✅ Correct:**

```typescript
useEffect(() => {
  const hasActive = Array.from(workflowsData.values()).some((d) => d.workflow.status === "active");

  if (hasActive) {
    const interval = setInterval(fetchWorkflows, 2000);
    return () => clearInterval(interval);
  }
}, [workflowsData]);
```

### Pitfall 3: Foreign Key Cascade Issues

**❌ Wrong:**

```sql
workflowId UUID REFERENCES workflow_sessions(id) ON DELETE CASCADE
```

If workflow is deleted, message disappears from chat history!

**✅ Correct:**

```sql
workflowId UUID -- Soft reference, no FK constraint
```

Manual cleanup when both workflow AND message should be deleted.

---

## Testing Checklist

- [ ] Workflow appears in chat stream at correct position
- [ ] Workflow persists after app restart
- [ ] Multiple workflows in same conversation render correctly
- [ ] Polling stops when all workflows complete/cancel
- [ ] Step progression updates UI immediately
- [ ] User questions appear under correct step
- [ ] AI references correct target app (Slack, Notion, etc.)
- [ ] Screenshot captures target app (not Mitable)
- [ ] Collapsible conversations work per step
- [ ] Main chat input disabled during active workflow

---

## Next Steps / Future Improvements

1. **Workflow Templates** - Save common workflows as templates
2. **Step Branching** - Allow conditional steps based on user's environment
3. **Multi-user Workflows** - Share workflows across team
4. **Workflow Analytics** - Track which steps users struggle with
5. **Voice Commands** - "Skip to step 3", "Show me step 2 again"
6. **Undo/Redo** - Go back if user made mistake
7. **Workflow Marketplace** - Community-contributed workflows

---

## Questions for Mikun?

- **Database:** Any concerns about the soft reference pattern?
- **Polling:** Should we use WebSockets instead of polling?
- **UI:** Any accessibility concerns with accordion pattern?
- **AI:** How to handle non-English workflows?

---

**End of Documentation**

For questions or clarifications, contact Aurel or Febe.
