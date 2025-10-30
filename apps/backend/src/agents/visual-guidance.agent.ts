import OpenAI from "openai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import { KnowledgeAgent } from "./knowledge.agent";
import type { StreamChunk, ToolContext, TextMessage } from "../tools/base.tool";
import { ClarifyIntentTool } from "../tools/clarify-intent.tool";
import { StartUIGuidanceWorkflowTool } from "../tools/start-ui-guidance-workflow.tool";
import { GuideNextStepTool } from "../tools/guide-next-step.tool";
import { AnalyzeWorkflowScreenTool } from "../tools/analyze-workflow-screen.tool";
import { RespondTextTool } from "../tools/respond-text.tool";
import { wrapWithWorkflowState } from "../tools/utils/workflow-wrapper";

/**
 * Visual Guidance Agent
 *
 * Multi-step UI guidance with screenshot analysis.
 * Uses GPT-4 Turbo + Gemini Vision 2.0 Flash for visual understanding.
 *
 * Responsibilities:
 * - "How do I..." questions with screenshots
 * - Step-by-step UI guidance
 * - Workflow progression
 * - Screen troubleshooting
 * - Vague prompt clarification
 *
 * Tools:
 * - clarify_intent: Analyze vague prompts, offer specific interpretations
 * - start_ui_guidance_workflow: Create initial step-by-step plan
 * - guide_next_step: Progress to next step, analyze screen, generate visual guidance
 * - analyze_workflow_screen: Troubleshoot visual issues during workflow
 *
 * Services Used:
 * - geminiVisionService: Screenshot analysis
 *   - analyzeScreenshot(): UI element detection
 *   - evaluateProgress(): Plan adjustment detection
 *   - analyzeStepExecution(): Step-specific guidance
 *   - interpretVaguePrompt(): Intent clarification
 * - guideGenerationService: Workflow state management
 *
 * Complexity Detection:
 * - LOW (3-5 steps): Single app, linear workflow
 * - MEDIUM (5-8 steps): Multi-app, nested menus
 * - HIGH (8-12+ steps): Debugging, multi-system tracing
 *
 * Agent-to-Agent Communication:
 * - Calls KnowledgeAgent for knowledge-grounded workflows
 *
 * Triggers:
 * - Guide Window (via triggerWindow mechanism)
 */
export class VisualGuidanceAgent extends BaseAgent {
  readonly name = "visual-guidance";
  private openai: OpenAI;
  private knowledgeAgent: KnowledgeAgent;
  private clarifyIntentTool: ClarifyIntentTool;
  private startWorkflowTool: StartUIGuidanceWorkflowTool;
  private guideNextStepTool: GuideNextStepTool;
  private analyzeScreenTool: AnalyzeWorkflowScreenTool;
  private respondTextTool: RespondTextTool;

  constructor(knowledgeAgent: KnowledgeAgent) {
    super();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.knowledgeAgent = knowledgeAgent;
    this.clarifyIntentTool = new ClarifyIntentTool();
    this.startWorkflowTool = new StartUIGuidanceWorkflowTool();
    this.guideNextStepTool = new GuideNextStepTool();
    this.analyzeScreenTool = new AnalyzeWorkflowScreenTool();
    this.respondTextTool = new RespondTextTool();
  }

