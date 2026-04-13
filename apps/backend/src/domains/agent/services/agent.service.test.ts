/**
 * Agent Service Tests
 *
 * Tests the AgentService class focusing on:
 * - Tool registration and retrieval
 * - Conversation history conversion to Groq message format
 * - processMessage streaming logic (happy path and error path)
 * - Max-iterations guard
 *
 * The Groq SDK and tool execute methods are fully mocked so that no real
 * network calls occur.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the Groq SDK before the service is imported
const mockCreate = jest.fn<any>();

jest.mock("groq-sdk", () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

// Mock config so the service can be constructed without real env vars
jest.mock("../../../config.js", () => ({
  config: {
    groq: {
      apiKey: "test-groq-key",
      chatModel: "test-model",
      temperature: 0.7,
      maxTokens: 2000,
    },
  },
}));

// Mock RespondTextTool
jest.mock("../tools/respond-text.tool.js", () => ({
  RespondTextTool: jest.fn().mockImplementation(() => ({
    name: "respond_with_text",
    description: "Respond with text",
    parameters: {
      type: "object",
      properties: { response: { type: "string" } },
      required: ["response"],
    },
    getDefinition: jest.fn().mockReturnValue({
      type: "function",
      function: {
        name: "respond_with_text",
        description: "Respond with text",
        parameters: { type: "object", properties: {}, required: [] },
      },
    }),
    execute: jest.fn<any>().mockResolvedValue({
      messageType: "text",
      content: "Hello from text tool",
      streamable: true,
    }),
  })),
}));

// Mock SearchKnowledgeTool
jest.mock("../tools/search-knowledge.tool.js", () => ({
  SearchKnowledgeTool: jest.fn().mockImplementation(() => ({
    name: "search_knowledge",
    description: "Search the knowledge base",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    getDefinition: jest.fn().mockReturnValue({
      type: "function",
      function: {
        name: "search_knowledge",
        description: "Search the knowledge base",
        parameters: { type: "object", properties: {}, required: [] },
      },
    }),
    execute: jest.fn<any>().mockResolvedValue({
      messageType: "text",
      content: "Knowledge result",
      streamable: true,
    }),
  })),
}));

// Import AFTER mocks are registered
import { AgentService } from "./agent.service.js";
import {
  BaseTool,
  type ToolContext,
  type ToolResult,
  type ToolParameters,
} from "../tools/base.tool.js";
import type { Message } from "../schema/conversations.schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-1",
    userId: "user-1",
    organizationId: "org-1",
    conversationHistory: [],
    ...overrides,
  };
}

function makeMessage(role: "user" | "assistant", content: string): Message {
  return {
    id: `msg-${Math.random()}`,
    role,
    content,
    conversationId: "conv-1",
    createdAt: new Date(),
  } as unknown as Message;
}

/**
 * Consume an async iterable and collect all yielded chunks into an array.
 */
