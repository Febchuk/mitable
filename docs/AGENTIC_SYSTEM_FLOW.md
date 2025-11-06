# Complete Agentic System Flow: User Prompt to Response

This document explains the **end-to-end flow** of how a user's prompt travels through the agentic system and returns as a response they see in the UI.

---

## 🎯 High-Level Overview

```
User Types Message
    ↓
Frontend Captures Screenshot (if enabled)
    ↓
HTTP POST to Backend API
    ↓
Backend: Save User Message + Fetch History
    ↓
Orchestrator: Route to Appropriate Agent
    ↓
Agent: Process with Tools (if needed)
    ↓
Stream Response Chunks via SSE
    ↓
Frontend: Display Streaming Text + Cards
    ↓
Save Complete Response to Database
```

---

## 📋 Detailed Flow Breakdown

### **1. Frontend: User Input & Message Preparation**

**Location**: `apps/electron/src/renderer/conversation/src/App.tsx` or `apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx`

**What happens:**

- User types a message in the chat input
- User clicks send or presses Enter
- Frontend automatically captures a screenshot (if `captureScreenshot: true`)
  - Screenshot is base64-encoded PNG (~200-500KB)
  - Includes metadata (width, height, scaleFactor)
- Frontend creates a temporary message object with unique ID
- Message is added to local state immediately (optimistic UI)

**Code Flow:**

```typescript
// User types "How do I submit an expense report?"
handleSubmit(message) {
  // 1. Capture screenshot
  const screenshot = await window.conversationAPI.captureScreenshot();

  // 2. Create temporary user message
  const userMessage = {
    id: generateId(),
    role: "user",
    content: message,
    type: "text"
  };

  // 3. Add to UI immediately
  setMessages(prev => [...prev, userMessage]);

  // 4. Call API
  await sendMessageStream(conversationId, message, screenshot, callbacks);
}
```

---

### **2. Frontend API: HTTP POST with SSE**

**Location**: `apps/electron/src/renderer/lib/api/conversations.ts`

**What happens:**

- Builds request body with:
  - `content`: User's message text
  - `screenshot`: Base64 data URL (if captured)
  - `metadata`: Workflow action hints (if user clicked WorkflowOptions button)
  - `screenshotMetadata`: Dimensions, scale factor
- Sends POST to `/api/conversations/:conversationId/messages/stream`
- Sets up EventSource/SSE reader to handle streaming response
- Provides callbacks for:
  - `onChunk`: Each word/token as it arrives
  - `onComplete`: Full response with metadata
  - `onWindowTrigger`: Launch Guide/Nudge windows
  - `onError`: Error handling

**Request:**

```typescript
POST /api/conversations/abc-123/messages/stream
Headers:
  Content-Type: application/json
  Authorization: Bearer <jwt-token>
Body:
{
  "content": "How do I submit an expense report?",
  "screenshot": "data:image/png;base64,iVBORw0KG...",
  "screenshotMetadata": { "width": 1920, "height": 1080, "scaleFactor": 2 },
  "metadata": null  // or { workflowAction: "progress_step" }
}
```

---

### **3. Backend Route: Request Reception & Validation**

**Location**: `apps/backend/src/routes/conversations.ts:715-958`

**What happens:**

1. **Authentication**: Verifies JWT token via `requireAuth` middleware
2. **Validation**: Checks user exists, conversation exists, user owns conversation
3. **Save User Message**: Persists user message to database immediately
4. **Fetch History**: Retrieves last 20 messages for context
5. **Build Context**: Creates `ToolContext` object with:
   - `conversationId`, `userId`, `organizationId`
   - `screenshot` (base64 string)
   - `screenshotMetadata` (dimensions)
   - `metadata` (workflow action hints)
   - `conversationHistory` (last 20 messages)
   - `userProfile` (name, email, organizationId)
6. **Setup SSE**: Configures Server-Sent Events headers
7. **Call Orchestrator**: Passes context to `orchestrator.processMessage()`

**Code:**

```typescript
// Save user message
const [userMessage] = await db
  .insert(schema.messages)
  .values({
    conversationId,
    role: "user",
    content,
    messageType: "text",
  })
  .returning();

// Fetch history
const conversationHistory = await db
  .select()
  .from(schema.messages)
  .where(eq(schema.messages.conversationId, conversationId))
  .orderBy(desc(schema.messages.createdAt))
  .limit(20)
  .reverse(); // Chronological order

// Setup SSE
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");

// Call orchestrator
const stream = orchestrator.processMessage({
  conversationId,
  userId,
  organizationId: user.organizationId,
  screenshot,
  screenshotMetadata,
  metadata,
  conversationHistory,
  userProfile: { name, email, organizationId },
});
```