  /**
   * Execute visual guidance workflow with hybrid routing
   *
   * ARCHITECTURE: Deterministic Fast Paths + LLM Function Calling
   *
   * Deterministic routing (60% of cases):
   * - Screenshot check (technical constraint)
   * - Metadata signals from UI (workflowAction = "progress_step")
   *
   * LLM function calling (40% of cases):
   * - Initial request routing (vague vs specific vs non-workflow)
   * - Custom workflow questions (visual vs knowledge vs conceptual)
   */
  async *execute(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // ========== DETERMINISTIC FAST PATH #1: Technical Constraint ==========
      // Screenshot is required for visual guidance - fail fast
      if (!context.screenshot) {
        console.log("[VisualGuidanceAgent] Route: deterministic (no screenshot)");
        yield {
          type: "complete",
          messageType: "text",
          content:
            "I need to see your screen to provide step-by-step guidance. Please capture a screenshot.",
        };
        return;
      }

      // Get the last user message
      const lastUserMessage = context.conversationHistory
        .filter((msg) => msg.role === "user")
        .pop();

      if (!lastUserMessage) {
        yield {
          type: "error",
          error: "No user message found in conversation history",
        };
        return;
      }

      // ========== DETERMINISTIC FAST PATH #2: Explicit Metadata Signal ==========
      // User clicked "Move on to next step" button - 100% deterministic
      if (context.metadata?.workflowAction === "progress_step") {
        console.log("[VisualGuidanceAgent] Route: deterministic (metadata: progress_step)");

        const result = await this.guideNextStepTool.execute(
          {
            conversationId: context.conversationId,
          },
          context
        );

        yield {
          type: "complete",
          messageType: result.messageType,
          content: result.content,
          cardData: result.cardData,
          windowTrigger: result.triggerWindow,
        };
        return;
      }

      // ========== LLM FUNCTION CALLING #1: Custom Workflow Questions ==========
      // User is in active workflow and asked a custom question
      // Let LLM choose: analyze_workflow_screen | search_knowledge | respond_with_text
      // NOTE: workflowAction metadata is optional - we route based on workflowState alone
      if (context.workflowState) {
        console.log("[VisualGuidanceAgent] Route: LLM function calling (custom question in workflow)");
        yield* this.handleCustomQuestion(context);
        return;
      }

      // ========== LLM FUNCTION CALLING #2: Initial Request Routing ==========
      // New request - could be vague, specific, or not even a workflow
      // Let LLM choose: clarify_intent | start_ui_guidance_workflow | respond_with_text
      console.log("[VisualGuidanceAgent] Route: LLM function calling (initial request)");
      yield* this.routeInitialRequest(context);
    } catch (error) {
      console.error("[VisualGuidanceAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error in visual guidance",
      };
    }
  }

  /**
   * Route initial user requests using LLM function calling
   *
   * This method uses GPT-4 Vision to intelligently choose between:
   * - clarify_intent: When the prompt is vague/ambiguous
   * - start_ui_guidance_workflow: When it's a specific UI task request
   * - respond_with_text: When it's not actually a workflow request
   *
   * Replaces brittle regex-based isVaguePrompt() method
   */
  private async *routeInitialRequest(context: ToolContext): AsyncIterable<StreamChunk> {
    const lastUserMessage = context.conversationHistory.filter((msg) => msg.role === "user").pop();

    if (!lastUserMessage) {
      yield {
        type: "error",
        error: "No user message found",
      };
      return;
    }

    // Define available tools for initial routing
    const tools = [
      this.clarifyIntentTool.getDefinition(),
      this.startWorkflowTool.getDefinition(),
      this.respondTextTool.getDefinition(),
    ];

    const systemPrompt = `You are a routing assistant for an employee onboarding system. Your job is to choose the RIGHT tool based on the user's request and screenshot.

**TOOL SELECTION RULES:**

1. Use "clarify_intent" when:
   - User says "How do I do this?" or "Help me with this" (vague, no specific task)
   - User says "I'm stuck" or "Not sure what to do"
   - Prompt is ambiguous and could mean multiple things
   - You need to analyze the screenshot to understand what they want

2. Use "start_ui_guidance_workflow" when:
   - User asks a SPECIFIC task: "How do I configure SSO?", "How do I create a project?"
   - User wants step-by-step guidance for a clear action
   - The request is concrete and actionable
   - Screenshot shows a relevant application/screen

3. Use "respond_with_text" when:
   - Request is NOT a UI workflow (e.g., "How do I contact support?", "What's the company mission?")
   - Simple question that doesn't need visual guidance
   - Conceptual question without actionable UI steps

**IMPORTANT:** Screenshot is available. Consider the visual context when making your decision.

User request: "${lastUserMessage.content}"
Screenshot: Available

Choose the appropriate tool and provide the required arguments.`;

    try {
      console.log("[VisualGuidanceAgent] Routing initial request via LLM function calling");

      // Call OpenAI with function calling
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: lastUserMessage.content },
        ],
        tools: tools,
        tool_choice: "auto",
        temperature: 0.3, // Lower temperature for more deterministic routing
      });

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0];

      if (!toolCall || toolCall.type !== "function") {
        console.warn("[VisualGuidanceAgent] No function tool call from LLM, falling back to respond_text");
        const result = await this.respondTextTool.execute(
          { response: "I'm having trouble understanding your request. Could you please rephrase it?" },
          context
        );

        yield {
          type: "complete",
          messageType: result.messageType,
          content: result.content,
        };
        return;
      }

      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      console.log("[VisualGuidanceAgent] LLM chose tool:", {
        toolName: functionName,
        args: functionArgs,
        routeType: "function_calling",
      });

      // Execute the chosen tool
      let result;
      switch (functionName) {
        case "clarify_intent":
          result = await this.clarifyIntentTool.execute(functionArgs, context);
          break;
        case "start_ui_guidance_workflow": {
          // For start_workflow, we need to search knowledge first
          const searchResult = await this.knowledgeAgent.search(lastUserMessage.content, context);
          result = await this.startWorkflowTool.execute(
            {
              ...functionArgs,
              supportingData: searchResult.sources || [],
              searchQuery: lastUserMessage.content,
              supportingDataExplanation: `Found ${searchResult.sources?.length || 0} relevant documents`,
            },
            context
          );
          break;
        }
        case "respond_with_text":
          result = await this.respondTextTool.execute(functionArgs, context);
          break;
        default:
          throw new Error(`Unknown tool: ${functionName}`);
      }

      yield {
        type: "complete",
        messageType: result.messageType,
        content: result.content,
        cardData: result.cardData,
        windowTrigger: result.triggerWindow,
      };
    } catch (error) {
      console.error("[VisualGuidanceAgent] Error in routeInitialRequest:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown routing error",
      };
    }
  }

  /**
   * Handle custom questions during active workflow using LLM function calling
   *
   * This method uses GPT-4 Vision to intelligently choose between:
   * - analyze_workflow_screen: Visual/UI issues ("I don't see the button")
   * - search_knowledge: Knowledge questions ("What is SSO?")
   * - respond_with_text: Conceptual questions ("Why do I need this step?")
   *
   * Replaces brittle regex-based classifyWorkflowQuestion() method
   */
  private async *handleCustomQuestion(context: ToolContext): AsyncIterable<StreamChunk> {
    const lastUserMessage = context.conversationHistory.filter((msg) => msg.role === "user").pop();

    if (!lastUserMessage) {
      yield {
        type: "error",
        error: "No user message found",
      };
      return;
    }

    // Define available tools for custom question routing
    const tools = [
      this.analyzeScreenTool.getDefinition(),
      {
        type: "function" as const,
        function: {
          name: "search_knowledge",
          description: "Search company knowledge base for documentation, policies, and information. Use when user asks about company-specific concepts, features, or processes that require documentation.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query for the knowledge base",
              },
            },
            required: ["query"],
          },
        },
      },
      this.respondTextTool.getDefinition(),
    ];

    const currentStep = context.workflowState?.stepList?.[context.workflowState?.currentStepIndex];
    const stepContext = currentStep
      ? `Current step: "${currentStep.description}"`
      : "In active workflow";

    const systemPrompt = `You are helping a user who is IN THE MIDDLE of a step-by-step UI workflow. ${stepContext}

The user has asked a custom question during the workflow. Choose the RIGHT tool based on their question type:

**TOOL SELECTION RULES:**

1. Use "analyze_workflow_screen" when:
   - User has a VISUAL/UI issue: "I don't see the button", "Where is X?", "The screen looks different"
   - User says "I can't find...", "It's not showing...", "The button is grayed out"
   - User sees something unexpected on screen
   - Requires analyzing the screenshot to troubleshoot

2. Use "search_knowledge" when:
   - User asks WHAT something is: "What is SSO?", "What does this feature do?"
   - User asks HOW something works: "How does authentication work?"
   - User asks for benefits/purpose: "What's the purpose of X?"
   - Requires company documentation/knowledge base

3. Use "respond_with_text" when:
   - User asks WHY about current step: "Why do I need to do this?", "Why this step?"
   - User asks "Can I skip this?", "Is this required?"
   - Simple conceptual question about the workflow itself
   - Doesn't need docs or screen analysis

**IMPORTANT:**
- Screenshot is available for visual analysis
- User is in an active workflow, so preserve workflow state
- ${stepContext}

User question: "${lastUserMessage.content}"

Choose the appropriate tool.`;

    try {
      console.log("[VisualGuidanceAgent] Handling custom workflow question via LLM function calling");

      // Call OpenAI with function calling
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: lastUserMessage.content },
        ],
        tools: tools,
        tool_choice: "auto",
        temperature: 0.3, // Lower temperature for deterministic routing
      });

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0];

      if (!toolCall || toolCall.type !== "function") {
        console.warn("[VisualGuidanceAgent] No function tool call from LLM, falling back to respond_text");
        const textResult = await this.respondTextTool.execute(
          { response: "I'm having trouble understanding your question. Could you please rephrase it?" },
          context
        );

        // RespondTextTool always returns TextMessage, safe to cast
        const wrapped = wrapWithWorkflowState(textResult as TextMessage, context, "custom_question");

        yield {
          type: "complete",
          messageType: wrapped.messageType,
          content: wrapped.content,
          cardData: "cardData" in wrapped ? wrapped.cardData : undefined,
        };
        return;
      }

      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      console.log("[VisualGuidanceAgent] LLM chose tool for custom question:", {
        toolName: functionName,
        args: functionArgs,
        routeType: "function_calling",
        workflowPreserved: true,
      });

      // Execute the chosen tool
      switch (functionName) {
        case "analyze_workflow_screen": {
          const result = await this.analyzeScreenTool.execute(
            {
              conversationId: context.conversationId,
              issue: lastUserMessage.content,
            },
            context
          );

          yield {
            type: "complete",
            messageType: result.messageType,
            content: result.content,
            cardData: result.cardData,
          };
          break;
        }
        case "search_knowledge": {
          const searchResult = await this.knowledgeAgent.search(functionArgs.query, context);
          const wrapped = wrapWithWorkflowState(searchResult, context, "custom_question");

          yield {
            type: "complete",
            messageType: wrapped.messageType,
            content: wrapped.content,
            cardData: "cardData" in wrapped ? wrapped.cardData : undefined,
            sources: "sources" in wrapped ? wrapped.sources : undefined,
          };
          break;
        }
        case "respond_with_text": {
          const textResult = await this.respondTextTool.execute(functionArgs, context);
          // RespondTextTool always returns TextMessage, safe to cast
          const wrapped = wrapWithWorkflowState(textResult as TextMessage, context, "custom_question");

          yield {
            type: "complete",
            messageType: wrapped.messageType,
            content: wrapped.content,
            cardData: "cardData" in wrapped ? wrapped.cardData : undefined,
          };
          break;
        }
        default:
          throw new Error(`Unknown tool: ${functionName}`);
      }
    } catch (error) {
      console.error("[VisualGuidanceAgent] Error in handleCustomQuestion:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error handling custom question",
      };
    }
  }
}
