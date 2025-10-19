import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool";
import { guideGenerationService } from "../services/guideGeneration.service";

/**
 * Guide Next Step Tool
 *
 * Provides step-by-step visual UI guidance for completing tasks.
 * Detects "how do I..." type questions and finds/generates interactive guides
 * with visual overlays and precise UI element highlighting.
 *
 * Use cases:
 * - "How do I submit an expense report?"
 * - "Show me how to request PTO"
 * - "Guide me through escalating a billing issue"
 * - Any procedural "how to" question requiring UI interaction
 *
 * Auto-launches the Guide + Overlay windows to show step-by-step instructions
 * with visual highlights on target UI elements.
 */
export class GuideNextStepTool extends BaseTool {
  name = "show_step_by_step_guide";

  description = `
    Provide step-by-step visual guidance for completing a task in the UI.
    Use this tool ONLY when:
    - The user explicitly asks "how do I..." or "show me how to..."
    - The question is about a procedural task that requires UI interaction
    - Step-by-step instructions would be more helpful than text explanation

    This tool will search for existing guides or generate a new guide,
    then automatically launch the Guide window with visual overlays showing
    exactly where to click and what to do at each step.

    DO NOT use this for general questions or information requests - use
    respond_with_text or search_knowledge_base instead.
  `.trim();

  parameters: ToolParameters = {
    type: "object",
    properties: {
      task: {
        type: "string",
        description:
          "The task the user wants to learn how to do (e.g., 'submit expense report', 'request time off')",
      },
      userQuestion: {
        type: "string",
        description:
          "The original user question for context",
      },
    },
    required: ["task", "userQuestion"],
  };

  /**
   * Execute guide lookup/generation
   *
   * @param args - Task description and user question
   * @param context - User context and optional screenshot
   * @returns Tool result with guide data and window trigger
   */
  async execute(
    args: { task: string; userQuestion: string },
    context: ToolContext
  ): Promise<ToolResult> {
    // Validate arguments
    this.validate(args);

    const { task, userQuestion } = args;
    const screenshot = context.screenshot; // Future: screenshot from Cmd+H

    console.log(`[GuideNextStepTool] Finding guide for task: "${task}"`);

    try {
      // Search for or generate a guide
      const result = await guideGenerationService.findGuide(
        userQuestion,
        screenshot
      );

      if (!result.found || !result.guide) {
        // No guide found - suggest alternatives
        return {
          messageType: "text",
          content: `I don't have a step-by-step guide for "${task}" yet. ${result.message}`,
          streamable: true,
        };
      }

      console.log(`[GuideNextStepTool] Found guide: ${result.guide.title}`);

      // Format response message
      const stepCount = result.guide.steps.length;
      const responseText = `Great! I found a ${stepCount}-step guide for "${result.guide.title}".

I'm showing you the visual guide now - it will highlight exactly where to click and what to do at each step. Just follow along!`;

      // Return with window trigger to launch Guide + Overlay windows
      return {
        messageType: "workflow",
        content: responseText,
        cardData: {
          guide: result.guide,
        },
        streamable: true,
        triggerWindow: {
          window: "guide",
          data: {
            guide: result.guide,
          },
        },
      };
    } catch (error) {
      console.error("[GuideNextStepTool] Error finding guide:", error);

      return {
        messageType: "text",
        content: "I encountered an error while looking for a guide. Let me search the knowledge base or connect you with an expert instead.",
        streamable: true,
      };
    }
  }
}