---

### **4. Orchestrator: Intent Classification & Routing**

**Location**: `apps/backend/src/services/orchestrator.service.ts`

**What happens:**

#### **Step 1: Pre-load Workflow State** (if in active workflow)

- Retrieves latest workflow state from database
- Attaches to context for agents to use

#### **Step 2: Metadata-Driven Routing** (deterministic)

- If `metadata.workflowAction === "progress_step"` → **VisualGuidanceAgent**
- If `metadata.workflowAction === "exit_workflow"` → **TextResponseAgent**
- These are explicit UI actions (user clicked buttons), so routing is deterministic

#### **Step 3: Intent Classification** (LLM-based)

- Uses **Gemini Flash** (cheap, fast) to classify intent:
  - `"general_chat"` - Simple conversational response
  - `"knowledge_search"` - Company docs, policies, processes
  - `"workflow_start"` - Step-by-step UI guidance ("How do I...")
  - `"expert_request"` - Find colleague help

**Prompt:**

```
Classify: "How do I submit an expense report?"
Screenshot available: yes

Response: workflow_start|0.95
```

#### **Step 4: Route to Agent**

- `workflow_start` + screenshot → **VisualGuidanceAgent**
- `knowledge_search` → **KnowledgeAgent**
- `expert_request` → **ExpertMatchingAgent**
- `general_chat` → **TextResponseAgent** (default)

**Code:**

```typescript
// Classify intent
const intent = await this.classifyIntent(context);
// Result: { type: "workflow_start", confidence: 0.95 }

// Route to agent
const agent = await this.routeByIntent(intent, context);
// Result: VisualGuidanceAgent

// Execute agent
yield * agent.execute(context);
```

---

### **5. Agent Execution: Specialized Processing**

Each agent has a different execution path. Here's how the **VisualGuidanceAgent** works (most complex):

**Location**: `apps/backend/src/agents/visual-guidance.agent.ts`

#### **Scenario: User asks "How do I submit an expense report?" + screenshot**

**Step 1: Check if workflow already exists**

- If `workflowState` exists → Generate next step (progression)
- If no `workflowState` → Start new workflow (initialization)

**Step 2: Start New Workflow (Initialization)**

- **Sub-step 2a: Search Knowledge Base**
  - Calls `KnowledgeAgent.search()` to find company documentation
  - Searches Notion + Slack for expense report policies
  - Returns relevant sources with snippets

- **Sub-step 2b: Synthesize Workflow with GPT-4**
  - Sends user request + search results to GPT-4
  - GPT-4 generates structured workflow:
    ```json
    {
      "solution": "Submit expense report through company portal",
      "solutionExplanation": "Based on policy docs...",
      "supportingDataExplanation": "Slack thread shows process...",
      "stepList": [
        { "stepNumber": 1, "description": "Navigate to Finance portal", "status": "pending" },
        { "stepNumber": 2, "description": "Click 'New Expense'", "status": "pending" },
        { "stepNumber": 3, "description": "Fill in details and submit", "status": "pending" }
      ]
    }
    ```

- **Sub-step 2c: Analyze Screenshot with Gemini Vision**
  - Sends screenshot + current step to Gemini Vision API
  - Gemini detects UI elements with bounding boxes:
    ```json
    {
      "elements": [
        {
          "label": "New Expense",
          "type": "button",
          "boundingBox": { "x": 150, "y": 80, "width": 120, "height": 40 },
          "confidence": 0.95
        }
      ]
    }
    ```

- **Sub-step 2d: Generate Step 1**
  - Finds relevant element for first step
  - Creates `ToolResult` with:
    - `messageType: "workflow"`
    - `content`: Natural language instruction
    - `cardData`: Step number, instruction, targetElement coordinates
    - `triggerWindow`: Guide window data

**Step 3: Stream Response**

- Yields chunks to orchestrator
- Orchestrator forwards to route handler
- Route handler sends SSE events to frontend

**Other Agents:**

**KnowledgeAgent** (`apps/backend/src/agents/knowledge.agent.ts`):

1. Calls `SearchKnowledgeTool.execute()` (hybrid search: Pinecone + PostgreSQL)
2. Synthesizes results with GPT-4
3. Streams response with sources

**ExpertMatchingAgent** (`apps/backend/src/agents/expert-matching.agent.ts`):

1. Generates topic embedding
2. Scores experts by expertise + performance + availability
3. Returns top 3 experts as cards

**TextResponseAgent** (`apps/backend/src/agents/text-response.agent.ts`):

