# Agentic System Architecture

## Overview

Mitable's chat system is built on an **agentic architecture** where the AI doesn't just respond with text—it can choose from multiple specialized tools to best address user needs. This architecture enables the assistant to:

- Answer general questions with text responses
- Search the knowledge base with RAG (Retrieval-Augmented Generation)
- Find the best expert colleague to help
- Provide visual UI guidance with step-by-step overlays

## Why Agentic?

### The Problem with Simple Chat
A traditional chat system only has one capability: generate text. This creates limitations:

```
User: "Who can help me with React?"
Simple Chat: "You might want to ask someone on the frontend team..."
❌ Vague, not actionable, no specific person identified
```

```
User: "How do I submit a PR in GitHub?"
Simple Chat: "First go to the repo, then click Pull Requests, then..."
❌ Text instructions without visual guidance, no coordinates
```

### The Agentic Solution
An agentic system can choose the right tool for each task:

```
User: "Who can help me with React?"
Agent: Analyzes intent → Chooses find_expert tool
Result: Returns messageType: 'experts' with expert cards showing:
- Sarah Chen (Senior Frontend Engineer, 95% match)
- With availability, expertise score, response time
✅ Actionable, specific, structured data
```

```
User: "How do I submit a PR in GitHub?"
Agent: Analyzes intent → Chooses guide_next_ui_step tool
Result: Returns messageType: 'workflow' with coordinates
- Triggers Overlay window with visual arrow
- Opens Guide window with step-by-step instructions
✅ Visual guidance, interactive, adaptive
```

## Core Architecture

### 1. Agent Orchestrator

The **Agent Service** is the central coordinator:

```typescript
class AgentService {
  private tools: Map<string, BaseTool> = new Map();

  // Register available tools
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  // Main entry point
  async processMessage(
    conversationId: string,
    userMessage: string,
    conversationHistory: Message[]
  ): AsyncIterable<StreamChunk> {
    // 1. Build OpenAI messages array with history + new message
    // 2. Include tool definitions in request
    // 3. Call OpenAI with function calling
    // 4. AI decides which tool to use
    // 5. Execute chosen tool
    // 6. Stream response back
  }
}
```

**Responsibilities:**
- Maintain registry of available tools
- Convert conversation history to OpenAI format
- Call OpenAI with tool definitions (function calling)
- Route to appropriate tool based on AI decision
- Handle streaming responses
- Manage errors and fallbacks

### 2. Tool System

**Base Tool Interface:**

```typescript
// apps/backend/src/tools/base.tool.ts

export interface ToolParameters {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
}

export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameters;

  // Returns OpenAI function definition
  getDefinition(): ToolDefinition {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }

  // Execute the tool with parsed arguments
  abstract execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult>;
}

export interface ToolContext {
  conversationId: string;
  userId: string;
  conversationHistory: Message[];
  // Future: screenshot, userProfile, etc.
}

export interface ToolResult {
  messageType: 'text' | 'workflow' | 'experts';
  content: string;
  cardData?: Record<string, any>;
  sources?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  streamable: boolean; // Can this be streamed?
}
```

### 3. OpenAI Function Calling Integration

OpenAI's function calling allows the model to intelligently choose tools:

```typescript
const tools = [
  respondTextTool.getDefinition(),
  // searchKnowledgeTool.getDefinition(),  // Phase 2
  // findExpertTool.getDefinition(),        // Phase 3
  // guideNextStepTool.getDefinition()      // Phase 4
];

const response = await openai.chat.completions.create({
  model: "gpt-4-turbo-preview",
  messages: conversationHistory,
  tools: tools,
  tool_choice: "auto", // Let AI decide which tool to use
  stream: true
});

// AI returns which tool to call and with what arguments
if (response.tool_calls) {
  const toolCall = response.tool_calls[0];
  const tool = this.tools.get(toolCall.function.name);
  const args = JSON.parse(toolCall.function.arguments);

  const result = await tool.execute(args, context);
  // Stream result back to user
}
```

