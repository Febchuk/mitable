import OpenAI from "openai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import { KnowledgeAgent } from "./knowledge.agent";
import type { StreamChunk, ToolContext } from "../tools/base.tool";
import { ClarifyIntentTool } from "../tools/clarify-intent.tool";
import { StartUIGuidanceWorkflowTool } from "../tools/start-ui-guidance-workflow.tool";
import { GuideNextStepTool } from "../tools/guide-next-step.tool";
import { AnalyzeWorkflowScreenTool } from "../tools/analyze-workflow-screen.tool";
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

  constructor(knowledgeAgent: KnowledgeAgent) {
    super();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.knowledgeAgent = knowledgeAgent;
    this.clarifyIntentTool = new ClarifyIntentTool();
    this.startWorkflowTool = new StartUIGuidanceWorkflowTool();
    this.guideNextStepTool = new GuideNextStepTool();
    this.analyzeScreenTool = new AnalyzeWorkflowScreenTool();
  }

  /**
   * Execute visual guidance workflow
   */
  async *execute(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Check if screenshot is available
      if (!context.screenshot) {
        yield {
          type: "complete",
          messageType: "text",
          content: "I need to see your screen to provide step-by-step guidance. Please capture a screenshot.",
          streamable: true,
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

      // Handle metadata-driven routing (deterministic)
      if (context.metadata?.workflowAction === "progress_step") {
        // User clicked "Move on to next step" - progress workflow
        const result = await this.guideNextStepTool.execute({}, context);

        yield {
          type: "complete",
          messageType: result.messageType,
          content: result.content,
          cardData: result.cardData,
          triggerWindow: result.triggerWindow,
          streamable: true,
        };
        return;
      }

      // Check if user message is vague ("How do I do this?", "Help me with this")
      const isVaguePrompt = this.isVaguePrompt(lastUserMessage.content);

      if (isVaguePrompt) {
        // Use clarify_intent to analyze screen and offer interpretations
        const result = await this.clarifyIntentTool.execute(
          {
            vaguePrompt: lastUserMessage.content,
            screenshot: context.screenshot,
          },
          context
        );

        yield {
          type: "complete",
          messageType: result.messageType,
          content: result.content,
          cardData: result.cardData,
          streamable: true,
        };
        return;
      }

      // Handle custom questions during active workflow
      if (context.workflowState) {
        const questionType = this.classifyWorkflowQuestion(lastUserMessage.content);

        if (questionType === "visual") {
          // Visual/UI issue - use analyze_workflow_screen
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
            streamable: true,
          };
          return;
        } else {
          // Conceptual question - call KnowledgeAgent and wrap with workflow state
          const searchResult = await this.knowledgeAgent.search(lastUserMessage.content, context);
          const wrappedResult = wrapWithWorkflowState(searchResult, context, "custom_question");

          yield {
            type: "complete",
            messageType: wrappedResult.messageType,
            content: wrappedResult.content,
            sources: "sources" in wrappedResult ? wrappedResult.sources : undefined,
            cardData: "cardData" in wrappedResult ? wrappedResult.cardData : undefined,
            streamable: true,
          };
          return;
        }
      }

      // Start new workflow: STEP 1 - Search knowledge, STEP 2 - Create workflow
      console.log("[VisualGuidanceAgent] Starting knowledge-grounded workflow");

      // Call KnowledgeAgent for company documentation
      const searchResult = await this.knowledgeAgent.search(lastUserMessage.content, context);

      // Create workflow with search results as supportingData
      const workflowResult = await this.startWorkflowTool.execute(
        {
          solution: `Guide for: ${lastUserMessage.content}`,
          solutionExplanation: "Based on company documentation and screen analysis",
          supportingData: searchResult.sources?.map((s) => ({
            text: s.snippet,
            source: s.title,
            metadata: { score: 1.0 },
          })) || [],
          searchQuery: lastUserMessage.content,
          supportingDataExplanation: `Found ${searchResult.sources?.length || 0} relevant documents`,
          stepList: [
            // Placeholder - tool will generate actual steps
            { stepNumber: 1, description: "Analyzing...", status: "pending" as const },
          ],
        },
        context
      );

      yield {
        type: "complete",
        messageType: workflowResult.messageType,
        content: workflowResult.content,
        cardData: workflowResult.cardData,
        triggerWindow: workflowResult.triggerWindow,
        streamable: true,
      };
    } catch (error) {
      console.error("[VisualGuidanceAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error in visual guidance",
      };
    }
  }

  /**
   * Check if user message is vague (needs clarification)
   */
  private isVaguePrompt(message: string): boolean {
    const vaguePatterns = [
      /^how do i do this/i,
      /^help me with this/i,
      /^what should i click/i,
      /^how do i$/i,
      /^help$/i,
      /^guide me$/i,
    ];

    return vaguePatterns.some((pattern) => pattern.test(message.trim()));
  }

  /**
   * Classify workflow question type (visual vs conceptual)
   */
  private classifyWorkflowQuestion(message: string): "visual" | "conceptual" {
    const visualPatterns = [
      /i don't see/i,
      /where is/i,
      /the screen looks/i,
      /it's not showing/i,
      /i see .* instead/i,
      /can't find/i,
    ];

    const isVisual = visualPatterns.some((pattern) => pattern.test(message));
    return isVisual ? "visual" : "conceptual";
  }
}