1. Uses Gemini Flash for simple responses
2. Streams text directly (no tools needed)

---

### **6. Tool Execution: Specialized Capabilities**

Tools are reusable capabilities that agents can call. Example: **GuideNextStepTool**

**Location**: `apps/backend/src/tools/guide-next-step.tool.ts`

**What happens:**

- Receives arguments: `{ task, stepNumber, previousStep }`
- Validates screenshot is present (required)
- Calls `geminiVisionService.analyzeScreenshot()`:
  - Converts base64 to image buffer
  - Sends to Gemini Vision API
  - Parses JSON response with UI elements
- Finds most relevant element for the task
- Generates instruction text
- Returns `ToolResult`:
  ```typescript
  {
    messageType: "workflow",
    content: "I can see you're on the expense dashboard. To submit expenses, click 'New Expense'.",
    cardData: {
      stepNumber: 1,
      instruction: "Click 'New Expense'",
      targetElement: {
        label: "New Expense",
        boundingBox: { x: 150, y: 80, width: 120, height: 40 }
      }
    },
    triggerWindow: {
      window: "guide",
      data: { guide: { steps: [...], currentStep: 0 } }
    },
    streamable: true
  }
  ```

**Other Tools:**

- **SearchKnowledgeTool**: Hybrid search (vector + keyword)
- **FindExpertTool**: Expert matching algorithm
- **RespondTextTool**: Simple pass-through
- **AnalyzeWorkflowScreenTool**: Visual issue analysis

---

### **7. Streaming Response: SSE Events**

**Location**: `apps/backend/src/routes/conversations.ts:889-939`

**What happens:**

- Orchestrator yields chunks (async generator)
- Route handler iterates over chunks
- Converts chunks to SSE format: `data: <JSON>\n\n`
- Sends to client immediately (no buffering)

**Event Types:**

1. **Window Trigger** (sent first if present):

   ```json
   {
     "type": "window_trigger",
     "windowTrigger": {
       "window": "guide",
       "data": {
         "guide": {
           "id": "vision-123",
           "title": "Submit expense report",
           "steps": [...],
           "currentStep": 0
         }
       }
     }
   }
   ```

2. **Text Chunks** (streamed word-by-word):

   ```json
   { "type": "chunk", "content": "I can " }
   { "type": "chunk", "content": "help " }
   { "type": "chunk", "content": "you " }
   { "type": "chunk", "content": "submit " }
   ```

3. **Complete** (full response with metadata):

   ```json
   {
     "type": "complete",
     "content": "I can help you submit an expense report. Let me show you step by step.",
     "messageType": "workflow",
     "cardData": {
       "stepNumber": 1,
       "instruction": "Click 'New Expense'",
       "targetElement": { ... }
     }
   }
   ```

4. **Done** (database message ID):

   ```json
   { "type": "done", "messageId": "msg-uuid-abc-123" }
   ```

5. **Error** (if something fails):
   ```json
   { "type": "error", "error": "Tool execution failed" }
   ```

**Code:**

```typescript
for await (const chunk of stream) {
  // Send chunk to client
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);

  // Accumulate for database save
  if (chunk.type === "chunk") {
    assistantContent += chunk.content;
  } else if (chunk.type === "complete") {
    assistantContent = chunk.content;
    assistantMessageType = chunk.messageType;
    assistantCardData = chunk.cardData;
  }
}
```

---

### **8. Frontend: Receiving & Displaying Stream**

**Location**: `apps/electron/src/renderer/lib/api/conversations.ts:136-283`

**What happens:**

#### **Step 1: Read SSE Stream**

- Uses `ReadableStream` API to read chunks
- Parses SSE format: `data: <JSON>\n\n`
- Accumulates full content in memory

#### **Step 2: Handle Events**

- **`onChunk`**: Appends word to temporary message in UI

  ```typescript
  onChunk: (chunk) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === streamingId ? { ...msg, content: msg.content + chunk } : msg))
    );
  };
  ```

- **`onWindowTrigger`**: Launches Guide/Nudge window via IPC

  ```typescript
  onWindowTrigger: (window, data) => {
    if (window === "guide") {
      window.agentAPI.startGuide(data.guide);
    }
  };
  ```

- **`onComplete`**: Updates message with final content + metadata
  ```typescript
  onComplete: (fullContent, messageId, messageType, cardData) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === streamingId
          ? {
              ...msg,
              id: messageId,
              content: fullContent,
              type: cardData ? "card" : "text",
              messageType,
              cardData,
            }
          : msg
      )
    );
  };
  ```

#### **Step 3: Frontend Streaming Simulation**