**How It Works:**
1. System provides tool definitions to OpenAI
2. AI analyzes user message + conversation context
3. AI decides which tool best addresses user's need
4. AI generates structured arguments for chosen tool
5. System executes tool with those arguments
6. Tool returns result (text, expert cards, workflow step, etc.)
7. System formats and streams result to frontend

## Tool Implementation Roadmap

### Phase 1: Text Response Tool (Now)

**Tool:** `respond_with_text`

**Purpose:** Answer general questions with conversational text responses

**When Used:**
- General questions: "What is our company mission?"
- Explanations: "How does our PTO policy work?"
- Clarifications: "What did you mean by that?"
- Chitchat: "How are you doing?"

**Implementation:**
```typescript
// apps/backend/src/tools/respond-text.tool.ts

export class RespondTextTool extends BaseTool {
  name = "respond_with_text";
  description = "Respond to general questions with helpful text answers";

  parameters = {
    type: "object" as const,
    properties: {
      response: {
        type: "string",
        description: "The text response to the user's question"
      }
    },
    required: ["response"]
  };

  async execute(args: { response: string }, context: ToolContext) {
    // Simple pass-through - AI already generated the response
    return {
      messageType: 'text',
      content: args.response,
      streamable: true
    };
  }
}
```

**System Prompt:**
```
You are an experienced employee assistant at [Company Name], helping new hires
ramp up quickly. You have deep product knowledge and guide people through their
work like an expert colleague who's always available to help. You're friendly,
patient, and thorough. When you don't know something, you're honest about it
and help find someone who does.
```

### Phase 2: Knowledge Search Tool (Future)

**Tool:** `search_knowledge_base`

**Purpose:** Search internal documentation, Slack history, wikis using RAG

**When Used:**
- Documentation questions: "What's our deployment process?"
- Policy questions: "How do I request time off?"
- Process questions: "How do we handle customer escalations?"
- Historical context: "What was discussed about the pricing change?"

**Implementation:**
```typescript
export class SearchKnowledgeTool extends BaseTool {
  name = "search_knowledge_base";
  description = "Search company knowledge base, docs, and Slack history";

  parameters = {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The search query to find relevant information"
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "Specific sources to search (e.g., 'docs', 'slack', 'wiki')"
      }
    },
    required: ["query"]
  };

  async execute(args: { query: string; sources?: string[] }, context: ToolContext) {
    // 1. Generate embedding for query
    const queryEmbedding = await embeddingService.embed(args.query);

    // 2. Hybrid search: Semantic (Pinecone) + Keyword (PostgreSQL FTS)
    const semanticResults = await vectorService.search(queryEmbedding);
    const keywordResults = await db.fullTextSearch(args.query);

    // 3. Merge and rank results
    const mergedResults = mergeAndRank(semanticResults, keywordResults);

    // 4. Generate response with sources
    const response = await this.generateResponseWithContext(
      context.conversationHistory,
      args.query,
      mergedResults
    );

    return {
      messageType: 'text',
      content: response,
      sources: mergedResults.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet
      })),
      streamable: true
    };
  }
}
```

**AI Decides When:**
- User asks about company-specific information
- Question likely has documented answer
- Requires citing sources or referencing past discussions

### Phase 3: Expert Finder Tool (Future)

**Tool:** `find_expert`

**Purpose:** Match users with the best colleague to help with specific topics

**When Used:**
- "Who can help me with [topic]?"
- "I need someone who knows [technology/process]"
- "Who should I ask about [project/feature]?"

