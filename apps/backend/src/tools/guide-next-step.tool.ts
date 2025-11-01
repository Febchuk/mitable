import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool.js";
import { geminiVisionService } from "../services/gemini-vision.service.js";
import { guideGenerationService } from "../services/guideGeneration.service.js";
// import type { SolutionObject } from "@mitable/shared"; // Unused - commented out

/**
 * Guide Next Step Tool
 *
 * Progresses an active UI guidance workflow to the next step.
 *
 * TRIGGER MECHANISM:
 * This tool is called by OpenAI when it receives a system message hint
 * indicating the user selected "Move on to next step" (option 1) from the
 * WorkflowOptions component in the conversation renderer.
 *
 * The agent service detects metadata.workflowAction === "progress_step" and
 * provides a hint to OpenAI to use this tool. OpenAI then calls this tool
 * with the conversationId.
 *
 * WORKFLOW PROGRESSION:
 * 1. Retrieves current SolutionObject from conversation history
 * 2. ALWAYS evaluates if plan needs adjustment based on screenshot
 * 3. Applies adjustments if user's screen shows unexpected state
 * 4. Marks previous step as completed, current step as current
 * 5. Generates visual guidance for the next step via Gemini Vision
 * 6. Returns updated SolutionObject with new state
 *
 * REQUIREMENTS:
 * - Screenshot MUST be provided (automatically captured when user selects option)
 * - ConversationId MUST be provided (to retrieve SolutionObject)
 * - Only works during active workflows (after start_ui_guidance_workflow)
 */
export class GuideNextStepTool extends BaseTool {
  name = "guide_next_step";

  description = `Progress an active UI guidance workflow to the next step.

WHEN TO USE:
This tool is called when the user selects "Move on to next step" from the
WorkflowOptions component UI. The agent service provides a system hint when
it detects metadata.workflowAction === "progress_step".

CRITICAL REQUIREMENTS:
1. Screenshot MUST be available (automatically captured)
2. ConversationId MUST be provided (to retrieve workflow state)
3. Only use when workflow is already active

WORKFLOW PROGRESSION:
1. Retrieve current SolutionObject from conversation
2. Evaluate if plan needs adjustment based on screenshot
3. Apply adjustments if necessary (communicate changes to user)
4. Mark previous step as completed
5. Generate guidance for next step with visual analysis
6. Return updated SolutionObject in cardData

DO NOT USE:
- To start a new workflow (use start_ui_guidance_workflow instead)
- When no active workflow exists
- This tool is ONLY for progressing through existing workflows`.trim();

  parameters: ToolParameters = {
    type: "object",
    properties: {
      conversationId: {
        type: "string",
        description: "The conversation ID containing the active workflow state",
      },
    },
    required: ["conversationId"],
  };

