import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { ToolContext, StreamChunk } from "../tools/base.tool";
import { VisualGuidanceAgent } from "./visual-guidance.agent.js";

describe("VisualGuidanceAgent routing", () => {
  let agent: VisualGuidanceAgent;
  let mockKnowledgeAgent: any;
  let mockTextAgent: any;

  beforeEach(() => {
    jest.resetAllMocks();

    mockKnowledgeAgent = {
      execute: jest.fn(),
      search: jest.fn(),
    };

    mockTextAgent = {
      execute: jest.fn<[], AsyncIterable<StreamChunk>>().mockImplementation(async function* () {
        yield {
          type: "complete",
          messageType: "workflow",
          content: "Workflow-aware answer",
          cardData: { workflowSessionId: "session-123", currentStepIndex: 1 },
        } as any;
      }),
    };

    agent = new VisualGuidanceAgent(mockKnowledgeAgent, mockTextAgent);
  });

  it("uses ClarifyIntent for entry-point vague prompts with no workflow", async () => {
    const clarifyExecuteMock = jest.fn().mockResolvedValue({
      messageType: "text",
      content: "Clarified intent",
      cardData: null,
    });
    (agent as any).clarifyIntentTool = { execute: clarifyExecuteMock };

    (agent as any).isVaguePrompt = jest.fn().mockResolvedValue(true);
    const classifySpy = jest.spyOn<any, any>(agent as any, "classifyWorkflowQuestion");

    const context: ToolContext = {
      conversationId: "conv-1",
      userId: "user-1",
      organizationId: "org-1",
      screenshots: [
        {
          windowId: "w1",
          windowTitle: "Test",
          appName: "TestApp",
          dataUrl: "data:image/png;base64,xxx",
          metadata: { width: 100, height: 100, scaleFactor: 1 },
        },
      ],
      metadata: undefined,
      userProfile: {
        name: "Test User",
        email: "test@example.com",
        organizationId: "org-1",
      },
      conversationHistory: [
        {
          id: "m1",
          conversationId: "conv-1",
          role: "user",
          content: "How do I do this?",
          messageType: "text",
          cardData: null,
          sources: [],
          workflowSessionId: null,
          relatedStepIndex: null,
          createdAt: new Date(),
        },
      ],
      workflowState: undefined,
    };

    const chunks: StreamChunk[] = [];
    for await (const chunk of agent.execute(context)) {
      chunks.push(chunk);
    }

    expect((agent as any).isVaguePrompt).toHaveBeenCalledWith("How do I do this?");
    expect(clarifyExecuteMock).toHaveBeenCalledTimes(1);
    expect(classifySpy).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("complete");
    expect(chunks[0].content).toBe("Clarified intent");
  });

  it("bypasses ClarifyIntent and uses workflow-aware path for step-level custom questions", async () => {
    const clarifyExecuteMock = jest.fn();
    (agent as any).clarifyIntentTool = { execute: clarifyExecuteMock };

    (agent as any).isVaguePrompt = jest.fn().mockResolvedValue(true);
    (agent as any).classifyWorkflowQuestion = jest.fn().mockResolvedValue("directly_answerable");

    const context: ToolContext = {
      conversationId: "conv-2",
      userId: "user-1",
      organizationId: "org-1",
      screenshots: [
        {
          windowId: "w1",
          windowTitle: "Test",
          appName: "TestApp",
          dataUrl: "data:image/png;base64,xxx",
          metadata: { width: 100, height: 100, scaleFactor: 1 },
        },
      ],
      metadata: {
        workflowAction: "custom_question",
      },
      userProfile: {
        name: "Test User",
        email: "test@example.com",
        organizationId: "org-1",
      },
      conversationHistory: [
        {
          id: "m1",
          conversationId: "conv-2",
          role: "user",
          content: "What is the point of this step?",
          messageType: "text",
          cardData: null,
          sources: [],
          workflowSessionId: "session-123",
          relatedStepIndex: 1,
          createdAt: new Date(),
        },
      ],
      workflowState: {
        workflowSessionId: "session-123",
        status: "active",
        currentStepIndex: 1,
        solution: "Do something important",
        solutionExplanation: "This workflow helps you achieve something important.",
        supportingData: [],
        searchQuery: "How do I do something important?",
        supportingDataExplanation: "Docs that support the workflow.",
        stepList: [
          { stepNumber: 1, description: "First step", status: "completed" },
          { stepNumber: 2, description: "Second step", status: "pending" },
        ],
        adjustmentHistory: [],
      } as any,
    };

    const chunks: StreamChunk[] = [];
    for await (const chunk of agent.execute(context)) {
      chunks.push(chunk);
    }

    // ClarifyIntent should NOT be called for step-level custom questions
    expect(clarifyExecuteMock).not.toHaveBeenCalled();

    // We should still classify the workflow question
    expect((agent as any).classifyWorkflowQuestion).toHaveBeenCalledWith(
      "What is the point of this step?"
    );

    // And delegate to TextResponseAgent (workflow-aware)
    expect(mockTextAgent.execute).toHaveBeenCalledTimes(1);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].type).toBe("complete");
    expect(chunks[0].content).toBe("Workflow-aware answer");
  });
});

