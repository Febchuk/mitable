# Multi-Agent Architecture Specification

**Version**: 2.0
**Last Updated**: 2025-01-16
**Status**: Proposed Architecture

---

## Table of Contents

1. [Introduction](#introduction)
2. [Type System Architecture](#type-system-architecture)
3. [Core Components](#core-components)
4. [Agent Specifications](#agent-specifications)
5. [Tool Specifications](#tool-specifications)
6. [Inter-Agent Communication](#inter-agent-communication)
7. [Tool Assignment Matrix](#tool-assignment-matrix)
8. [Type Safety Examples](#type-safety-examples)
9. [Migration from Single Agent](#migration-from-single-agent)

---

## Introduction

### Overview

Mitable's agentic system has evolved from a **single monolithic agent** to a **multi-agent orchestration architecture**. This architecture separates concerns by domain, optimizes model usage for cost efficiency, and enables parallel execution for improved performance.

### Why Multi-Agent?

**Problems with Single-Agent Approach**:

- ❌ Token waste: ~2,000 tokens of tool definitions per request, even for simple "Hello" messages
- ❌ Cognitive overload: GPT-4 chooses from 11 tools, leading to occasional incorrect selections
- ❌ Cost inefficiency: Using expensive GPT-4 for simple text responses (60% of requests)
- ❌ No parallelization: Knowledge search + vision analysis run sequentially
- ❌ System hint anti-pattern: "Begging" GPT-4 to pick the right tool instead of deterministic routing

**Benefits of Multi-Agent Approach**:

- ✅ **40-60% cost reduction**: Use cheaper models (Gemini Flash, GPT-3.5) for simple tasks
- ✅ **30-50% latency reduction**: Parallel execution of knowledge + vision calls
- ✅ **Deterministic routing**: Explicit logic instead of hoping AI follows hints
- ✅ **Better scalability**: Scale expensive agents independently
- ✅ **Cleaner architecture**: Domain separation, easier maintenance

### System Architecture

```
User Message → Orchestrator Agent → Route to Specialized Agent → Return Response
                    ↓
          (may delegate to other agents)
```

**5 Specialized Agents**:

1. **Orchestrator** - Lightweight router (Gemini Flash)
2. **Text Response** - Simple responses (Gemini Flash)
3. **Knowledge** - Search & synthesis (GPT-4)
4. **Visual Guidance** - UI workflows (GPT-4 + Vision)
5. **Expert Matching** - Find colleagues (GPT-3.5)

---

## Type System Architecture

### Base Types

```typescript
// apps/backend/src/tools/base.tool.ts

// ============================================================================
// SOURCE TYPES
// ============================================================================

export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface WindowTrigger {
  window: "nudge" | "guide";
  data: Record<string, any>;
}

// ============================================================================
// MESSAGE TYPES (Discriminated Union)
// ============================================================================

export interface BaseMessage {
  content: string;
  streamable: boolean;
  sources?: Source[];
  triggerWindow?: WindowTrigger;
}

export interface TextMessage extends BaseMessage {
  messageType: "text";
  cardData?: never; // Explicitly no cardData for text messages
}

export interface WorkflowMessage extends BaseMessage {
  messageType: "workflow";
  cardData: {
    // Full SolutionObject (from @mitable/shared)
    solution: string;
    supportingData: EmbeddingMatch[];
    solutionExplanation: string;
    supportingDataExplanation: string;
    stepList: Step[];
    currentStepIndex: number;
    searchQuery: string;
    adjustmentHistory: AdjustmentRecord[];
    // Workflow UI state
    workflowActive: true;
    workflowPhase: WorkflowPhase;
  };
}

export interface ExpertsMessage extends BaseMessage {
  messageType: "experts";
  cardData: {
    experts: ExpertMatch[];
  };
}

// Final output type (discriminated union)
export type ToolResult = TextMessage | WorkflowMessage | ExpertsMessage;

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface ToolContext {
  conversationId: string;
  userId: string;
  organizationId: string;
  conversationHistory: Message[];
  screenshots?: WindowScreenshot[];
  userProfile?: {
    name: string;
    email: string;
    organizationId: string;
  };
  metadata?: {
    workflowAction?: "progress_step" | "custom_question" | "exit_workflow";
    selectedOption?: number;
    [key: string]: any;
  };
  workflowState?: SolutionObject; // Pre-loaded by orchestrator
}

// ============================================================================
// STREAMING TYPES
// ============================================================================

export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "window_trigger";
  content?: string;
  messageId?: string;
  messageType?: "text" | "workflow" | "experts";
  cardData?: Record<string, any>;
  sources?: Source[];
  error?: string;
  windowTrigger?: WindowTrigger;
}
```

### Supporting Types (from @mitable/shared)

```typescript
// packages/shared/src/guides.ts

export interface Step {
  stepNumber: number;
  description: string;
  status: "pending" | "current" | "completed";
}

export interface AdjustmentRecord {
  timestamp: Date;
  reason: string;
  oldPlan: Step[];
  newPlan: Step[];
}

export interface SolutionObject {
  solution: string;
  supportingData: EmbeddingMatch[];
  solutionExplanation: string;
  supportingDataExplanation: string;
  stepList: Step[];
  currentStepIndex: number;
  searchQuery: string;
  adjustmentHistory: AdjustmentRecord[];
}

export type WorkflowPhase =
  | "initial_proposal" // Showing preview, waiting for "Start"
  | "step_progression" // Executing steps one-by-one
  | "custom_question"; // User asked question during workflow

export interface EmbeddingMatch {
  text: string;
  source: string;
  metadata: {
    score: number;
    [key: string]: any;
  };
}

export interface ExpertMatch {
  id: string;
  name: string;
  title: string;
  expertise: {
    topics: string[];
    matchScore: number; // 0.0 - 1.0
  };
  performance: {
    responseRate: number; // 0.0 - 1.0
    helpfulnessScore: number; // 1.0 - 5.0
    avgResponseTime: number; // minutes
  };
  availability: {
    status: "online" | "away" | "offline";
    nextAvailable?: Date;
  };
  matchScore: number; // Overall weighted score (0.0 - 1.0)
}
```

---

## Core Components

### Smart Wrapper Utility

The smart wrapper automatically detects workflow state and wraps text messages accordingly.

```typescript
// apps/backend/src/tools/utils/workflow-wrapper.ts

/**
 * Wraps base text messages with workflow state if active workflow exists
 *
 * @param baseMessage - Must be TextMessage type
 * @param context - Tool context with optional workflowState
 * @param workflowPhase - Phase to set if wrapping (default: "custom_question")
 * @returns TextMessage (no workflow) or WorkflowMessage (has workflow)
 */
export async function wrapWithWorkflowState(
  baseMessage: TextMessage,
  context: ToolContext,
  workflowPhase: WorkflowPhase = "custom_question"
): Promise<TextMessage | WorkflowMessage> {
  // Check if workflow state exists (pre-loaded by orchestrator)
  const workflowState = context.workflowState;

  // No workflow → return as-is
  if (!workflowState) {
    return baseMessage;
  }

  // Wrap with workflow state
  return {
    ...baseMessage,
    messageType: "workflow",
    cardData: {
      ...workflowState,
      workflowActive: true,
      workflowPhase,
    },
  };
}
```

### Type Guards

```typescript
// apps/backend/src/tools/utils/type-guards.ts

export function isTextMessage(msg: ToolResult): msg is TextMessage {
  return msg.messageType === "text";
}

export function isWorkflowMessage(msg: ToolResult): msg is WorkflowMessage {
  return msg.messageType === "workflow" && msg.cardData?.workflowActive === true;
}

export function isExpertsMessage(msg: ToolResult): msg is ExpertsMessage {
  return msg.messageType === "experts";
}
```

### Workflow State Management

**Storage**: Workflow state is stored in `messages.cardData` for workflow-type messages.

**Retrieval**: Orchestrator pre-loads workflow state for all agents via `guideGenerationService.retrieveLatestSolutionObject(conversationId)`.

**Benefits**:

- ✅ Single retrieval per request (orchestrator loads once)
- ✅ All agents receive `workflowState` in context
- ✅ Tools use smart wrapper to decide if wrapping needed
- ✅ No duplicate storage (only initial workflow message stores full state, subsequent messages reference it)

---

## Agent Specifications

### 1. Orchestrator Agent

**Purpose**: Lightweight router that classifies intent and delegates to specialized agents

**Model**: Gemini 1.5 Flash

**File**: `apps/backend/src/services/orchestrator.service.ts`

**Responsibilities**:

- Receive all incoming user messages
- Classify intent using Gemini Flash
- Parse UI metadata (workflowAction)
- Pre-load workflow state for all agents
- Route to appropriate specialized agent
- Aggregate results if multiple agents needed
- Return final response to user

**Tools Available**:

1. `classify_intent` - Analyzes user message to determine type
2. `extract_metadata` - Parses UI metadata

**Routing Decision Tree**:

```typescript
async route(message: AgentContext): Promise<AgentResponse> {
  // 1. Check metadata first (deterministic)
  if (message.metadata?.workflowAction === "progress_step") {
    return await visualGuidanceAgent.execute(message);
  }

  if (message.metadata?.workflowAction === "exit_workflow") {
    return await textAgent.execute(message);
  }

  // 2. Classify intent (Gemini Flash)
  const intent = await this.classifyIntent(message);

  // 3. Route based on intent + context
  if (intent.type === "workflow_start" && message.screenshot) {
    return await visualGuidanceAgent.execute(message);
  }

  if (intent.type === "knowledge_search") {
    const result = await knowledgeAgent.execute(message);

    // Fallback to expert if no results
    if (result.sources?.length === 0) {
      return await expertMatchingAgent.execute(message);
    }

    return result;
  }

  if (intent.type === "expert_request") {
    return await expertMatchingAgent.execute(message);
  }

  // 4. Default to text agent
  return await textAgent.execute(message);
}
```

**Communication**:

- **Receives from**: API layer (conversation routes)
- **Delegates to**: All specialized agents
- **Returns to**: API layer

**Does NOT have access to**: Domain-specific tools (search, vision, expert matching)

---

### 2. Text Response Agent

**Purpose**: Handle simple conversational responses without external data

**Model**: Gemini 1.5 Flash (10x cheaper than GPT-4)

**File**: `apps/backend/src/agents/text-response.agent.ts`

**Handles**:

- General questions without knowledge base needs
- Acknowledgments ("Got it", "Sounds good")
- Clarifications
- Conceptual explanations (no external data)
- Workflow conceptual questions ("Why do I need this step?")

**Tools Available**:

1. `respond_with_text` - Generate conversational text response

**When to Use**:

- No screenshot required
- No knowledge search required
- No expert matching required
- Simple Q&A, chitchat

**Communication**:

- **Receives from**: Orchestrator Agent
- **Delegates to**: None (terminal agent)
- **Returns to**: Orchestrator Agent

**Cost Savings**: ~60% of requests, 10x cheaper = **6x overall cost reduction**

---

### 3. Knowledge Agent

**Purpose**: Search and synthesize information from knowledge base (Slack + Notion)

**Model**: GPT-4 Turbo (needs reasoning for synthesis)

**File**: `apps/backend/src/agents/knowledge.agent.ts`

**Handles**:

- Documentation questions
- Policy/process questions
- Historical information ("What did we discuss last month?")
- Company-specific information

**Tools Available**:

1. `search_knowledge` - Hybrid search through Slack messages + Notion pages
2. `detect_intent` - Classify query type (company/product/operations/technical)
3. `apply_trust_ranking` - Boost relevant sources based on intent
4. `parse_temporal_keywords` - Parse "last week", "yesterday", etc.

**Services Used**:

- `searchService` - Hybrid search (Pinecone + PostgreSQL)
- `intentService` - Intent classification
- `trustRankingService` - Result ranking
- `embeddingService` - Generate query embeddings

**Trust Ranking Weights**:

- Company questions → Boost Notion/Google Drive 2.5x
- Product questions → Boost PRDs/roadmaps 2.0x
- Operations questions → Boost Slack conversations 2.5x
- Technical questions → Boost codebase 3.0x, docs 1.5x

**Communication**:

- **Receives from**: Orchestrator Agent OR Visual Guidance Agent
- **Can be called by**: Visual Guidance Agent (for knowledge-grounded workflows)
- **Delegates to**: None
- **Returns to**: Caller (Orchestrator or Visual Guidance Agent)

**Inter-Agent Communication**:

```typescript
Visual Guidance Agent → Knowledge Agent.search()
                      ← Returns search results
Visual Guidance Agent → Uses results as supportingData for workflow
```

---

### 4. Visual Guidance Agent

**Purpose**: Multi-step UI guidance with screenshot analysis

**Model**: GPT-4 Turbo + Gemini Vision 2.0 Flash

**File**: `apps/backend/src/agents/visual-guidance.agent.ts`

**Handles**:

- "How do I..." questions with screenshots
- Step-by-step UI guidance
- Workflow progression
- Screen troubleshooting
- Vague prompt clarification

**Tools Available**:

1. `clarify_intent` - Analyze vague prompts with screenshots, offer specific interpretations
2. `start_ui_guidance_workflow` - Create initial step-by-step plan
3. `guide_next_step` - Progress to next step, analyze screen, generate visual guidance
4. `analyze_workflow_screen` - Troubleshoot visual issues during workflow

**Services Used**:

- `geminiVisionService` - Screenshot analysis
  - `analyzeScreenshot()` - UI element detection
  - `evaluateProgress()` - Plan adjustment detection
  - `analyzeStepExecution()` - Step-specific guidance
  - `interpretVaguePrompt()` - Intent clarification
- `guideGenerationService` - Workflow state management
  - `retrieveLatestSolutionObject()` - State retrieval

**Complexity Detection**:

- **LOW (3-5 steps)**: Single app, linear workflow
- **MEDIUM (5-8 steps)**: Multi-app, nested menus
- **HIGH (8-12+ steps)**: Debugging, multi-system tracing

**Communication**:

- **Receives from**: Orchestrator Agent
- **Delegates to**: Knowledge Agent (for knowledge-grounded workflows)
- **Returns to**: Orchestrator Agent
- **Triggers**: Guide Window (via triggerWindow mechanism)

**Inter-Agent Communication Pattern**:

```typescript
User: "How do I update the roadmap?" + screenshot

Orchestrator → Visual Guidance Agent.clarifyOrStart()
                ↓
Visual Guidance Agent → Knowledge Agent.search("roadmap update")
                      ← Returns: Slack messages + Notion docs
                ↓
Visual Guidance Agent → Synthesizes search results + screenshot analysis
                      → Creates SolutionObject with stepList
                ↓
              ← Returns workflow preview
```

**State Management**:

- Maintains workflow state in conversation cardData
- Retrieves state from `context.workflowState` (pre-loaded by orchestrator)

---

### 5. Expert Matching Agent

**Purpose**: Match users with expert colleagues

**Model**: GPT-3.5 Turbo (cheaper for simple matching logic)

**File**: `apps/backend/src/agents/expert-matching.agent.ts`

**Handles**:

- "Who can help with..." questions
- Expert recommendations
- Fallback when knowledge search fails

**Tools Available**:

1. `find_expert_colleague` - Score and rank experts
2. `calculate_expertise_score` - Semantic similarity of expert topics vs query
3. `calculate_performance_score` - Response rate + helpfulness rating
4. `calculate_availability_score` - Online status + calendar

**Scoring Algorithm**:

- Expertise similarity (40%): Cosine similarity of embeddings
- Performance (30%): Response rate + helpfulness score
- Availability (30%): Online status

**Services Used**:

- `expertMatchingService` - Scoring algorithm
- `embeddingService` - Generate topic embeddings

**Communication**:

- **Receives from**: Orchestrator Agent OR Knowledge Agent (fallback)
- **Delegates to**: None
- **Returns to**: Caller
- **Triggers**: Nudge Window (via triggerWindow mechanism)

**Inter-Agent Communication Pattern (Fallback)**:

```typescript
User: "What is [obscure topic]?"

Orchestrator → Knowledge Agent.search()
             ← Returns: No results found
             ↓
Orchestrator detects empty results
             ↓
Orchestrator → Expert Matching Agent.findExperts()
             ← Returns: Expert cards
```

---

## Tool Specifications

### Orchestrator Tools

#### `classify_intent`

**Input**:

```typescript
interface ClassifyIntentInput {
  message: string;
  hasScreenshot: boolean;
  recentMessages: Message[]; // Last 3 messages for context
}
```

**Output**:

```typescript
interface ClassifyIntentOutput {
  type: "general_chat" | "knowledge_search" | "workflow_start" | "expert_request";
  confidence: number; // 0.0 - 1.0
  reasoning?: string; // Optional explanation
}
```

**Usage**: Internal to orchestrator, uses Gemini Flash for cheap classification

---

#### `extract_metadata`

**Input**:

```typescript
interface ExtractMetadataInput {
  metadata: Record<string, any>; // Raw metadata from frontend
}
```

**Output**:

```typescript
interface ExtractMetadataOutput {
  workflowAction?: "progress_step" | "custom_question" | "exit_workflow";
  selectedOption?: number;
  hasWorkflowContext: boolean;
}
```

**Usage**: Parses UI metadata for deterministic routing

---

### Text Response Tools

#### `respond_with_text`

**Input**:

```typescript
interface RespondWithTextInput {
  response: string; // The text response to send
}
```

**Output**:

```typescript
type RespondWithTextOutput = TextMessage;
```

**Smart Wrapper Behavior**:

- No workflow state → Returns `TextMessage`
- Has workflow state → Returns `WorkflowMessage` with cardData

**Implementation**:

```typescript
class RespondTextTool extends BaseTool {
  async execute(args: RespondWithTextInput, context: ToolContext): Promise<TextMessage> {
    return {
      messageType: "text",
      content: args.response,
      streamable: true,
    };
  }
}

// After smart wrapper
const finalResult = await wrapWithWorkflowState(baseMessage, context);
// Type: TextMessage | WorkflowMessage
```

---

### Knowledge Tools

#### `search_knowledge`

**Input**:

```typescript
interface SearchKnowledgeInput {
  query: string;
  topK?: number; // Default: 10, max: 15
}
```

**Output**:

```typescript
interface SearchKnowledgeOutput extends TextMessage {
  sources: Source[]; // ALWAYS includes sources
}
```

**Smart Wrapper Behavior**:

- No workflow state → Returns `TextMessage` with sources
- Has workflow state → Returns `WorkflowMessage` with sources + cardData

**Implementation**:

```typescript
class SearchKnowledgeTool extends BaseTool {
  async execute(args: SearchKnowledgeInput, context: ToolContext): Promise<SearchKnowledgeOutput> {
    // 1. Detect intent
    const intent = await intentService.analyzeIntent({
      message: args.query,
      conversationHistory: context.conversationHistory,
    });

    // 2. Hybrid search (Pinecone semantic + PostgreSQL keyword)
    const searchResponse = await searchService.search({
      query: args.query,
      organizationId: context.organizationId,
      topK: args.topK || 10,
    });

    // 3. Apply trust ranking
    const rankedResults = trustRankingService.applyTrustRanking(
      searchResponse.results,
      intent,
      args.query
    );

    // 4. Format as sources
    const sources = rankedResults.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.text.substring(0, 150),
    }));

    return {
      messageType: "text",
      content: formattedContext,
      sources: sources,
      streamable: true,
    };
  }
}

// After smart wrapper
const finalResult = await wrapWithWorkflowState(baseMessage, context);
// Type: TextMessage | WorkflowMessage (both include sources)
```

---

#### `detect_intent` (Internal Utility)

**Input**:

```typescript
interface DetectIntentInput {
  message: string;
  conversationHistory: Message[];
}
```

**Output**:

```typescript
interface DetectIntentOutput {
  type: "company" | "product" | "operations" | "technical" | "greeting" | "general";
  confidence: number;
}
```

**Usage**: Internal to `search_knowledge` for trust ranking

---

#### `apply_trust_ranking` (Internal Utility)

**Input**:

```typescript
interface ApplyTrustRankingInput {
  results: SearchResult[];
  intent: DetectIntentOutput;
  query: string;
}
```

**Output**:

```typescript
interface ApplyTrustRankingOutput {
  rankedResults: SearchResult[]; // Re-ranked based on trust weights
}
```

**Usage**: Internal to `search_knowledge` for boosting relevant sources

---

### Visual Guidance Tools

#### `clarify_intent`

**Input**:

```typescript
interface ClarifyIntentInput {
  vaguePrompt: string; // User's vague question like "How do I do this?"
  screenshot: string; // Base64 screenshot (REQUIRED)
}
```

**Output**:

```typescript
interface ClarifyIntentOutput extends TextMessage {
  cardData: {
    interpretations: Array<{
      task: string; // "Submit expense report"
      confidence: number; // 0.85
      reasoning: string; // "Saw Workday app with expense form"
    }>;
  };
}
```

**Implementation**:

```typescript
class ClarifyIntentTool extends BaseTool {
  async execute(args: ClarifyIntentInput, context: ToolContext): Promise<ClarifyIntentOutput> {
    // Call Gemini Vision to analyze screenshot
    const interpretations = await geminiVisionService.interpretVaguePrompt(
      args.vaguePrompt,
      args.screenshot
    );

    return {
      messageType: "text",
      content: "I see a few things you might be trying to do. Which one?",
      cardData: { interpretations },
      streamable: false,
    };
  }
}
```

---

#### `start_ui_guidance_workflow`

**Input**:

```typescript
interface StartUIGuidanceWorkflowInput {
  solution: string; // High-level goal
  solutionExplanation: string; // Why this approach
  supportingData: EmbeddingMatch[]; // Search results from Knowledge Agent
  searchQuery: string; // Original search query
  supportingDataExplanation: string; // How search results support solution
  stepList: Step[]; // Generated steps
}
```

**Output**:

```typescript
interface StartUIGuidanceWorkflowOutput extends WorkflowMessage {
  cardData: {
    solution: string;
    supportingData: EmbeddingMatch[];
    solutionExplanation: string;
    supportingDataExplanation: string;
    stepList: Step[];
    currentStepIndex: -1; // -1 = preview mode (not started)
    searchQuery: string;
    adjustmentHistory: AdjustmentRecord[];
    workflowActive: true;
    workflowPhase: "initial_proposal";
  };
}
```

**Note**: Returns `WorkflowMessage` directly, smart wrapper is bypassed.

**Implementation**:

```typescript
class StartUIGuidanceWorkflowTool extends BaseTool {
  async execute(
    args: StartUIGuidanceWorkflowInput,
    context: ToolContext
  ): Promise<StartUIGuidanceWorkflowOutput> {
    const solutionObject: SolutionObject = {
      solution: args.solution,
      supportingData: args.supportingData,
      solutionExplanation: args.solutionExplanation,
      supportingDataExplanation: args.supportingDataExplanation,
      stepList: args.stepList.map((s) => ({ ...s, status: "pending" })),
      currentStepIndex: -1, // Preview mode
      searchQuery: args.searchQuery,
      adjustmentHistory: [],
    };

    return {
      messageType: "workflow",
      content: `I'll guide you through ${args.stepList.length} steps...`,
      cardData: {
        ...solutionObject,
        workflowActive: true,
        workflowPhase: "initial_proposal",
      },
      streamable: true,
    };
  }
}
```

---

#### `guide_next_step`

**Input**:

```typescript
interface GuideNextStepInput {
  conversationId: string; // Used to retrieve workflow state
}
```

**Output**:

```typescript
interface GuideNextStepOutput extends WorkflowMessage {
  cardData: {
    // Full SolutionObject with updated state
    solution: string;
    supportingData: EmbeddingMatch[];
    solutionExplanation: string;
    supportingDataExplanation: string;
    stepList: Step[]; // Updated statuses (current step marked)
    currentStepIndex: number; // Incremented
    searchQuery: string;
    adjustmentHistory: AdjustmentRecord[];
    workflowActive: true;
    workflowPhase: "step_progression";
    // Visual guidance data
    visualGuidance?: {
      arrows: Array<{
        from: { x: number; y: number };
        to: { x: number; y: number };
        label: string;
      }>;
      highlights: Array<{
        boundingBox: { x: number; y: number; width: number; height: number };
        color: string;
      }>;
    };
  };
  triggerWindow?: {
    window: "guide";
    data: {
      currentStep: Step;
      totalSteps: number;
    };
  };
}
```

**Note**: Returns `WorkflowMessage` directly, smart wrapper is bypassed.

**Implementation**:

```typescript
class GuideNextStepTool extends BaseTool {
  async execute(args: GuideNextStepInput, context: ToolContext): Promise<GuideNextStepOutput> {
    // Retrieve workflow state (pre-loaded by orchestrator)
    const workflowState = context.workflowState;
    if (!workflowState) {
      throw new Error("No active workflow found");
    }

    // Analyze screenshot with Gemini Vision
    const stepAnalysis = await geminiVisionService.analyzeStepExecution(
      context.screenshot,
      workflowState.stepList[workflowState.currentStepIndex + 1]
    );

    // Update state
    const updatedState = {
      ...workflowState,
      currentStepIndex: workflowState.currentStepIndex + 1,
      stepList: workflowState.stepList.map((step, i) => ({
        ...step,
        status:
          i < workflowState.currentStepIndex + 1
            ? "completed"
            : i === workflowState.currentStepIndex + 1
              ? "current"
              : "pending",
      })),
    };

    return {
      messageType: "workflow",
      content: stepAnalysis.instruction,
      cardData: {
        ...updatedState,
        workflowActive: true,
        workflowPhase: "step_progression",
        visualGuidance: stepAnalysis.visualGuidance,
      },
      triggerWindow: {
        window: "guide",
        data: {
          currentStep: updatedState.stepList[updatedState.currentStepIndex],
          totalSteps: updatedState.stepList.length,
        },
      },
      streamable: true,
    };
  }
}
```

---

#### `analyze_workflow_screen`

**Input**:

```typescript
interface AnalyzeWorkflowScreenInput {
  conversationId: string; // Retrieve workflow state
  issue: string; // User's problem: "I don't see the Save button"
}
```

**Output**:

```typescript
interface AnalyzeWorkflowScreenOutput extends WorkflowMessage {
  cardData: {
    // SolutionObject unchanged (preserved)
    solution: string;
    supportingData: EmbeddingMatch[];
    solutionExplanation: string;
    supportingDataExplanation: string;
    stepList: Step[]; // Same as before
    currentStepIndex: number; // NOT incremented
    searchQuery: string;
    adjustmentHistory: AdjustmentRecord[];
    workflowActive: true;
    workflowPhase: "custom_question"; // Different phase
  };
}
```

**Note**: Returns `WorkflowMessage` directly, smart wrapper is bypassed. Does NOT progress currentStepIndex.

**Implementation**:

```typescript
class AnalyzeWorkflowScreenTool extends BaseTool {
  async execute(
    args: AnalyzeWorkflowScreenInput,
    context: ToolContext
  ): Promise<AnalyzeWorkflowScreenOutput> {
    const workflowState = context.workflowState;
    if (!workflowState) {
      throw new Error("No active workflow");
    }

    // Analyze screen to identify issue
    const analysis = await geminiVisionService.analyzeScreenIssue(
      context.screenshot,
      args.issue,
      workflowState.stepList[workflowState.currentStepIndex]
    );

    return {
      messageType: "workflow",
      content: analysis.explanation,
      cardData: {
        ...workflowState, // State unchanged
        workflowActive: true,
        workflowPhase: "custom_question", // Signals Q&A mode
      },
      streamable: true,
    };
  }
}
```

---

### Expert Matching Tools

#### `find_expert_colleague`

**Input**:

```typescript
interface FindExpertColleagueInput {
  query: string; // Topic or question
  topK?: number; // Default: 3, max: 5
}
```

**Output**:

```typescript
interface FindExpertColleagueOutput extends ExpertsMessage {
  cardData: {
    experts: ExpertMatch[];
  };
  triggerWindow: {
    window: "nudge";
    data: {
      experts: ExpertMatch[];
      query: string;
    };
  };
}
```

**Note**: Returns `ExpertsMessage` directly, smart wrapper is bypassed.

**Implementation**:

```typescript
class FindExpertTool extends BaseTool {
  async execute(
    args: FindExpertColleagueInput,
    context: ToolContext
  ): Promise<FindExpertColleagueOutput> {
    // Find matching experts with weighted scoring
    const experts = await expertMatchingService.findExperts(
      args.query,
      context.organizationId,
      args.topK || 3
    );

    return {
      messageType: "experts",
      content: `I found ${experts.length} experts who can help...`,
      cardData: { experts },
      triggerWindow: {
        window: "nudge",
        data: { experts, query: args.query },
      },
      streamable: true,
    };
  }
}
```

---

## Inter-Agent Communication

### Communication Patterns

#### Pattern 1: Simple Delegation (No Inter-Agent Communication)

```
User: "What is our PTO policy?"
↓
Orchestrator.classifyIntent() → "general_chat"
↓
Orchestrator.route() → Text Agent
↓
Text Agent.respond_with_text()
↓
← Returns text response
```

**Agents involved**: Orchestrator, Text Agent
**Communication**: One-way delegation

---

#### Pattern 2: Knowledge Search

```
User: "What features are in the PRD?"
↓
Orchestrator.classifyIntent() → "knowledge_search"
↓
Orchestrator.route() → Knowledge Agent
↓
Knowledge Agent.search_knowledge()
  ├→ detect_intent() → "product"
  ├→ searchService.search() → Pinecone + PostgreSQL
  ├→ apply_trust_ranking() → Boost PRDs 2.0x
  └→ Returns: Sources with snippets
↓
← Returns text with sources
```

**Agents involved**: Orchestrator, Knowledge Agent
**Communication**: One-way delegation

---

#### Pattern 3: Knowledge-Grounded Visual Guidance (Agent-to-Agent)

```
User: "How do I update the product roadmap?" + screenshot
↓
Orchestrator.classifyIntent() → "workflow_start"
Orchestrator.hasScreenshot() → true
↓
Orchestrator.route() → Visual Guidance Agent
↓
Visual Guidance Agent receives request
↓
Visual Guidance Agent → Knowledge Agent.search_knowledge("product roadmap update")
                       ← Returns: Search results (Slack, Notion)
↓
Visual Guidance Agent → analyze_screenshot(screenshot)
                       ← Returns: Screen context (detected elements)
↓
Visual Guidance Agent → start_ui_guidance_workflow({
  supportingData: searchResults, // From Knowledge Agent
  stepList: synthesized steps
})
↓
← Returns workflow preview
```

**Agents involved**: Orchestrator, Visual Guidance Agent, Knowledge Agent
**Communication**:

- Orchestrator → Visual Guidance (delegation)
- Visual Guidance → Knowledge (direct call)

---

#### Pattern 4: Workflow Progression (Metadata-Driven)

```
User clicks "Move on to next step"
→ metadata.workflowAction = "progress_step"
↓
Orchestrator.extract_metadata() → "progress_step" detected
↓
Orchestrator (deterministic routing, no LLM) → Visual Guidance Agent
↓
Visual Guidance Agent.guide_next_step()
  ├→ retrieve_workflow_state(conversationId)
  ├→ analyze_screenshot(new screenshot)
  ├→ evaluate_progress() → Check if plan needs adjustment
  ├→ update_workflow_state(currentStepIndex + 1)
  └→ Returns: Next step with coordinates
↓
← Returns workflow update + triggers Guide window
```

**Agents involved**: Orchestrator, Visual Guidance Agent
**Communication**: Deterministic routing (no classification needed)

---

#### Pattern 5: Expert Fallback

```
User: "How do we handle customer escalations?"
↓
Orchestrator.classifyIntent() → "knowledge_search"
↓
Orchestrator → Knowledge Agent.search_knowledge()
               ← Returns: No results found
↓
Orchestrator detects empty results
↓
Orchestrator → Expert Matching Agent.find_expert_colleague()
  ├→ calculate_expertise_score() → Semantic similarity
  ├→ calculate_performance_score() → Response rate + rating
  ├→ calculate_availability_score() → Online status
  └→ Returns: Ranked experts
↓
← Returns expert cards + triggers Nudge window
```

**Agents involved**: Orchestrator, Knowledge Agent, Expert Matching Agent
**Communication**: Sequential delegation with fallback logic

---

### Communication Protocol

**Agent-to-Agent Interface**:

```typescript
interface AgentMessage {
  conversationId: string;
  userId: string;
  organizationId: string;
  message: string;
  screenshot?: string;
  metadata?: Record<string, any>;
  conversationHistory: Message[];
  workflowState?: SolutionObject; // Pre-loaded by orchestrator
}

interface AgentResponse {
  messageType: "text" | "workflow" | "experts";
  content: string;
  cardData?: Record<string, any>;
  sources?: Array<{ title: string; url: string; snippet: string }>;
  triggerWindow?: { window: "guide" | "nudge"; data: any };
}
```

**Communication Rules**:

1. ✅ Orchestrator is the only entry point - All user messages go through Orchestrator first
2. ✅ Agents can call other agents directly - e.g., Visual Guidance → Knowledge Agent
3. ❌ No circular dependencies - Agents cannot call back to Orchestrator
4. ✅ Agents return to caller - If Knowledge Agent called by Visual Guidance, returns to Visual Guidance (not Orchestrator)
5. ✅ State is conversation-scoped - Workflow state stored in conversation, accessible via conversationId

**Allowed Communication Paths**:

```
API Layer
   ↓
Orchestrator Agent ──→ Text Agent (returns)
   ↓
   ├──→ Knowledge Agent (returns)
   ↓
   ├──→ Visual Guidance Agent ──→ Knowledge Agent (returns)
   ↓                           (returns)
   └──→ Expert Matching Agent (returns)
```

**Forbidden**:

- ❌ Text Agent → Any other agent
- ❌ Knowledge Agent → Any other agent (except return to caller)
- ❌ Expert Agent → Any other agent
- ❌ Any agent → Orchestrator

---

## Tool Assignment Matrix

| Tool                         | Orchestrator | Text | Knowledge | Visual Guidance | Expert |
| ---------------------------- | ------------ | ---- | --------- | --------------- | ------ |
| `classify_intent`            | ✅           | ❌   | ❌        | ❌              | ❌     |
| `extract_metadata`           | ✅           | ❌   | ❌        | ❌              | ❌     |
| `respond_with_text`          | ❌           | ✅   | ❌        | ✅              | ❌     |
| `search_knowledge`           | ❌           | ❌   | ✅        | ✅\*            | ❌     |
| `detect_intent`              | ❌           | ❌   | ✅        | ❌              | ❌     |
| `apply_trust_ranking`        | ❌           | ❌   | ✅        | ❌              | ❌     |
| `clarify_intent`             | ❌           | ❌   | ❌        | ✅              | ❌     |
| `start_ui_guidance_workflow` | ❌           | ❌   | ❌        | ✅              | ❌     |
| `guide_next_step`            | ❌           | ❌   | ❌        | ✅              | ❌     |
| `analyze_workflow_screen`    | ❌           | ❌   | ❌        | ✅              | ❌     |
| `find_expert_colleague`      | ❌           | ❌   | ❌        | ❌              | ✅     |

**\* Visual Guidance Agent** calls Knowledge Agent's tools via agent-to-agent invocation, not direct tool access.

### Tool Count Summary

| Agent           | Tool Count | Notes               |
| --------------- | ---------- | ------------------- |
| Orchestrator    | 2          | Routing only        |
| Text Response   | 1          | Simple responses    |
| Knowledge       | 3          | Search + ranking    |
| Visual Guidance | 4          | Workflow management |
| Expert Matching | 1          | Expert scoring      |
| **Total**       | **11**     | **Reduced from 13** |

### Tools Eliminated by Smart Wrapper

**Before Multi-Agent Architecture**:

- `respond_with_text`
- `respond_with_text_in_workflow` ❌ DUPLICATE
- `search_knowledge`
- `search_knowledge_in_workflow` ❌ DUPLICATE

**After Multi-Agent Architecture**:

- `respond_with_text` (smart wrapper handles both cases)
- `search_knowledge` (smart wrapper handles both cases)

**Reduction**: 13 tools → 11 tools (15% reduction)

---

## Type Safety Examples

### Example 1: Text Agent Using Smart Wrapper

```typescript
class TextResponseAgent {
  async execute(context: AgentContext): AsyncIterable<StreamChunk> {
    const result = await this.respondTool.execute(
      { response: "Here's the answer..." },
      context
    );

    // Type: TextMessage | WorkflowMessage
    // Smart wrapper determined which based on context.workflowState

    if (isWorkflowMessage(result)) {
      // TypeScript knows: result.cardData.stepList exists
      console.log(`Workflow has ${result.cardData.stepList.length} steps`);
    } else {
      // TypeScript knows: result.cardData is undefined
      console.log("Regular text response");
    }

    yield { type: "complete", ...result };
  }
}
```

### Example 2: Visual Guidance Agent Calling Knowledge Agent

```typescript
class VisualGuidanceAgent {
  constructor(private knowledgeAgent: KnowledgeAgent) {}

  async execute(context: AgentContext): AsyncIterable<StreamChunk> {
    // Call knowledge agent
    const searchResult = await this.knowledgeAgent.invoke({
      ...context,
      message: "product roadmap update"
    });

    // Type: TextMessage | WorkflowMessage
    // (but we know it's TextMessage because Knowledge Agent doesn't have workflow state yet)

    if (!isTextMessage(searchResult)) {
      throw new Error("Expected text message from knowledge search");
    }

    // TypeScript knows: searchResult.sources exists
    const supportingData = searchResult.sources.map(s => ({
      text: s.snippet,
      source: s.title,
      metadata: { score: 1.0 }
    }));

    // Start workflow with search results
    const workflow = await this.startWorkflowTool.execute({
      solution: "Update product roadmap",
      supportingData,
      stepList: [
        { stepNumber: 1, description: "Open #product-team", status: "pending" },
        { stepNumber: 2, description: "Click roadmap canvas", status: "pending" },
        { stepNumber: 3, description: "Make changes", status: "pending" },
        { stepNumber: 4, description: "Post update", status: "pending" }
      ],
      solutionExplanation: "...",
      supportingDataExplanation: "...",
      searchQuery: "product roadmap update"
    }, context);

    // Type: WorkflowMessage (known at compile time)
    yield { type: "complete", ...workflow };
  }
}
```

### Example 3: Orchestrator Routing with Type Safety

```typescript
class OrchestratorService {
  async processMessage(context: AgentContext): AsyncIterable<StreamChunk> {
    // Pre-load workflow state for all agents
    context.workflowState = await this.retrieveWorkflowState(context.conversationId);

    // Route based on metadata or intent
    const agent = await this.route(context);

    // Execute agent (type-safe)
    const result = agent.execute(context);

    // Stream chunks to client
    for await (const chunk of result) {
      yield chunk;
    }
  }

  private async route(context: AgentContext): Promise<BaseAgent> {
    // Metadata-driven routing (deterministic)
    if (context.metadata?.workflowAction === "progress_step") {
      return this.visualGuidanceAgent;
    }

    // Intent classification (LLM-based)
    const intent = await this.classifyIntent(context);

    switch (intent.type) {
      case "workflow_start":
        return this.visualGuidanceAgent;
      case "knowledge_search":
        return this.knowledgeAgent;
      case "expert_request":
        return this.expertMatchingAgent;
      default:
        return this.textAgent;
    }
  }
}
```

---

## Migration from Single Agent

### What Changed

**Before (Single Agent)**:

- ✅ One `AgentService` with 11-13 tools
- ❌ All tools available to single GPT-4 instance
- ❌ System hints to guide tool selection
- ❌ No model optimization (GPT-4 for everything)
- ❌ Sequential tool execution only
- ❌ Workflow-specific tool duplicates

**After (Multi-Agent)**:

- ✅ 5 specialized agents with domain-specific tools
- ✅ Orchestrator routes to appropriate agent
- ✅ Model optimization (Gemini Flash, GPT-3.5, GPT-4)
- ✅ Parallel execution enabled (knowledge + vision)
- ✅ Smart wrapper eliminates duplicates
- ✅ Type-safe discriminated union

### What Was Eliminated

**Workflow-Specific Duplicates**:

- ❌ `respond_with_text_in_workflow` → Replaced by smart wrapper
- ❌ `search_knowledge_in_workflow` → Replaced by smart wrapper

**System Hints**:

- ❌ `[CRITICAL WORKFLOW ACTION] User clicked 'Move on to next step'...` → Replaced by deterministic routing
- ❌ `[CRITICAL] Analyze question type: visual issue → analyze_workflow_screen...` → Replaced by agent selection

**Tool Count**: 13 → 11 (15% reduction)

### Benefits Achieved

**Cost Reduction**:

- Text responses (60% of requests): 10x cheaper with Gemini Flash = **6x savings**
- Expert matching (5% of requests): 3x cheaper with GPT-3.5 = **0.15x savings**
- **Total estimated: 40-60% cost reduction**

**Latency Reduction**:

- Parallel knowledge + vision: **50% faster** for workflow starts
- Lightweight routing: **100ms faster** than full GPT-4 call
- **Total estimated: 30-50% latency improvement**

**Architecture**:

- ✅ Clear domain boundaries
- ✅ Type-safe communication
- ✅ Easier to test (unit test per agent)
- ✅ Independent scaling (scale visual agent separately)
- ✅ Better observability (per-agent metrics)

---

## File Structure

```
apps/backend/src/
├── agents/
│   ├── base.agent.ts                    # Abstract agent interface
│   ├── orchestrator.agent.ts            # (Move from services/)
│   ├── text-response.agent.ts
│   ├── knowledge.agent.ts
│   ├── visual-guidance.agent.ts
│   ├── expert-matching.agent.ts
│   └── tools/
│       ├── utils/
│       │   ├── workflow-wrapper.ts      # Smart wrapper utility
│       │   └── type-guards.ts           # Type guard functions
│       ├── orchestrator/
│       │   ├── classify-intent.tool.ts
│       │   └── extract-metadata.tool.ts
│       ├── shared/
│       │   └── respond-text.tool.ts     # Used by multiple agents
│       ├── knowledge/
│       │   ├── search-knowledge.tool.ts
│       │   ├── detect-intent.tool.ts
│       │   └── apply-trust-ranking.tool.ts
│       ├── visual/
│       │   ├── clarify-intent.tool.ts
│       │   ├── start-workflow.tool.ts
│       │   ├── guide-next-step.tool.ts
│       │   └── analyze-screen.tool.ts
│       └── expert/
│           └── find-expert.tool.ts
├── services/
│   ├── orchestrator.service.ts          # Main entry point (was agent.service.ts)
│   └── [existing services unchanged]
└── routes/
    └── conversations.ts                  # Update to use orchestrator
```

---

## Implementation Roadmap

### Phase 1: Type System (Week 1)

1. Create discriminated union types in `base.tool.ts`
2. Implement smart wrapper utility
3. Add type guard functions
4. Update existing tools to use smart wrapper
5. Delete workflow-specific duplicates

### Phase 2: Agent Extraction (Week 2)

1. Create `BaseAgent` abstract class
2. Implement all 5 agent classes
3. Reorganize tools by agent
4. Update tool imports

### Phase 3: Orchestrator (Week 2-3)

1. Create `OrchestratorService`
2. Implement intent classification (Gemini Flash)
3. Implement routing logic
4. Add workflow state pre-loading
5. Enable agent-to-agent communication

### Phase 4: Integration (Week 3)

1. Update API routes to use orchestrator
2. Update tests for new architecture
3. Add per-agent metrics
4. Deployment to staging

### Phase 5: Optimization (Week 4)

1. Enable parallel execution (knowledge + vision)
2. Add caching for intent classification
3. Monitor performance metrics
4. Production deployment

---

## Success Metrics

**Cost**:

- Target: 40-60% reduction in OpenAI API costs
- Baseline: ~$3,000/month
- Goal: ~$1,200-$1,800/month savings

**Latency**:

- Target: 30-50% reduction for workflow starts
- Baseline: 3-4 seconds end-to-end
- Goal: <2 seconds for workflow starts

**Routing Accuracy**:

- Target: 95%+ correct agent selection
- Measurement: Log routing decisions, manual review

**Zero Regressions**:

- Same user experience
- No broken workflows
- All existing features work

---

**Document Version**: 2.0
**Status**: Proposed Architecture
**Next Review**: After Phase 1 implementation