**Implementation:**
```typescript
export class FindExpertTool extends BaseTool {
  name = "find_expert";
  description = "Find the best colleague expert to help with a specific topic";

  parameters = {
    type: "object" as const,
    properties: {
      topic: {
        type: "string",
        description: "The topic or skill the user needs help with"
      },
      urgency: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "How urgently the user needs help"
      }
    },
    required: ["topic"]
  };

  async execute(args: { topic: string; urgency?: string }, context: ToolContext) {
    // 1. Generate topic embedding
    const topicEmbedding = await embeddingService.embed(args.topic);

    // 2. Score experts based on:
    //    - Expertise similarity (40%): cosine similarity of embeddings
    //    - Performance (30%): response rate + helpfulness ratings
    //    - Availability (30%): current status + calendar
    const rankedExperts = await expertService.findBestMatches(
      topicEmbedding,
      args.urgency || 'medium'
    );

    // 3. Return top 3-5 experts as structured cards
    return {
      messageType: 'experts',
      content: `Here are the best colleagues to help with ${args.topic}:`,
      cardData: {
        experts: rankedExperts.slice(0, 5).map(e => ({
          id: e.id,
          name: e.name,
          title: e.title,
          expertise: e.topicScore,
          availability: e.availabilityStatus,
          responseTime: e.avgResponseTime,
          helpfulnessRating: e.rating
        }))
      },
      streamable: false // Cards appear all at once
    };
  }
}
```

**AI Decides When:**
- User explicitly asks for expert help
- Question is complex and likely needs human assistance
- Previous attempts to answer didn't satisfy user

### Phase 4: UI Guidance Tool (Future)

**Tool:** `guide_next_ui_step`

**Purpose:** Provide visual step-by-step UI guidance across any application

**When Used:**
- "How do I [perform UI task]?"
- "Where is the [UI element] button?"
- "Help me navigate to [feature]"

**Implementation:**
```typescript
export class GuideNextStepTool extends BaseTool {
  name = "guide_next_ui_step";
  description = "Provide the next visual UI guidance step based on current screen";

  parameters = {
    type: "object" as const,
    properties: {
      instruction: {
        type: "string",
        description: "Clear instruction for what the user should do next"
      },
      requiresScreenshot: {
        type: "boolean",
        description: "Whether a screenshot is needed to provide guidance"
      }
    },
    required: ["instruction", "requiresScreenshot"]
  };

  async execute(
    args: { instruction: string; requiresScreenshot: boolean },
    context: ToolContext
  ) {
    if (args.requiresScreenshot && !context.screenshot) {
      return {
        messageType: 'text',
        content: "I'll need to see your screen to guide you. Press Cmd+H to capture a screenshot.",
        streamable: false
      };
    }

    // 1. Analyze screenshot with Gemini Vision
    const uiElements = await geminiVisionService.detectUIElements(context.screenshot);

    // 2. Find target element based on instruction
    const targetElement = await this.findTargetElement(
      args.instruction,
      uiElements,
      context.conversationHistory
    );

    // 3. Determine next step number from conversation
    const stepNumber = this.getNextStepNumber(context.conversationHistory);

    // 4. Return workflow step with coordinates
    return {
      messageType: 'workflow',
      content: args.instruction,
      cardData: {
        stepNumber: stepNumber,
        instruction: args.instruction,
        targetElement: {
          label: targetElement.label,
          boundingBox: targetElement.boundingBox,
          application: targetElement.application
        },
        highlightColor: "blue",
        arrowPosition: this.calculateArrowPosition(targetElement.boundingBox)
      },
      streamable: false // Workflow steps appear atomically
    };
  }
}
```

**AI Decides When:**
- User asks how-to question about UI navigation
- Question requires showing specific UI elements
- User is in active workflow conversation (`contextType: 'workflow'`)

**See Also:** `docs/ui_guidance_architecture.md` for full iterative guidance model

## Message Flow

### Example: General Question

```
User: "What's our company mission?"

Agent Orchestrator:
→ Calls OpenAI with all tool definitions
→ AI chooses: respond_with_text

Tool Execution:
→ RespondTextTool.execute()
→ Returns: { messageType: 'text', content: "Our mission is...", streamable: true }

Response:
→ Stream text response to frontend
→ Save message to database with messageType: 'text'

Frontend:
→ Renders AIMessage component
→ Displays text in chat bubble
```

### Example: Expert Request (Future)

