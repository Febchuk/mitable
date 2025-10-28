# Backend Agent Message Processing Loop

This document describes how messages flow through the backend AI agent system, from initial HTTP request to streamed response.

## Table of Contents

1. [Overview](#overview)
2. [Entry Point - Conversations API](#entry-point---conversations-api)
3. [Agent Orchestration](#agent-orchestration)
4. [Tool Execution](#tool-execution)
5. [Available Tools](#available-tools)
6. [Multi-Turn Tool Calling](#multi-turn-tool-calling)
7. [Streaming Response Format](#streaming-response-format)
8. [Key Services](#key-services)
9. [Complete Message Journey](#complete-message-journey)

---

## Overview

The backend uses an **agentic loop with iterative tool calling** powered by OpenAI's function calling API. The AI agent can:

- Detect user intent (workflow mode, continuation signals, questions)
- Choose appropriate tools dynamically
- Chain multiple tools in a single message
- Stream responses in real-time via Server-Sent Events (SSE)
- Trigger secondary windows (Guide, Nudge) with structured data

**Key Architecture Principles**:

- **Tool-based**: Capabilities are modular, reusable tools
- **Iterative**: Agent can call tools, receive results, and synthesize natural responses
- **Streaming**: All responses stream incrementally for better UX
- **Context-aware**: Uses screenshots, conversation history, and user profile

---

## Entry Point - Conversations API

**Endpoint**: `POST /conversations/:conversationId/messages/stream`
**Location**: `apps/backend/src/routes/conversations.ts:668-934`

### Request Flow

```
POST request arrives with:
├── conversationId (path parameter)
├── content (user message string)
└── screenshot (optional base64 image data URL)
    ↓
Verify user authentication (requireAuth middleware)
    ↓
Fetch user + organization info from database
    ↓
Verify conversation ownership (403 if unauthorized)
    ↓
Save user message to messages table
    ↓
Fetch conversation history (last 20 messages, chronological order)
    ↓
Build user profile context (name, email, organizationId)
    ↓
Set up Server-Sent Events (SSE) headers
├── Content-Type: text/event-stream
├── Cache-Control: no-cache
├── Connection: keep-alive
└── X-Accel-Buffering: no
    ↓
Call agentService.processMessage(content, context)
    ↓
Stream chunks to client as they arrive (for await loop)
    ↓
Save complete assistant response to database
    ↓
Update conversation.updatedAt timestamp
    ↓
Send final "done" event with messageId
```

### Context Structure

The `ToolContext` passed to the agent service includes:

```typescript
{
  conversationId: string,
  userId: string,
  screenshot?: string,  // Base64 data URL
  userProfile: {
    name: string,
    email: string,
    organizationId: string
  },
  conversationHistory: Message[]  // Last 20 messages
}
```

---

## Agent Orchestration

**Location**: `apps/backend/src/services/agent.service.ts:215-585`

The `agentService.processMessage()` method is the **main agentic loop** that orchestrates tool calling.

### Flow Diagram

```
┌─────────────────────────────────────────────┐
│  processMessage() - Main Entry Point        │
└─────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│  1. WORKFLOW DETECTION (lines 220-247)      │
├─────────────────────────────────────────────┤
│  - workflowService.shouldEnterWorkflowMode()│
│    • Checks for "how do I..." patterns      │
│    • Requires screenshot present            │
│  - continuationDetector.detectContinuation()│
│    • Detects "Next", "Done", "Okay" signals │
│    • Compares screenshot hashes             │
└─────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│  2. CONTINUATION HANDLING (lines 248-322)   │
├─────────────────────────────────────────────┤
│  IF: isContinuation && confidence > 0.7     │
│  THEN:                                       │
│    • Auto-trigger GuideNextStepTool         │
│    • Generate next step based on screenshot │
│    • Stream response + window trigger       │
│    • EXIT early (return)                    │
│                                              │
│  IF: type === "completion"                  │
│  THEN:                                       │
│    • Send acknowledgment message            │
│    • EXIT workflow mode                     │
└─────────────────────────────────────────────┘
          ↓ (if not continuation)
┌─────────────────────────────────────────────┐
│  3. BUILD MESSAGES (lines 324-332)          │
├─────────────────────────────────────────────┤
│  messages = [                                │
│    { role: "system", content: SYSTEM_PROMPT}│
│    ...conversationHistory,                  │
│    { role: "user", content: userMessage }   │
│  ]                                           │
│  tools = getToolDefinitions()               │
└─────────────────────────────────────────────┘
          ↓
┌──────────────────────────────────────────────────────────────┐
│  4. AGENTIC LOOP (while iterationCount < 5)                  │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │  A. Determine Tool Choice Strategy (lines 352-361) │     │
│  ├────────────────────────────────────────────────────┤     │
│  │  IF: shouldEnterWorkflow && screenshot             │     │
│  │  THEN: toolChoice = {                              │     │
│  │    type: "function",                               │     │
│  │    function: { name: "show_step_by_step_guide" }   │     │
│  │  }                                                  │     │
│  │  ELSE: toolChoice = "auto" (AI decides)            │     │
│  └────────────────────────────────────────────────────┘     │
│          ↓                                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │  B. Call OpenAI with Function Calling              │     │
│  ├────────────────────────────────────────────────────┤     │
│  │  openai.chat.completions.create({                  │     │
│  │    model: "gpt-4o",                                │     │
│  │    messages: messages,                             │     │
│  │    tools: toolDefinitions[],                       │     │
│  │    tool_choice: toolChoice,                        │     │
│  │    stream: true                                    │     │
│  │  })                                                 │     │
│  └────────────────────────────────────────────────────┘     │
│          ↓                                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │  C. Parse Streaming Response (lines 380-433)       │     │
│  ├────────────────────────────────────────────────────┤     │
│  │  For each chunk:                                   │     │
│  │    • Extract delta.tool_calls[0] (ignore index>0)  │     │
│  │    • Accumulate functionName + functionArgs        │     │
│  │    • OR accumulate textContent (direct response)   │     │
│  │    • Check finish_reason === "stop"                │     │
│  └────────────────────────────────────────────────────┘     │
│          ↓                                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │  D. Execute Chosen Tool (lines 436-537)            │     │
│  ├────────────────────────────────────────────────────┤     │
│  │  IF: functionName && functionArgs                  │     │
│  │  THEN:                                              │     │
│  │    1. Parse JSON arguments (with error handling)   │     │
│  │    2. tool = this.tools.get(functionName)          │     │
│  │    3. toolResult = await tool.execute(args, ctx)   │     │
│  │    4. IF toolResult.triggerWindow:                 │     │
│  │         yield { type: "window_trigger", ... }      │     │
│  │    5. Add assistant message with tool_calls[]      │     │
│  │    6. Add tool message with result content         │     │
│  │    7. CONTINUE LOOP (AI gets tool result)          │     │
│  └────────────────────────────────────────────────────┘     │
│          ↓                                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │  E. Stream Final Response (lines 538-558)          │     │
│  ├────────────────────────────────────────────────────┤     │
│  │  IF: textContent (AI responded without tool)       │     │
│  │  THEN:                                              │     │
│  │    • Split text into words                         │     │
│  │    • yield { type: "chunk", content: word }        │     │
│  │    • Add 20ms delay between words                  │     │
│  │    • yield { type: "complete", content: full }     │     │
│  │    • EXIT loop (return)                            │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### System Prompt

The agent's behavior is defined by a comprehensive system prompt (lines 15-113) that:

- Defines role as "experienced employee assistant"
- Provides tool usage guidelines
- Specifies when to use visual guidance vs text response
- Enforces source citation formatting
- Sets conversational tone expectations

---

## Tool Execution

### Base Tool Interface

**Location**: `apps/backend/src/tools/base.tool.ts`

All tools extend `BaseTool` and implement:

```typescript
class BaseTool {
  name: string; // Tool identifier (e.g., "search_knowledge_base")
  description: string; // When to use this tool (AI reads this)
  parameters: ToolParameters; // JSON Schema for arguments

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    // Tool implementation
  }
}
```

### ToolResult Structure

```typescript
interface ToolResult {
  messageType: string; // "text" | "workflow" | "expert_match"
  content: string; // Response text for chat
  streamable: boolean; // Can be streamed word-by-word?
  cardData?: any; // Structured data for cards
  sources?: Source[]; // Knowledge base sources
  triggerWindow?: {
    // Launch secondary window
    window: "guide" | "nudge";
    data: any;
  };
}
```

### Example: GuideNextStepTool

**Location**: `apps/backend/src/tools/guide-next-step.tool.ts:86-224`

```
execute({ task, stepNumber, previousStep }, context)
    ↓
Validate screenshot is present (REQUIRED)
    ↓
Call geminiVisionService.analyzeScreenshot(screenshot, task)
├── Sends screenshot to Gemini Vision API
├── Extracts UI elements with bounding boxes
├── Returns screen description + element array
└── Example: [{ label: "Submit", type: "button", boundingBox: {...}, confidence: 0.95 }]
    ↓
Find most relevant element for task
├── geminiVisionService.findRelevantElement(elements, task)
└── Returns element with highest relevance score
    ↓
Generate single-step instruction
└── Example: "Click 'Submit Request' button"
    ↓
Build ToolResult:
├── messageType: "workflow"
├── content: "I can see you're on [app]. To [task], click [element]."
├── cardData: { stepNumber, instruction, targetElement, highlightColor }
├── triggerWindow: {
│     window: "guide",
│     data: {
│       guide: {
│         id: "vision-123",
│         title: task,
│         steps: [{ stepNumber, instruction, targetElement, completed: false }],
│         currentStep: 0
│       }
│     }
│   }
└── streamable: true
    ↓
Return to AgentService
    ↓
AgentService yields window_trigger event
    ↓
AgentService continues loop for AI to synthesize natural response
```

---

## Available Tools

**Registered at startup**: `agent.service.ts:146-156`

### 1. RespondTextTool

**Name**: `respond_with_text`
**Purpose**: Direct text response without external data
**When Used**: Simple greetings, acknowledgments, clarifications

```typescript
// AI calls this for:
"Hi, how are you?" → respond_with_text
"Thanks!" → respond_with_text
"What did you just say?" → respond_with_text
```

### 2. SearchKnowledgeTool

**Name**: `search_knowledge_base`
**Purpose**: Hybrid search (semantic + keyword) across Notion + Slack
**When Used**: "What is X?", "Find docs about Y", "Who said Z?"

**Process**:

1. Generate embedding for query (OpenAI text-embedding-3-large)
2. Semantic search in Pinecone (top 10 results)
3. Keyword search in PostgreSQL (full-text search)
4. Merge and rank results
5. Return sources with relevance scores

### 3. FindExpertTool

**Name**: `find_expert_colleague`
**Purpose**: Match user question to internal experts
**When Used**: "Who can help me with X?", "I need to talk to someone about Y"

**Matching Algorithm**:

- Expertise similarity: 40% (cosine similarity of embeddings)
- Performance: 30% (response rate + helpfulness rating)
- Availability: 30% (calendar/status)

**Returns**: Top 3 experts with match scores + context

### 4. GuideNextStepTool

**Name**: `show_step_by_step_guide`
**Purpose**: Iterative visual UI guidance with Gemini Vision
**When Used**: "How do I X?" + screenshot present, "Next" continuation signals

**Key Features**:

- Generates **one step at a time** (not full workflows)
- Adapts to current screen state
- Returns coordinates for overlay arrows/highlights
- Triggers Guide + Overlay windows

---

## Multi-Turn Tool Calling

The agentic loop enables **tool chaining** within a single message.

### Example Flow

**User Message**: "How do I submit an expense report?"

```
┌──────────────────────────────────────────────────────────┐
│ Iteration 1: Search Knowledge Base                       │
├──────────────────────────────────────────────────────────┤
│ AI Decision: Call search_knowledge_base                  │
│ Arguments: { query: "expense report submission process" }│
│ Tool Result: Returns policy docs + Slack threads         │
│ Action: Add tool call + result to message history        │
│ Continue Loop ✓                                          │
└──────────────────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────────┐
│ Iteration 2: Generate Visual Guide                       │
├──────────────────────────────────────────────────────────┤
│ AI Decision: Call show_step_by_step_guide                │
│ Arguments: { task: "submit expense report" }             │
│ Tool Result: Step 1 with coordinates + window trigger    │
│ Action:                                                   │
│   • yield window_trigger (launches Guide window)         │
│   • Add tool call + result to message history            │
│ Continue Loop ✓                                          │
└──────────────────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────────┐
│ Iteration 3: Synthesize Natural Response                 │
├──────────────────────────────────────────────────────────┤
│ AI Decision: Direct text response (finish_reason: stop)  │
│ Content: "I can help you submit an expense report.       │
│           Based on our policy, you'll need to...         │
│           Let me show you step by step."                 │
│ Action:                                                   │
│   • Stream chunks word-by-word                           │
│   • yield { type: "complete" }                           │
│   • EXIT loop (return)                                   │
└──────────────────────────────────────────────────────────┘
```

### Message History After Tool Calls

```typescript
messages = [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: "How do I submit an expense report?" },
  { role: "assistant", content: null, tool_calls: [{ function: { name: "search_knowledge_base", ... }}] },
  { role: "tool", content: "Policy docs...", tool_call_id: "call_123" },
  { role: "assistant", content: null, tool_calls: [{ function: { name: "show_step_by_step_guide", ... }}] },
  { role: "tool", content: "Step 1: Click...", tool_call_id: "call_124" },
  // AI synthesizes final response in next iteration
]
```

---

## Streaming Response Format

**SSE Events** sent to frontend via `text/event-stream`:

### Event Types

```typescript
// 1. Text chunk (during streaming)
data: {"type":"chunk","content":"I can "}

// 2. Window trigger (launch Guide or Nudge window)
data: {
  "type":"window_trigger",
  "windowTrigger":{
    "window":"guide",
    "data":{
      "guide":{
        "id":"vision-123",
        "title":"Submit expense report",
        "steps":[{
          "stepNumber":1,
          "instruction":"Click 'New Request'",
          "targetElement":{
            "label":"New Request",
            "boundingBox":{"x":100,"y":200,"width":150,"height":40}
          }
        }]
      }
    }
  }
}

// 3. Completion (full content + metadata)
data: {
  "type":"complete",
  "content":"Full message text here...",
  "messageType":"workflow",
  "cardData":{
    "stepNumber":1,
    "instruction":"Click 'New Request'",
    "targetElement":{...}
  }
}

// 4. Done (database message ID)
data: {"type":"done","messageId":"uuid-abc-123"}

// 5. Error (if something fails)
data: {"type":"error","error":"Tool execution failed"}

// 6. Keepalive ping (every 15 seconds)
:ping
```

### Frontend Handling

**Location**: `apps/electron/src/renderer/agent/src/api/conversations.ts`

```typescript
export async function sendMessageStream(
  conversationId: string,
  content: string,
  screenshot: string | null,
  callbacks: {
    onChunk: (chunk: string) => void;
    onComplete: (content, messageId, messageType, cardData, windowTrigger) => void;
    onWindowTrigger: (window: "guide" | "nudge", data: any) => void;
    onError: (error: string) => void;
  }
) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, screenshot }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.substring(6));

        if (data.type === "chunk") callbacks.onChunk(data.content);
        if (data.type === "window_trigger")
          callbacks.onWindowTrigger(data.windowTrigger.window, data.windowTrigger.data);
        if (data.type === "complete")
          callbacks.onComplete(
            data.content,
            data.messageId,
            data.messageType,
            data.cardData,
            data.windowTrigger
          );
        if (data.type === "error") callbacks.onError(data.error);
      }
    }
  }
}
```

---

## Key Services

### 1. Workflow Service

**Location**: `apps/backend/src/services/workflow.service.ts`

**Purpose**: Detect when user is requesting step-by-step guidance

**Logic**:

```typescript
shouldEnterWorkflowMode(message: string, history: Message[]): boolean {
  const patterns = [
    /how do i/i,
    /show me how/i,
    /walk me through/i,
    /guide me/i,
    /step by step/i
  ];

  return patterns.some(p => p.test(message)) && hasScreenshot;
}
```

### 2. Continuation Detector Service

**Location**: `apps/backend/src/services/continuation-detector.service.ts`

**Purpose**: Detect "Next", "Done", "Okay" signals during workflows

**Features**:

- Keyword matching ("next", "done", "okay", "continue")
- Screenshot hash comparison (detects UI changes)
- Confidence scoring (0-1)
- Signal types: continuation, completion, rejection

**Example**:

```typescript
detectContinuation("Done", lastMessage, currentHash, previousHash) {
  // Returns:
  {
    isContinuation: true,
    type: "continuation",
    confidence: 0.9,
    reason: "Keyword match + screenshot changed"
  }
}
```

### 3. Gemini Vision Service

**Location**: `apps/backend/src/services/gemini-vision.service.ts`

**Purpose**: Analyze screenshots using Google Gemini 2.0 Flash

**Capabilities**:

- UI element detection with bounding boxes
- Screen description generation
- Application context identification
- Element relevance scoring

**Process**:

1. Convert base64 screenshot to image buffer
2. Send to Gemini Vision API with prompt
3. Parse JSON response with elements array
4. Return structured VisionResult

### 4. Vector Service

**Location**: `apps/backend/src/services/vector.service.ts`

**Purpose**: Semantic search in Pinecone vector database

**Features**:

- Upsert document embeddings (1536 dimensions)
- Query with filters (organizationId, documentType)
- Top-K similarity search
- Metadata return (title, url, chunk_index)

### 5. Expert Matching Service

**Location**: `apps/backend/src/services/expertMatching.service.ts`

**Purpose**: Find best experts for user questions

**Scoring Algorithm**:

```typescript
finalScore = expertiseSimilarity * 0.4 + performanceScore * 0.3 + availabilityScore * 0.3;
```

**Returns**: Top 3 experts with match scores > 0.6

---

## Complete Message Journey

### End-to-End Flow

```
┌────────────────────────────────────────────────────────────┐
│ FRONTEND: Agent Window                                     │
├────────────────────────────────────────────────────────────┤
│ User types: "How do I submit expenses?"                    │
│ Auto-capture screenshot: window.agentAPI.captureScreenshot()│
│ Result: base64 data URL (PNG, ~200-500KB)                 │
└────────────────────────────────────────────────────────────┘
         ↓ HTTP POST
┌────────────────────────────────────────────────────────────┐
│ BACKEND: conversations.ts (routes)                         │
├────────────────────────────────────────────────────────────┤
│ POST /conversations/:id/messages/stream                    │
│ Body: { content, screenshot }                              │
│ Actions:                                                    │
│   • Authenticate user (JWT token)                          │
│   • Verify conversation ownership                          │
│   • Save user message to DB                                │
│   • Fetch last 20 messages for context                     │
│   • Set up SSE headers                                     │
└────────────────────────────────────────────────────────────┘
         ↓ Service Call
┌────────────────────────────────────────────────────────────┐
│ BACKEND: agent.service.ts                                  │
├────────────────────────────────────────────────────────────┤
│ agentService.processMessage(message, context)              │
│ Actions:                                                    │
│   • Detect workflow mode: ✓ (has "how do I" + screenshot)  │
│   • Check continuation: ✗ (first message)                  │
│   • Build message array with system prompt + history       │
└────────────────────────────────────────────────────────────┘
         ↓ AI Call
┌────────────────────────────────────────────────────────────┐
│ OPENAI API: Function Calling                               │
├────────────────────────────────────────────────────────────┤
│ Request:                                                    │
│   model: "gpt-4o"                                          │
│   messages: [system, ...history, user]                     │
│   tools: [respond_text, search_knowledge, find_expert,     │
│            show_step_by_step_guide]                        │
│   tool_choice: { function: { name: "show_step_by_step_guide" }}│
│   stream: true                                             │
│                                                             │
│ Response (streaming):                                       │
│   • tool_calls[0]: { function: { name: "show_step_by_step_guide",│
│                      arguments: '{"task":"submit expenses"}' }}│
└────────────────────────────────────────────────────────────┘
         ↓ Tool Execution
┌────────────────────────────────────────────────────────────┐
│ BACKEND: guide-next-step.tool.ts                           │
├────────────────────────────────────────────────────────────┤
│ execute({ task: "submit expenses" }, context)              │
│ Actions:                                                    │
│   • Validate screenshot present: ✓                         │
│   • Send screenshot → Gemini Vision API                    │
└────────────────────────────────────────────────────────────┘
         ↓ Vision API
┌────────────────────────────────────────────────────────────┐
│ GEMINI VISION: Screenshot Analysis                         │
├────────────────────────────────────────────────────────────┤
│ analyzeScreenshot(screenshot, "submit expenses")           │
│ Response:                                                   │
│   applicationContext: "Expense tracking dashboard"         │
│   screenDescription: "Dashboard showing recent expenses..."│
│   elements: [                                               │
│     {                                                       │
│       label: "New Expense",                                │
│       type: "button",                                      │
│       boundingBox: { x: 150, y: 80, width: 120, height: 40 },│
│       confidence: 0.95                                      │
│     }                                                       │
│   ]                                                         │
└────────────────────────────────────────────────────────────┘
         ↓ Return to Tool
┌────────────────────────────────────────────────────────────┐
│ BACKEND: guide-next-step.tool.ts                           │
├────────────────────────────────────────────────────────────┤
│ Find relevant element: "New Expense" button                │
│ Generate instruction: "Click 'New Expense'"                │
│ Return ToolResult:                                          │
│   {                                                         │
│     messageType: "workflow",                               │
│     content: "I can see you're on the expense dashboard... │
│               To submit expenses, click 'New Expense'.",   │
│     cardData: { stepNumber: 1, instruction: "Click...", ... },│
│     triggerWindow: {                                        │
│       window: "guide",                                     │
│       data: { guide: { steps: [...], currentStep: 0 }}     │
│     }                                                       │
│   }                                                         │
└────────────────────────────────────────────────────────────┘
         ↓ Yield Events
┌────────────────────────────────────────────────────────────┐
│ BACKEND: agent.service.ts (Agentic Loop Iteration 1)      │
├────────────────────────────────────────────────────────────┤
│ Tool result received                                        │
│ Actions:                                                    │
│   • yield { type: "window_trigger", windowTrigger: {...} } │
│   • Add tool call to message history                       │
│   • Add tool result to message history                     │
│   • Continue loop (let AI synthesize response)             │
└────────────────────────────────────────────────────────────┘
         ↓ AI Call (Iteration 2)
┌────────────────────────────────────────────────────────────┐
│ OPENAI API: Synthesis                                      │
├────────────────────────────────────────────────────────────┤
│ Request:                                                    │
│   messages: [system, user, assistant+toolCall, tool result]│
│   tools: [same as before]                                  │
│   tool_choice: "auto"                                      │
│                                                             │
│ Response (streaming):                                       │
│   content: "I can help you submit an expense report.       │
│             Let me show you step by step. First, click     │
│             the 'New Expense' button I've highlighted..."  │
│   finish_reason: "stop"                                    │
└────────────────────────────────────────────────────────────┘
         ↓ Stream Text
┌────────────────────────────────────────────────────────────┐
│ BACKEND: agent.service.ts (Agentic Loop Iteration 2)      │
├────────────────────────────────────────────────────────────┤
│ AI returned text content (no tool call)                    │
│ Actions:                                                    │
│   • Split into words: ["I", "can", "help", ...]           │
│   • yield { type: "chunk", content: "I " }                 │
│   • delay 20ms                                             │
│   • yield { type: "chunk", content: "can " }               │
│   • ... (continue for all words)                           │
│   • yield { type: "complete", content: full text }         │
│   • EXIT loop (return)                                     │
└────────────────────────────────────────────────────────────┘
         ↓ SSE Events
┌────────────────────────────────────────────────────────────┐
│ BACKEND: conversations.ts (SSE Stream)                     │
├────────────────────────────────────────────────────────────┤
│ For each yielded chunk:                                     │
│   res.write(`data: ${JSON.stringify(chunk)}\n\n`)          │
│                                                             │
│ Events sent:                                                │
│   data: {"type":"window_trigger","windowTrigger":{...}}    │
│   data: {"type":"chunk","content":"I "}                    │
│   data: {"type":"chunk","content":"can "}                  │
│   data: {"type":"chunk","content":"help "}                 │
│   ... (all chunks)                                          │
│   data: {"type":"complete","content":"Full text..."}       │
│                                                             │
│ After streaming complete:                                   │
│   • Save assistant message to DB                           │
│   • Update conversation.updatedAt                          │
│   • Send final event: {"type":"done","messageId":"uuid"}   │
│   • res.end()                                              │
└────────────────────────────────────────────────────────────┘
         ↓ EventSource
┌────────────────────────────────────────────────────────────┐
│ FRONTEND: conversations.ts (API Client)                    │
├────────────────────────────────────────────────────────────┤
│ sendMessageStream(conversationId, content, screenshot, {   │
│   onChunk: (chunk) => {                                    │
│     // Append chunk to UI                                  │
│     setMessages(prev => prev.map(msg =>                    │
│       msg.id === streamingId                               │
│         ? { ...msg, content: msg.content + chunk }         │
│         : msg                                              │
│     ))                                                      │
│   },                                                        │
│   onWindowTrigger: (window, data) => {                     │
│     // Launch Guide window via IPC                         │
│     if (window === "guide") {                              │
│       window.agentAPI.startGuide(data.guide)               │
│     }                                                       │
│   },                                                        │
│   onComplete: (content, messageId, messageType, cardData) => {│
│     // Update message with final content + metadata        │
│     setMessages(prev => prev.map(msg =>                    │
│       msg.id === streamingId                               │
│         ? { ...msg, id: messageId, content, cardData }     │
│         : msg                                              │
│     ))                                                      │
│   }                                                         │
│ })                                                          │
└────────────────────────────────────────────────────────────┘
         ↓ IPC Event
┌────────────────────────────────────────────────────────────┐
│ ELECTRON MAIN: main.ts                                     │
├────────────────────────────────────────────────────────────┤
│ ipcMain.on("guide-start", (event, guideData) => {          │
│   // Show guide window                                     │
│   guideWindow.webContents.send("guide-data", guideData)    │
│   guideWindow.show()                                        │
│                                                             │
│   // Update overlay window with highlights                 │
│   overlayWindow.webContents.send("overlay-highlight-update",│
│     guideData.steps[0].targetElement)                      │
│                                                             │
│   // Hide nudge window (mutual exclusivity)                │
│   if (nudgeWindow?.isVisible()) nudgeWindow.hide()         │
│ })                                                          │
└────────────────────────────────────────────────────────────┘
         ↓ Render
┌────────────────────────────────────────────────────────────┐
│ FRONTEND: Guide Window + Overlay Window                    │
├────────────────────────────────────────────────────────────┤
│ Guide Window:                                               │
│   • Display step instruction: "Click 'New Expense'"        │
│   • Show "Done" button for continuation                    │
│                                                             │
│ Overlay Window:                                             │
│   • Draw arrow pointing to { x: 150, y: 80 }              │
│   • Highlight bounding box around button                   │
│   • Pulse animation on target element                      │
└────────────────────────────────────────────────────────────┘
```

### Continuation Flow (User clicks "Done")

```
Guide Window: User clicks "Done" button
    ↓
Guide sends IPC: "guide-next-step"
    ↓
Main process forwards to Agent: window.agentAPI.onGuideNextStep()
    ↓
Agent automatically submits: handleSubmit("Next")
    ↓
Backend receives: "Next" + new screenshot
    ↓
Continuation detector: confidence = 0.9 (keyword + screen changed)
    ↓
Auto-trigger GuideNextStepTool (skip AI decision)
    ↓
Gemini Vision analyzes new screenshot
    ↓
Generate Step 2 based on current UI state
    ↓
Stream response → Update Guide window → Update Overlay
```

---

## Performance Targets

**Phase 1.1 Acceptance Criteria**:

- **Total Response Time**: <4 seconds end-to-end
  - Screenshot capture: <500ms
  - AI processing: <2s
  - Vision API: <1.5s
  - Streaming latency: <500ms

- **Memory Usage**: <100MB during processing

- **Concurrency**: Handle 10+ simultaneous users

---

## Error Handling

### Tool Execution Errors

```typescript
try {
  const toolResult = await tool.execute(args, context);
} catch (error) {
  console.error(`[AgentService] Tool execution failed:`, error);

  // Continue with error message in tool result
  messages.push({
    role: "tool",
    content: `Error: ${error.message}. Please try a different approach.`,
    tool_call_id: toolCallId,
  });

  // AI will receive error and adapt response
}
```

### Streaming Errors

```typescript
try {
  for await (const chunk of agentService.processMessage(...)) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
} catch (streamError) {
  console.error("[Stream] Error during streaming:", streamError);

  // Send error event to client
  res.write(`data: ${JSON.stringify({
    type: "error",
    error: streamError.message
  })}\n\n`);
}
```

### Max Iterations Safeguard

```typescript
const MAX_ITERATIONS = 5;

if (iterationCount >= MAX_ITERATIONS) {
  console.warn(`[AgentService] Max iterations reached`);

  yield {
    type: "complete",
    content: "I'm having trouble processing your request. Could you please rephrase?"
  };
}
```

---

## Summary

The backend agent loop is a sophisticated **multi-turn conversational AI system** that:

1. **Detects user intent** (workflow mode, continuation, questions)
2. **Chooses appropriate tools** dynamically via OpenAI function calling
3. **Chains multiple tools** in a single message for complex tasks
4. **Streams responses** incrementally for better UX
5. **Triggers secondary windows** (Guide, Nudge) with structured data
6. **Adapts to screen context** using Gemini Vision for visual guidance

The key innovation is the **iterative tool calling loop** that allows the AI to gather information, analyze screenshots, generate guides, and synthesize natural responses - all within a single user message flow.