  async execute(args: { conversationId: string }, context: ToolContext): Promise<ToolResult> {
    this.validate(args);

    const { conversationId } = args;

    console.log("[GuideNextStepTool] Progressing workflow in conversation:", conversationId);

    try {
      // Step 1: Retrieve current SolutionObject from conversation
      const currentSolution =
        await guideGenerationService.retrieveLatestSolutionObject(conversationId);

      if (!currentSolution) {
        console.error("[GuideNextStepTool] No active workflow found in conversation");
        return {
          messageType: "text",
          content:
            "I couldn't find an active workflow in this conversation. Would you like to start a new task guide?",
          streamable: true,
        };
      }

      // ✅ Phase 2C: Handle missing screenshot with context message
      if (!context.screenshot) {
        console.log("[GuideNextStepTool] No screenshot - providing text-based guidance");

        const nextStepIndex = currentSolution.currentStepIndex + 1;
        const nextStep = currentSolution.stepList[nextStepIndex];

        if (!nextStep) {
          return {
            messageType: "text",
            content: "You've completed all the steps! Great work! 🎉",
            streamable: true,
          };
        }

        // Get active workflow to save context message
        const { workflowService } = await import("../services/workflow.service.js");
        const activeWorkflow = await workflowService.getActiveWorkflow(conversationId);

        if (activeWorkflow) {
          // Save as context message (not tied to specific step)
          const contextMessage = `I can't see your screen right now, but here's what you need to do next:\n\n**Step ${nextStep.stepNumber}: ${nextStep.description}**\n\nOnce you're on this screen, I'll be able to see it and provide visual guidance!`;

          await workflowService.addInteraction(
            activeWorkflow.id,
            "ai_context_message",
            "assistant",
            contextMessage,
            undefined, // Not tied to a specific step
            { reason: "no_screenshot" }
          );

          return {
            messageType: "text",
            content: contextMessage,
            streamable: true,
          };
        }
      }

      console.log("[GuideNextStepTool] Current workflow state:", {
        currentStepIndex: currentSolution.currentStepIndex,
        totalSteps: currentSolution.stepList.length,
        adjustmentHistory: currentSolution.adjustmentHistory.length,
      });

      // Step 2: Calculate next step index
      const nextStepIndex = currentSolution.currentStepIndex + 1;

      // Validate we're not past the end
      if (nextStepIndex >= currentSolution.stepList.length) {
        console.log("[GuideNextStepTool] Workflow completed - no more steps");
        return {
          messageType: "text",
          content: `Great work! You've completed all ${currentSolution.stepList.length} steps. The task is complete! 🎉`,
          streamable: true,
        };
      }

      // Step 3: ALWAYS evaluate if plan needs adjustment
      console.log("[GuideNextStepTool] Evaluating if plan needs adjustment...");
      const evaluation = await geminiVisionService.evaluateProgress(
        context.screenshot!, // Non-null assertion: screenshot check happened above
        currentSolution,
        context.conversationHistory,
        nextStepIndex
      );

      console.log("[GuideNextStepTool] Evaluation result:", {
        needsAdjustment: evaluation.needsAdjustment,
        reason: evaluation.adjustmentReason,
        newStepCount: evaluation.adjustedStepList?.length,
      });

      // Step 4: Apply adjustments if needed
      let updatedSolution = currentSolution;
      if (evaluation.needsAdjustment && evaluation.adjustedStepList) {
        console.log("[GuideNextStepTool] Applying plan adjustments");
        updatedSolution = {
          ...currentSolution,
          stepList: evaluation.adjustedStepList,
          adjustmentHistory: [
            ...currentSolution.adjustmentHistory,
            {
              timestamp: new Date().toISOString(),
              reason: evaluation.adjustmentReason || "Plan adjusted based on current screen state",
              oldStepCount: currentSolution.stepList.length,
              newStepCount: evaluation.adjustedStepList.length,
            },
          ],
        };
      }

      // Step 5: Progress to next step (update step statuses)
      updatedSolution = {
        ...updatedSolution,
        currentStepIndex: nextStepIndex,
        stepList: updatedSolution.stepList.map((s, idx) => ({
          ...s,
          status: idx < nextStepIndex ? "completed" : idx === nextStepIndex ? "current" : "pending",
        })),
      };

      // Step 6: Get visual guidance for the next step
      const nextStep = updatedSolution.stepList[nextStepIndex];
      console.log("[GuideNextStepTool] Analyzing next step:", {
        stepNumber: nextStep.stepNumber,
        description: nextStep.description,
      });

      const visualGuidance = await geminiVisionService.analyzeStepExecution(
        context.screenshot!, // Non-null assertion: screenshot check happened above
        updatedSolution,
        nextStep,
        context.conversationHistory
      );

      console.log("[GuideNextStepTool] Visual guidance generated:", {
        conversationalMessage: visualGuidance.conversationalMessage,
        conversationalMessageLength: visualGuidance.conversationalMessage?.length || 0,
        confidence: visualGuidance.confidence,
      });

      // Step 7: Build conversational message
      let message = visualGuidance.conversationalMessage;

      // If plan was adjusted, communicate it to the user
      if (evaluation.needsAdjustment) {
        message = `📝 *Plan Updated:* ${evaluation.adjustmentReason}\n\n${message}`;
        console.log("[GuideNextStepTool] Including adjustment notice in response");
      }

      console.log("[GuideNextStepTool] Workflow progressed successfully:", {
        newStepIndex: nextStepIndex,
        totalSteps: updatedSolution.stepList.length,
        adjustmentMade: evaluation.needsAdjustment,
      });

      // Step 8: Return AI response (workflow data is in workflow_sessions table)
      // ✅ Phase 2A: Tool result is saved to workflow_interactions, not messages
      return {
        messageType: "text",
        content: message,
        streamable: true,
      };
    } catch (error) {
      console.error("[GuideNextStepTool] Error progressing workflow:", error);
      return {
        messageType: "text",
        content:
          "I encountered an error while trying to progress to the next step. Please try again or let me know if you need help.",
        streamable: true,
      };
    }
  }
}
