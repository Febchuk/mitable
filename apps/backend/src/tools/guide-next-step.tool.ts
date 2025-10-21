import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool";
import { geminiVisionService } from "../services/gemini-vision.service";

/**
 * Guide Next Step Tool
 *
 * Provides ITERATIVE, just-in-time visual UI guidance for completing tasks.
 * Uses Gemini Vision to analyze screenshots and generate ONE step at a time
 * based on current screen state. Supports continuation signals ("Done", "Next")
 * to progress through multi-step workflows dynamically.
 *
 * ITERATIVE MODEL:
 * - Generates single steps, not complete workflows
 * - Adapts to what's currently on screen via screenshot analysis
 * - Waits for user confirmation before generating next step
 * - No pre-planning - responds to current context only
 *
 * Use cases:
 * - Initial: "How do I submit an expense report?" → Step 1 generated
 * - Continuation: User says "Done" → Screenshot captured → Step 2 generated
 * - Each step is dynamically created based on current UI state
 *
 * REQUIREMENTS:
 * - Screenshot MUST be provided for all steps
 * - Tracks step numbers for context
 * - Launches Guide + Overlay windows with visual highlights
 */
export class GuideNextStepTool extends BaseTool {
  name = "show_step_by_step_guide";

  description = `
    Provide iterative, just-in-time visual guidance for completing a task.

    IMPORTANT - ITERATIVE MODEL:
    - Generate ONLY ONE STEP at a time based on current screenshot
    - Do NOT plan ahead or generate complete workflows
    - Wait for user to complete step before generating next one

    Use this tool when:
    - User asks "how do I..." or "show me how to..." (initial step)
    - User signals continuation: "Done", "Next", "Okay" (subsequent steps)
    - A screenshot is available showing current UI state

    Requirements:
    - Screenshot MUST be provided
    - Use Gemini Vision to analyze current screen
    - Generate single actionable step with precise UI element coordinates

    DO NOT use this for:
    - General questions or information requests (use respond_with_text)
    - Documentation lookups (use search_knowledge_base)
    - Tasks without UI interaction
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
        description: "The original user question for context (optional for continuation steps)",
      },
      stepNumber: {
        type: "number",
        description: "Current step number for iterative workflow (default: 1)",
      },
      previousStep: {
        type: "string",
        description: "Description of the previous step completed (for context in multi-step flows)",
      },
    },
    required: ["task"],
  };

  /**
   * Execute guide lookup/generation
   *
   * @param args - Task description, optional user question, step tracking
   * @param context - User context and optional screenshot
   * @returns Tool result with guide data and window trigger
   */
  async execute(
    args: { task: string; userQuestion?: string; stepNumber?: number; previousStep?: string },
    context: ToolContext
  ): Promise<ToolResult> {
    // Validate arguments
    this.validate(args);

    const { task, userQuestion, stepNumber = 1, previousStep } = args;
    const screenshot = context.screenshot;

    console.log(`[GuideNextStepTool] Generating step ${stepNumber} for task: "${task}"`);
    console.log("[GuideNextStepTool] Request details:", {
      task,
      userQuestion: userQuestion?.substring(0, 100),
      stepNumber,
      previousStep: previousStep?.substring(0, 50),
      hasScreenshot: !!screenshot,
    });

    try {
      // Screenshot is REQUIRED for iterative workflow
      if (!screenshot) {
        console.log("[GuideNextStepTool] No screenshot provided - cannot generate iterative step");

        return {
          messageType: "text",
          content:
            "I need to see your current screen to provide step-by-step guidance. Please make sure screenshot capture is enabled and try again.",
          streamable: true,
        };
      }

      // Analyze screenshot with Gemini Vision
      console.log(
        `[GuideNextStepTool] Screenshot detected - generating step ${stepNumber} using Gemini Vision`
      );

      const visionResult = await geminiVisionService.analyzeScreenshot(screenshot, task);

      console.log("[GuideNextStepTool] Vision analysis complete:", {
        applicationContext: visionResult.applicationContext,
        elementsFound: visionResult.elements.length,
        screenDescription: visionResult.screenDescription.substring(0, 100),
      });

      // If we found interactive elements, use vision-based guidance
      if (visionResult.elements.length > 0) {
        // Find the most relevant element for the current step
        const targetElement = geminiVisionService.findRelevantElement(visionResult.elements, task);

        if (targetElement) {
          console.log("[GuideNextStepTool] Found target element:", {
            label: targetElement.label,
            type: targetElement.type,
            confidence: targetElement.confidence,
          });

          // Generate single-step guidance based on vision analysis
          const stepInstruction = `Click "${targetElement.label}"`;

          // Build context-aware response
          let responseText = "";
          if (stepNumber === 1) {
            // First step
            responseText = `I can see you're on ${visionResult.applicationContext}. ${visionResult.screenDescription}

To ${task}, ${stepInstruction.toLowerCase()}.`;
          } else {
            // Continuation step
            responseText = `Great! ${previousStep ? `You completed: "${previousStep}". ` : ""}

Now, ${stepInstruction.toLowerCase()}.`;
          }

          return {
            messageType: "workflow",
            content: responseText,
            cardData: {
              stepNumber,
              instruction: stepInstruction,
              targetElement: {
                label: targetElement.label,
                boundingBox: targetElement.boundingBox,
              },
              highlightColor: "blue",
              arrowPosition: "top-right",
            },
            streamable: true,
            triggerWindow: {
              window: "guide",
              data: {
                guide: {
                  id: `vision-${Date.now()}`,
                  title: task,
                  description: visionResult.screenDescription,
                  steps: [
                    {
                      id: `step-${stepNumber}`,
                      stepNumber,
                      instruction: stepInstruction,
                      targetElement: {
                        label: targetElement.label,
                        boundingBox: targetElement.boundingBox,
                      },
                      completed: false,
                    },
                  ],
                  currentStep: stepNumber - 1,
                  completed: false,
                },
              },
            },
          };
        }
      }

      // No clear target element - describe what we see and ask for clarification
      console.log(
        "[GuideNextStepTool] No clear target element found - providing screen context instead"
      );

      return {
        messageType: "text",
        content: `I can see you're on ${visionResult.applicationContext}. ${visionResult.screenDescription}

I'm not sure which specific element to guide you to next for "${task}". Could you describe what you're trying to do, or let me search the knowledge base for documentation?`,
        streamable: true,
      };
    } catch (error) {
      console.error("[GuideNextStepTool] Error finding guide:", error);

      return {
        messageType: "text",
        content:
          "I encountered an error while looking for a guide. Let me search the knowledge base or connect you with an expert instead.",
        streamable: true,
      };
    }
  }
}