```
User: "Who can help me with React hooks?"

Agent Orchestrator:
→ Calls OpenAI with all tool definitions
→ AI chooses: find_expert
→ AI generates args: { topic: "React hooks", urgency: "medium" }

Tool Execution:
→ FindExpertTool.execute({ topic: "React hooks", urgency: "medium" })
→ Searches expert profiles, scores by expertise/availability
→ Returns: {
    messageType: 'experts',
    content: "Here are the best colleagues...",
    cardData: { experts: [...] }
  }

Response:
→ Send complete response to frontend (not streamed)
→ Save message to database with messageType: 'experts' and cardData

Frontend:
→ Detects messageType: 'experts'
→ Renders WorkflowCard component with expert cards
→ Shows expert profiles with "Contact" buttons
```

### Example: UI Guidance (Future)

```
User: "How do I submit a PR in GitHub?"
[Screenshot captured]

Agent Orchestrator:
→ Calls OpenAI with all tool definitions + screenshot context
→ AI chooses: guide_next_ui_step
→ AI generates args: {
    instruction: "Click the 'Pull Requests' tab",
    requiresScreenshot: true
  }

Tool Execution:
→ GuideNextStepTool.execute()
→ Analyzes screenshot with Gemini Vision
→ Detects "Pull Requests" tab at coordinates (800, 100)
→ Returns: {
    messageType: 'workflow',
    content: "Click the 'Pull Requests' tab",
    cardData: {
      stepNumber: 1,
      targetElement: { label: "Pull Requests", boundingBox: {...} }
    }
  }

Response:
→ Send response to frontend
→ Save message to database with messageType: 'workflow'

Frontend:
→ Detects messageType: 'workflow'
→ Updates Overlay window with arrow pointing to (800, 100)
→ Opens Guide window showing "Step 1: Click 'Pull Requests' tab"
→ Changes conversation contextType to 'workflow'
```

## Conversation Context Management

The agent uses conversation history to make better decisions:

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  messageType: 'text' | 'workflow' | 'experts';
  cardData?: any;
  createdAt: Date;
}

// When processing new message
const conversationHistory: Message[] = await db.getRecentMessages(
  conversationId,
  limit: 20  // Last 20 messages for context
);

// Agent uses history to:
// 1. Understand workflow progression (Step 1 → Step 2 → Step 3)
// 2. Detect if user is stuck (same question repeated)
// 3. Maintain conversation coherence
// 4. Reference previous expert recommendations
// 5. Adapt guidance based on user's proficiency
```

### Context Types

```typescript
enum ConversationType {
  GENERAL = 'general',      // Normal Q&A
  HELP_REQUEST = 'help_request',  // User asked for expert help
  WORKFLOW = 'workflow'     // Active UI guidance session
}
```

**State Transitions:**
- `general` → `workflow`: User asks "how to" question, agent chooses guide_next_ui_step
- `workflow` → `general`: User completes workflow or asks unrelated question
- `general` → `help_request`: Agent recommends expert, user confirms
- `help_request` → `general`: Help request resolved

## Technical Implementation

### Agent Service Bootstrap

```typescript
// apps/backend/src/services/agent.service.ts

export class AgentService {
  private openai: OpenAI;
  private tools: Map<string, BaseTool> = new Map();

  constructor() {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });

    // Register Phase 1 tools
    this.registerTool(new RespondTextTool());

    // Phase 2: Uncomment when ready
    // this.registerTool(new SearchKnowledgeTool());

    // Phase 3: Uncomment when ready
    // this.registerTool(new FindExpertTool());

    // Phase 4: Uncomment when ready
    // this.registerTool(new GuideNextStepTool());
  }

  async processMessage(
    conversationId: string,
    userMessage: string,
    context: ToolContext
  ): AsyncIterable<StreamChunk> {
    // Implementation details in actual file
  }
}
```

### Streaming Endpoint

```typescript
// apps/backend/src/routes/conversations.ts