async function collectChunks(iterable: AsyncIterable<any>): Promise<any[]> {
  const chunks: any[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * Build a minimal streaming Groq response that delivers text content and
 * finishes with reason "stop".
 */
function makeTextStreamResponse(text: string) {
  const chunks = [
    { choices: [{ delta: { content: text }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: "stop" }] },
  ];

  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: async () => {
          if (index < chunks.length) {
            return { value: chunks[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

/**
 * Build a streaming response that calls a tool then finishes.
 */
function makeToolCallStreamResponse(toolName: string, argsJson: string, toolCallId = "call_123") {
  const chunks = [
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: toolCallId,
                function: { name: toolName, arguments: argsJson },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  ];

  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        next: async () => {
          if (index < chunks.length) {
            return { value: chunks[index++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Tool registration tests
// ---------------------------------------------------------------------------

describe("AgentService — tool registration", () => {
  let service: AgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentService();
  });

  it("registers RespondTextTool and SearchKnowledgeTool on construction", () => {
    // The constructor calls registerTool for both; we verify via the private map
    const tools = (service as any).tools as Map<string, any>;
    expect(tools.has("respond_with_text")).toBe(true);
    expect(tools.has("search_knowledge")).toBe(true);
  });

  it("registerTool adds a custom tool by name", () => {
    class MockTool extends BaseTool {
      name = "custom_tool";
      description = "Custom test tool";
      parameters: ToolParameters = { type: "object", properties: {} };
      async execute(_args: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> {
        return { messageType: "text", content: "custom", streamable: false };
      }
    }

    const tool = new MockTool();
    service.registerTool(tool);

    const tools = (service as any).tools as Map<string, any>;
    expect(tools.has("custom_tool")).toBe(true);
  });

  it("overwrites an existing tool when a tool with the same name is registered", () => {
    class MockToolV1 extends BaseTool {
      name = "tool_v";
      description = "v1";
      parameters: ToolParameters = { type: "object", properties: {} };
      async execute(): Promise<ToolResult> {
        return { messageType: "text", content: "v1", streamable: false };
      }
    }
    class MockToolV2 extends BaseTool {
      name = "tool_v";
      description = "v2";
      parameters: ToolParameters = { type: "object", properties: {} };
      async execute(): Promise<ToolResult> {
        return { messageType: "text", content: "v2", streamable: false };
      }
    }

    service.registerTool(new MockToolV1());
    service.registerTool(new MockToolV2());

    const tools = (service as any).tools as Map<string, any>;
    expect(tools.get("tool_v")?.description).toBe("v2");
  });

  it("getToolDefinitions returns one definition per registered tool", () => {
    const defs = (service as any).getToolDefinitions();
    // At least the two built-in tools
    expect(defs.length).toBeGreaterThanOrEqual(2);
    for (const def of defs) {
      expect(def.type).toBe("function");
      expect(def.function.name).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Conversation history conversion tests
// ---------------------------------------------------------------------------

describe("AgentService — convertToGroqMessages", () => {
  let service: AgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentService();
  });

  it("converts user messages to role:user", () => {
    const history = [makeMessage("user", "Hello?")];
    const converted = (service as any).convertToGroqMessages(history);
    expect(converted).toHaveLength(1);
    expect(converted[0]).toEqual({ role: "user", content: "Hello?" });
  });

  it("converts assistant messages to role:assistant", () => {
    const history = [makeMessage("assistant", "Hi there!")];
    const converted = (service as any).convertToGroqMessages(history);
    expect(converted[0]).toEqual({ role: "assistant", content: "Hi there!" });
  });

  it("preserves order of mixed conversation history", () => {
    const history = [
      makeMessage("user", "First"),
      makeMessage("assistant", "Second"),
      makeMessage("user", "Third"),
    ];
    const converted = (service as any).convertToGroqMessages(history);
    expect(converted.map((m: any) => m.content)).toEqual(["First", "Second", "Third"]);
  });

  it("returns empty array for empty conversation history", () => {
    const converted = (service as any).convertToGroqMessages([]);
    expect(converted).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// processMessage streaming tests
// ---------------------------------------------------------------------------

describe("AgentService — processMessage", () => {
  let service: AgentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AgentService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("yields a 'complete' chunk with text content for a direct text response", async () => {
    mockCreate.mockResolvedValueOnce(makeTextStreamResponse("This is the answer"));

    const chunks = await collectChunks(service.processMessage("Tell me something", makeContext()));

    const completeChunk = chunks.find((c) => c.type === "complete");
    expect(completeChunk).toBeDefined();
    expect(completeChunk.content).toBe("This is the answer");
    expect(completeChunk.messageType).toBe("text");
  });

  it("yields 'chunk' events before the final 'complete' for streamed text", async () => {
    mockCreate.mockResolvedValueOnce(makeTextStreamResponse("word1 word2"));

    const chunks = await collectChunks(
      service.processMessage("Stream me something", makeContext())
    );

    const chunkEvents = chunks.filter((c) => c.type === "chunk");
    expect(chunkEvents.length).toBeGreaterThan(0);
    // Content should be non-empty for each chunk
    for (const ev of chunkEvents) {
      expect(typeof ev.content).toBe("string");
    }
  });

  it("executes a tool and yields 'complete' when the AI calls respond_with_text", async () => {
    // First stream: AI calls the text tool
    const toolStream = makeToolCallStreamResponse(
      "respond_with_text",
      JSON.stringify({ response: "Tool says hello" })
    );
    mockCreate.mockResolvedValueOnce(toolStream);

    // Get the actual tool from the service and mock its execute
    const textTool = (service as any).tools.get("respond_with_text");
    textTool.execute = jest.fn<any>().mockResolvedValue({
      messageType: "text",
      content: "Tool says hello",
      streamable: true,
    });

    const chunks = await collectChunks(service.processMessage("Say hello", makeContext()));

    const completeChunk = chunks.find((c) => c.type === "complete");
    expect(completeChunk).toBeDefined();
    expect(completeChunk.content).toBe("Tool says hello");
  });

  it("yields an 'error' chunk when the Groq API throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Groq API failure"));

    const chunks = await collectChunks(service.processMessage("Trigger error", makeContext()));

    const errorChunk = chunks.find((c) => c.type === "error");
    expect(errorChunk).toBeDefined();
    expect(errorChunk.error).toContain("Groq API failure");
  });

  it("yields a 'complete' fallback after MAX_ITERATIONS exhaustion", async () => {
    // Always return a tool call stream that leads to an incomplete result
    // (content includes "would you like" so the loop continues)
    const incompleteStream = makeToolCallStreamResponse(
      "respond_with_text",
      JSON.stringify({ response: "Would you like me to search for more?" })
    );

    const textTool = (service as any).tools.get("respond_with_text");
    textTool.execute = jest.fn<any>().mockResolvedValue({
      messageType: "text",
      content: "Would you like me to search for more?",
      streamable: false,
    });

    // Each iteration calls Groq; repeat the incomplete stream each time
    mockCreate.mockResolvedValue(incompleteStream);

    const chunks = await collectChunks(service.processMessage("Keep iterating", makeContext()));

    const completeChunk = chunks.find((c) => c.type === "complete");
    expect(completeChunk).toBeDefined();
    // After max iterations, the apology message is sent
    expect(completeChunk.content).toContain("trouble processing");
  }, 15_000);

  it("includes screenshot context message when screenshots are provided", async () => {
    mockCreate.mockResolvedValueOnce(makeTextStreamResponse("With screenshot"));

    const context = makeContext({
      screenshots: [{ window: "App", data: "base64data" } as any],
    });

    // We just verify it doesn't throw and still produces a complete chunk
    const chunks = await collectChunks(service.processMessage("Look at my screen", context));
    expect(chunks.find((c) => c.type === "complete")).toBeDefined();
  });

  it("yields a 'window_trigger' chunk when a tool result includes triggerWindow", async () => {
    const toolStream = makeToolCallStreamResponse(
      "respond_with_text",
      JSON.stringify({ response: "Opening the guide" })
    );
    mockCreate.mockResolvedValueOnce(toolStream);

    const textTool = (service as any).tools.get("respond_with_text");
    textTool.execute = jest.fn<any>().mockResolvedValue({
      messageType: "text",
      content: "Opening the guide",
      streamable: true,
      triggerWindow: { window: "guide", data: { stepId: "1" } },
    });

    const chunks = await collectChunks(service.processMessage("Open the guide", makeContext()));

    const triggerChunk = chunks.find((c) => c.type === "window_trigger");
    expect(triggerChunk).toBeDefined();
    expect(triggerChunk.windowTrigger.window).toBe("guide");
  });
});

// ---------------------------------------------------------------------------
// BaseTool.validate tests (base class shared by all tools)
// ---------------------------------------------------------------------------

describe("BaseTool.validate", () => {
  class ConcreteTestTool extends BaseTool {
    name = "test_tool";
    description = "A test tool";
    parameters: ToolParameters = {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    };

    async execute(_args: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> {
      return { messageType: "text", content: "ok", streamable: false };
    }

    // Expose protected method for testing
    public testValidate(args: Record<string, any>) {
      return this.validate(args);
    }
  }

  const tool = new ConcreteTestTool();

  it("does not throw when all required parameters are present", () => {
    expect(() => tool.testValidate({ query: "test query" })).not.toThrow();
  });

  it("throws when a required parameter is missing", () => {
    expect(() => tool.testValidate({ limit: 5 })).toThrow("Missing required parameter: query");
  });

  it("includes the tool name in the missing-parameter error message", () => {
    expect(() => tool.testValidate({})).toThrow("test_tool");
  });

  it("does not throw when optional parameters are absent", () => {
    // limit is not required, so omitting it is fine
    expect(() => tool.testValidate({ query: "hello" })).not.toThrow();
  });

  it("getDefinition returns the correct tool definition shape", () => {
    const def = tool.getDefinition();
    expect(def.type).toBe("function");
    expect(def.function.name).toBe("test_tool");
    expect(def.function.description).toBe("A test tool");
    expect(def.function.parameters.required).toContain("query");
  });
});
