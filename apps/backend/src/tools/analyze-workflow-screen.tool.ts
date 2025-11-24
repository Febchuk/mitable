import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool.js";
import { geminiVisionService } from "../services/gemini-vision.service.js";
import { guideGenerationService } from "../services/guideGeneration.service.js";
// import type { SolutionObject } from "@mitable/shared"; // Unused - commented out

/**
 * Analyze Workflow Screen Tool
 *
 * Provides troubleshooting help for screen-specific issues during an active workflow.
 *
 * TRIGGER MECHANISM:
 * This tool is called by OpenAI when the user selects "Type something" (option 2)
 * from WorkflowOptions and asks a question that requires visual screen analysis.
 *
 * OpenAI analyzes the user's custom question and decides whether it needs screen
 * analysis (use this tool) or can be answered from knowledge/context (use
 * respond_with_text or search_knowledge instead).
 *
 * EXAMPLES:
 * - "I don't see the canvas button" → Use this tool (visual issue)
 * - "Why do I need to do step 3?" → Use respond_with_text (conceptual question)
 * - "What is the canvas feature used for?" → Use search_knowledge (knowledge question)
 *
 * IMPORTANT:
 * - Does NOT progress the workflow (stays on same step)
 * - Only provides troubleshooting guidance for current step
 * - User can ask multiple questions before moving on
 *
 * REQUIREMENTS:
 * - Screenshot MUST be provided
 * - ConversationId MUST be provided (to get workflow context)
 * - Active workflow must exist
 */
export class AnalyzeWorkflowScreenTool extends BaseTool {
  name = "analyze_workflow_screen";

  description =
    `Analyze the user's screen to help troubleshoot visual/UI issues during an active workflow.

WHEN TO USE:
Use this tool when the user asks a question about a VISUAL or UI-related issue
during an active workflow. OpenAI should decide when screen analysis is needed
vs when the question can be answered from knowledge/context.

Screen analysis needed:
- "I don't see the [element]"
- "Where is the [button/menu/field]?"
- "The screen looks different"
- "It's not showing what you described"
- "I see [X] instead of [Y]"

Knowledge/context sufficient (don't use this tool):
- "Why do I need to do this step?"
- "What happens if I skip this?"
- "Can you explain what [feature] does?"
- "How does this relate to [concept]?"

CRITICAL REQUIREMENTS:
1. Screenshot MUST be available
2. ConversationId MUST be provided (to get workflow context)
3. Issue description must relate to what's on screen
4. Does NOT progress workflow (stays on current step)

BEHAVIOR:
1. Retrieves current SolutionObject for context
2. Analyzes screenshot with user's specific issue
3. Provides targeted visual guidance
4. Returns troubleshooting help (no workflow progression)`.trim();

  parameters: ToolParameters = {
    type: "object",
    properties: {
      conversationId: {
        type: "string",
        description: "The conversation ID containing the active workflow state",
      },
      issue: {
        type: "string",
        description:
          "Brief description of what the user is having trouble with (e.g., 'cannot find canvas button', 'screen shows different elements')",
      },
    },
    required: ["conversationId", "issue"],
  };

  async execute(
    args: { conversationId: string; issue: string },
    context: ToolContext
  ): Promise<ToolResult> {
    this.validate(args);

    const { conversationId, issue } = args;

    console.log("[AnalyzeWorkflowScreenTool] Analyzing screen issue:", {
      conversationId,
      issue,
    });

    // Validate screenshot is present
    if (!context.screenshots || context.screenshots.length === 0) {
      console.error("[AnalyzeWorkflowScreenTool] No screenshot provided");
      return {
        messageType: "text",
        content:
          "I need to see your current screen to help troubleshoot this issue. Please make sure screenshot capture is enabled and try again.",
        streamable: true,
      };
    }

    try {
      // Step 1: Retrieve current SolutionObject for workflow context
      const currentSolution =
        await guideGenerationService.retrieveLatestSolutionObject(conversationId);

      if (!currentSolution) {
        console.error("[AnalyzeWorkflowScreenTool] No active workflow found");
        return {
          messageType: "text",
          content:
            "I couldn't find an active workflow in this conversation. If you'd like help with a task, let me know what you're trying to do!",
          streamable: true,
        };
      }

      const currentStep = currentSolution.stepList[currentSolution.currentStepIndex];

      console.log("[AnalyzeWorkflowScreenTool] Current workflow context:", {
        currentStepIndex: currentSolution.currentStepIndex,
        totalSteps: currentSolution.stepList.length,
        currentStepDescription: currentStep.description,
        issue,
      });

      // Step 2: Analyze screenshot with issue context
      // We'll use the same analyzeStepExecution method but focus on the troubleshooting aspect
      const visualGuidance = await geminiVisionService.analyzeStepExecution(
        context.screenshots,
        currentSolution,
        currentStep,
        context.conversationHistory
      );

      console.log("[AnalyzeWorkflowScreenTool] Visual analysis complete:", {
        conversationalMessage: visualGuidance.conversationalMessage?.substring(0, 100),
        confidence: visualGuidance.confidence,
        issue,
      });

      // Step 3: Build troubleshooting response
      // Prepend context about the issue
      const troubleshootingMessage = `I can see your screen. Regarding your issue: "${issue}"

${visualGuidance.conversationalMessage}

${visualGuidance.confidence === "low" ? "\n\n*Note: I'm having some difficulty analyzing this screen. If you're still stuck, let me know and I can search for more documentation or connect you with an expert.*" : ""}`;

      console.log("[AnalyzeWorkflowScreenTool] Troubleshooting guidance generated");

      // Step 4: Return without progressing workflow
      // Note: We DON'T update currentStepIndex or step statuses
      // Return with workflow state preserved so WorkflowOptions remains visible
      return {
        messageType: "workflow",
        content: troubleshootingMessage,
        cardData: {
          ...currentSolution,
          workflowActive: true,
          workflowPhase: "custom_question", // Triggers Q&A UI mode (hides step list, shows Q&A options)
        },
        streamable: true,
      };
    } catch (error) {
      console.error("[AnalyzeWorkflowScreenTool] Error analyzing screen:", error);
      return {
        messageType: "text",
        content:
          "I encountered an error while analyzing your screen. Can you describe what you're seeing in more detail, or would you like me to search our documentation?",
        streamable: true,
      };
    }
  }
}