- After receiving full content, frontend re-streams word-by-word
- Adds 20ms delay between words for smooth UX
- This creates the "typing" effect

**Code:**

```typescript
// Read entire stream first
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = JSON.parse(data);
  if (chunk.type === "chunk") {
    fullContent += chunk.content;
  }
}

// Then simulate frontend streaming
const words = fullContent.split(" ");
for (const word of words) {
  callbacks.onChunk?.(word + " ");
  await new Promise((resolve) => setTimeout(resolve, 20));
}
```

---

### **9. Frontend UI: Rendering Response**

**Location**: `apps/electron/src/renderer/conversation/src/components/AIMessage.tsx`

**What happens:**

#### **Message Type Detection**

- Checks `messageType` field:
  - `"text"` → Render plain text bubble
  - `"workflow"` → Render `WorkflowOptions` component + `StepList`
  - `"experts"` → Render `ExpertsCard` component

#### **Workflow Message Rendering**

- Displays step-by-step instructions
- Shows `WorkflowOptions` component with buttons:
  - "Move on to next step" → Sends `metadata: { workflowAction: "progress_step" }`
  - "Type something" → Allows custom question during workflow
  - "Exit task workflow" → Sends `metadata: { workflowAction: "exit_workflow" }`
- If `targetElement` exists, highlights UI element (via Overlay window)

#### **Card Data Rendering**

- `cardData.stepNumber`: Current step number
- `cardData.instruction`: What user should do
- `cardData.targetElement`: Coordinates for overlay arrow
- `cardData.workflowPhase`: Controls workflow state visibility

**Code:**

```typescript
// AIMessage component
if (message.messageType === "workflow") {
  return (
    <div>
      <div>{message.content}</div>
      <StepList steps={message.cardData.steps} />
      <WorkflowOptions
        workflowPhase={message.cardData.workflowPhase}
        onProgress={() => sendMessage("Next", { workflowAction: "progress_step" })}
      />
    </div>
  );
}
```

---

### **10. Database: Persistence**

**Location**: `apps/backend/src/routes/conversations.ts:941-958`

**What happens:**

- After streaming completes, saves assistant message to database:

  ```typescript
  await db.insert(schema.messages).values({
    conversationId,
    role: "assistant",
    content: assistantContent, // Full text
    messageType: assistantMessageType, // "text" | "workflow" | "experts"
    cardData: assistantCardData, // Step data, expert cards, etc.
    sources: assistantSources, // Knowledge base citations
  });
  ```

- Updates conversation `updatedAt` timestamp
- Returns message ID in final "done" event

---

## 🔄 Example: Complete Flow for "How do I submit an expense report?"

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                               │
├─────────────────────────────────────────────────────────────┤
│ User types: "How do I submit an expense report?"            │
│ Screenshot captured: base64 PNG                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. FRONTEND API                                             │
├─────────────────────────────────────────────────────────────┤
│ POST /api/conversations/:id/messages/stream                 │
│ Body: { content, screenshot, screenshotMetadata }           │
│ Sets up SSE reader for streaming response                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BACKEND ROUTE                                            │
├─────────────────────────────────────────────────────────────┤
│ - Authenticate user (JWT)                                   │
│ - Save user message to DB                                   │
│ - Fetch last 20 messages                                    │
│ - Build ToolContext with history + screenshot               │
│ - Setup SSE headers                                         │
│ - Call orchestrator.processMessage()                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ORCHESTRATOR                                             │
├─────────────────────────────────────────────────────────────┤
│ - Pre-load workflow state (none exists)                     │
│ - Classify intent: "workflow_start" (confidence: 0.95)     │
│ - Route to: VisualGuidanceAgent                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. VISUAL GUIDANCE AGENT                                    │
├─────────────────────────────────────────────────────────────┤
│ - Check workflow state: None (new workflow)                 │
│ - Call KnowledgeAgent.search("expense report")             │
│   → Finds Notion docs + Slack threads                       │
│ - Call GPT-4 to synthesize workflow:                       │
│   → 3 steps: Navigate, Click, Submit                        │
│ - Call Gemini Vision to analyze screenshot:                 │
│   → Detects "New Expense" button at (150, 80)              │
│ - Generate Step 1 with coordinates                          │
│ - Yield ToolResult with workflow data                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. STREAMING RESPONSE                                       │
├─────────────────────────────────────────────────────────────┤
│ SSE Events sent:                                            │
│ 1. window_trigger: { window: "guide", data: {...} }       │
│ 2. chunk: "I can "                                          │
│ 3. chunk: "help "                                           │
│ 4. chunk: "you "                                            │
│ ... (all words)                                             │
│ 5. complete: { content: "...", messageType: "workflow",    │
│                cardData: {...} }                            │
│ 6. done: { messageId: "msg-123" }                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. FRONTEND RECEIVES & DISPLAYS                            │
├─────────────────────────────────────────────────────────────┤
│ - onWindowTrigger: Launches Guide window                    │
│ - onChunk: Updates message text word-by-word                │
│ - onComplete: Updates with final content + cardData        │
│ - Renders: WorkflowOptions + StepList components            │
│ - Overlay window: Highlights "New Expense" button         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. DATABASE PERSISTENCE                                     │
├─────────────────────────────────────────────────────────────┤
│ Saves assistant message:                                    │
│ - content: "I can help you submit..."                       │
│ - messageType: "workflow"                                   │
│ - cardData: { stepNumber: 1, instruction: "...", ... }    │
│ - sources: [...]                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Visual Flow Diagram