router.post('/:conversationId/messages/stream', authenticate, async (req, res) => {
  // 1. Save user message to DB
  const userMessage = await db.createMessage({
    conversationId: req.params.conversationId,
    role: 'user',
    content: req.body.content
  });

  // 2. Get conversation history
  const history = await db.getRecentMessages(req.params.conversationId, 20);

  // 3. Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 4. Stream from agent
  const stream = agentService.processMessage(
    req.params.conversationId,
    req.body.content,
    { conversationHistory: history, userId: req.user.id }
  );

  // 5. Forward chunks to client
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  // 6. Save complete assistant message to DB
  // 7. Send final event with saved message ID
  res.write(`data: ${JSON.stringify({ done: true, messageId: savedMessage.id })}\n\n`);
  res.end();
});
```

## Error Handling

### Tool Execution Failures

```typescript
try {
  const result = await tool.execute(args, context);
  return result;
} catch (error) {
  // Fallback to text response
  return {
    messageType: 'text',
    content: "I encountered an error processing your request. Let me try to help in a different way...",
    streamable: true
  };
}
```

### OpenAI API Errors

```typescript
try {
  const response = await this.openai.chat.completions.create({...});
} catch (error) {
  if (error.code === 'rate_limit_exceeded') {
    // Return friendly rate limit message
  } else if (error.code === 'context_length_exceeded') {
    // Truncate conversation history and retry
  } else {
    // Generic error handling
  }
}
```

### Stream Interruptions

```typescript
// Frontend handles connection loss
eventSource.onerror = () => {
  // Show "Connection lost" message
  // Retry with exponential backoff
};
```

## Testing Strategy

### Tool Unit Tests
```typescript
describe('RespondTextTool', () => {
  it('should return text response', async () => {
    const tool = new RespondTextTool();
    const result = await tool.execute(
      { response: "Hello!" },
      mockContext
    );
    expect(result.messageType).toBe('text');
    expect(result.content).toBe("Hello!");
  });
});
```

### Agent Integration Tests
```typescript
describe('AgentService', () => {
  it('should route to correct tool based on user intent', async () => {
    const agent = new AgentService();

    // Test general question → respond_with_text
    const stream = agent.processMessage(
      'conv-123',
      'What is our mission?',
      mockContext
    );

    // Verify correct tool was called
  });
});
```

### End-to-End Tests
```typescript
describe('Chat streaming', () => {
  it('should stream AI responses in real-time', async () => {
    // Send message via API
    // Verify SSE chunks received
    // Verify final message saved to DB
    // Verify frontend displays streaming content
  });
});
```

## Performance Considerations

### Token Usage
- Conversation history limited to 20 messages
- System prompt kept concise
- Tool descriptions clear but brief
- Monitor token costs per request

### Latency
- Target: <2 seconds for first token
- Streaming starts immediately
- Tool execution parallelized where possible
- Database queries optimized

### Caching
- Tool definitions cached (static)
- Conversation history cached (5 min TTL)
- Expert profiles cached (15 min TTL)
- Vector search results cached (1 hour TTL)

## Security

### Tool Access Control
```typescript
// Future: Role-based tool access
if (tool.requiresAdminAccess && !context.userIsAdmin) {
  throw new Error('Insufficient permissions for this tool');
}
```

### Input Validation
```typescript
// Validate tool arguments before execution
const validated = toolParametersSchema.parse(args);
```

### Rate Limiting
```typescript
// Limit API calls per user
const rateLimiter = new RateLimiter({
  maxRequests: 50,
  windowMs: 60000 // 50 requests per minute
});
```

## Monitoring & Analytics

Track tool usage:
```typescript
analytics.track('tool_used', {
  toolName: tool.name,
  userId: context.userId,
  conversationId: context.conversationId,
  success: true,
  latency: executionTime
});
```

## Conclusion

The agentic architecture provides a flexible, extensible foundation for building an intelligent assistant that can adapt its behavior to user needs. By starting with a single text response tool and progressively adding specialized capabilities, we can ship quickly while building toward a comprehensive onboarding assistant that combines conversation, knowledge search, expert matching, and visual UI guidance.
