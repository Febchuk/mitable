import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool.js";
import { guideGenerationService } from "../services/guideGeneration.service.js";

/**
 * Text Response In Workflow Tool
 *
 * Generates conversational text responses to conceptual questions DURING an active workflow.
 * This tool preserves workflow state so WorkflowOptions UI remains visible after answering.
 *
 * TRIGGER MECHANISM:
 * This tool is called when:
 * 1. User selects "Type something" (option 2) from WorkflowOptions
 * 2. User asks a CONCEPTUAL question (not visual/UI or knowledge-based)
 * 3. Agent service provides hint via metadata.workflowAction === "custom_question"
 *
 * DIFFERENCES FROM respond_with_text:
 * - Requires conversationId to retrieve workflow state
 * - Returns messageType: "workflow" (not "text")
 * - Includes full SolutionObject in cardData to preserve workflow
 * - Sets workflowPhase: "custom_question" to trigger special UI
 *
 * EXAMPLES OF WHEN TO USE:
 * - "Why do I need to do this step?"
 * - "What happens if I skip this?"
 * - "Can I do this differently?"
 * - "Is this step required?"
 *
 * DO NOT USE FOR:
 * - Visual/UI issues → Use analyze_workflow_screen instead
 * - Knowledge questions → Use search_knowledge_in_workflow instead
 * - Questions outside active workflows → Use respond_with_text instead
 */
export class RespondTextInWorkflowTool extends BaseTool {
  name = "respond_with_text_in_workflow";

  description = `Answer conceptual questions during an active workflow while preserving workflow state.

WHEN TO USE:
This tool is for CONCEPTUAL questions about the current step or workflow process.
User has selected "Type something" from WorkflowOptions and asked a question that can
be answered from your knowledge without searching documentation or analyzing the screen.

Examples:
- "Why do I need to do this step?"
- "What happens if I skip this?"
- "Can I do this differently?"
- "Is this step required?"
- "What's the purpose of this?"

CRITICAL REQUIREMENTS:
1. ConversationId MUST be provided (to retrieve workflow state)
2. Active workflow must exist in conversation
3. Question is conceptual (not visual or knowledge-based)

BEHAVIOR:
1. Retrieves current SolutionObject to get workflow state
2. Answers user's conceptual question
3. Returns response with workflow state preserved in cardData
4. WorkflowOptions UI remains visible with custom_question phase options

DO NOT USE:
- Visual/UI issues → Use analyze_workflow_screen instead
- Feature/concept documentation → Use search_knowledge_in_workflow instead
- Questions outside workflows → Use respond_with_text instead`.trim();

  parameters: ToolParameters = {
    type: "object",
    properties: {
      conversationId: {
        type: "string",
        description: "The conversation ID containing the active workflow state",
      },
      response: {
        type: "string",
        description: "The helpful, friendly answer to the user's conceptual question",
      },
    },
    required: ["conversationId", "response"],
  };

  async execute(
    args: { conversationId: string; response: string },
    context: ToolContext
  ): Promise<ToolResult> {
    this.validate(args);

    const { conversationId, response } = args;

    console.log("[RespondTextInWorkflowTool] Execute:", {
      conversationId,
      responseLength: response.length,
    });

    try {
      // Retrieve current workflow state
      const currentSolution = await guideGenerationService.retrieveLatestSolutionObject(
        conversationId
      );

      if (!currentSolution) {
        console.warn(
          "[RespondTextInWorkflowTool] No active workflow found - falling back to text response"
        );
        // Fallback: return as regular text if no workflow exists
        return {
          messageType: "text",
          content: response,
          streamable: true,
        };
      }

      console.log("[RespondTextInWorkflowTool] Workflow state retrieved:", {
        currentStepIndex: currentSolution.currentStepIndex,
        totalSteps: currentSolution.stepList.length,
      });

      // Return with preserved workflow state
      return {
        messageType: "workflow",
        content: response,
        cardData: {
          ...currentSolution,
          workflowActive: true,
          workflowPhase: "custom_question", // Triggers Q&A UI mode
        },
        streamable: true,
      };
    } catch (error) {
      console.error("[RespondTextInWorkflowTool] Error retrieving workflow state:", error);
      // Fallback to regular text response on error
      return {
        messageType: "text",
        content: response,
        streamable: true,
      };
    }
  }
}