```
┌──────────────┐
│   USER       │
│   Types      │
│   Message    │
└──────┬───────┘
       │
       ▼
┌─────────────────────┐
│  FRONTEND           │
│  - Capture Screenshot│
│  - Send POST + SSE  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  BACKEND ROUTE      │
│  - Auth + Validate  │
│  - Save User Msg    │
│  - Fetch History    │
│  - Setup SSE        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  ORCHESTRATOR       │
│  - Classify Intent   │
│  - Route to Agent   │
└──────┬──────────────┘
       │
       ├───► VisualGuidanceAgent ──► Gemini Vision ──► Workflow
       ├───► KnowledgeAgent ───────► Search Tools ────► Sources
       ├───► ExpertMatchingAgent ──► Matching ────────► Experts
       └───► TextResponseAgent ────► Gemini Flash ────► Text
       │
       ▼
┌─────────────────────┐
│  STREAM CHUNKS      │
│  - window_trigger   │
│  - chunk (words)   │
│  - complete         │
│  - done             │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  FRONTEND           │
│  - Update UI        │
│  - Launch Windows   │
│  - Render Cards     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  DATABASE           │
│  - Save Message     │
│  - Update Timestamp │
└─────────────────────┘
```

---

## 🔑 Key Concepts

### **Multi-Agent Architecture**

- **Orchestrator**: Routes requests to specialized agents
- **Agents**: Domain-specific processors (knowledge, visual guidance, experts, text)
- **Tools**: Reusable capabilities (search, vision analysis, expert matching)

### **Streaming**

- **Backend**: Generates chunks asynchronously (async generator)
- **SSE**: Server-Sent Events for real-time delivery
- **Frontend**: Accumulates chunks, then re-streams for UX

### **Workflow State**

- Workflows are stateful (step progression)
- State persisted in database
- Metadata drives deterministic routing (progress_step, exit_workflow)

### **Visual Guidance**

- Requires screenshot for UI analysis
- Uses Gemini Vision for element detection
- Returns bounding box coordinates for overlay
- Triggers Guide window for step-by-step instructions

### **Context Management**

- Last 20 messages included in context
- User profile (name, email, organizationId)
- Screenshot metadata (dimensions, scaleFactor)
- Workflow state (if active)

---

## 📊 Performance Targets

- **Total Response Time**: <4 seconds end-to-end
  - Screenshot capture: <500ms
  - Intent classification: <500ms
  - Agent processing: <2s
  - Vision API: <1.5s
  - Streaming latency: <500ms

- **First Token Time**: <2 seconds (time to first chunk)

- **Concurrency**: Handle 10+ simultaneous users

---

## 🛠️ Error Handling

### **Tool Execution Failures**

- Agent catches errors
- Yields error chunk
- Falls back to text response if possible

### **Streaming Errors**

- Frontend detects connection loss
- Shows error message
- Allows retry

### **API Errors**

- Backend returns HTTP error status
- Frontend displays user-friendly error
- Logs detailed error for debugging

---

## 📝 Summary

The agentic system flow is:

1. **User Input** → Frontend captures message + screenshot
2. **API Request** → POST to backend with SSE setup
3. **Routing** → Orchestrator classifies intent and routes to agent
4. **Processing** → Agent executes tools (search, vision, matching)
5. **Streaming** → Chunks streamed via SSE to frontend
6. **Display** → Frontend updates UI in real-time
7. **Persistence** → Complete response saved to database

This architecture enables:

- **Intelligent routing** to specialized agents
- **Real-time streaming** for better UX
- **Visual guidance** with screenshot analysis
- **Knowledge search** with citations
- **Expert matching** with scoring
- **Stateful workflows** with step progression
