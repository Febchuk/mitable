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

      // Extract previous guide data from conversation history for continuation
      const lastWorkflowMessage = context.conversationHistory
        .filter((m) => m.role === "assistant" && m.messageType === "workflow")
        .pop();

      let completedSteps: string[] = [];
      let remainingPlan: any[] = [];

      if (lastWorkflowMessage?.cardData && (lastWorkflowMessage.cardData as any).allSteps) {
        const cardData = lastWorkflowMessage.cardData as any;
        const allSteps = cardData.allSteps;

        console.log("[GuideNextStepTool] Found previous workflow:", {
          totalSteps: allSteps.length,
          currentStepNumber: cardData.stepNumber,
        });

        // Find completed steps (those before current step)
        completedSteps = allSteps
          .filter((s: any) => s.completed || s.stepNumber < stepNumber)
          .map((s: any) => s.instruction);

        // Remaining plan (current + future steps)
        remainingPlan = allSteps.filter((s: any) => s.stepNumber >= stepNumber);

        console.log("[GuideNextStepTool] Continuation context:", {
          completedSteps,
          remainingPlanLength: remainingPlan.length,
        });
      }

      // Analyze screenshot with Gemini Vision (multi-step mode)
      console.log(
        `[GuideNextStepTool] Screenshot detected - generating multi-step plan using Gemini Vision`
      );

      const visionResult = await geminiVisionService.analyzeScreenshot(
        screenshot,
        task,
        "multi-step", // Use multi-step planning mode
        completedSteps,
        remainingPlan
      );

      // Type guard to determine which result type we got
      let targetElement = null;
      let applicationContext = "";
      let screenDescription = "";
      let allSteps: any[] = [];

      if ("steps" in visionResult && Array.isArray(visionResult.steps)) {
        // Multi-step guidance result
        applicationContext = visionResult.applicationContext;
        screenDescription = visionResult.taskUnderstanding;
        allSteps = visionResult.steps;

        // Get the current step (first step with an element)
        const currentStep = allSteps.find((s) => s.element) || allSteps[0];
        if (currentStep) {
          targetElement = currentStep.element || null;

          console.log("[GuideNextStepTool] Multi-step plan generated:", {
            applicationContext: visionResult.applicationContext,
            taskUnderstanding: visionResult.taskUnderstanding,
            totalSteps: allSteps.length,
            currentStepNumber: currentStep.stepNumber,
            currentInstruction: currentStep.instruction,
            hasTargetElement: !!targetElement,
          });

          console.log(
            "[GuideNextStepTool] Full step plan:",
            allSteps.map((s) => ({
              stepNumber: s.stepNumber,
              instruction: s.instruction,
              hasElement: !!s.element,
              confidence: s.confidence,
            }))
          );
        }
      } else if ("recommendedAction" in visionResult) {
        // Task-focused result with recommended element
        targetElement = visionResult.recommendedAction.element;
        applicationContext = visionResult.applicationContext;
        screenDescription = visionResult.taskUnderstanding;

        console.log("[GuideNextStepTool] Task-focused vision analysis complete:", {
          applicationContext: visionResult.applicationContext,
          taskUnderstanding: visionResult.taskUnderstanding,
          recommendedElement: targetElement.label,
          reasoning: visionResult.recommendedAction.reasoning,
          hasAlternatives: !!visionResult.alternatives?.length,
        });

        console.log("[GuideNextStepTool] Gemini recommended element:", {
          label: targetElement.label,
          type: targetElement.type,
          confidence: targetElement.confidence,
          boundingBox: targetElement.boundingBox,
          reasoning: visionResult.recommendedAction.reasoning,
        });
      } else if ("screenDescription" in visionResult && "elements" in visionResult) {
        // Generic result with all elements (fallback)
        applicationContext = visionResult.applicationContext;
        screenDescription = visionResult.screenDescription;

        console.log("[GuideNextStepTool] Generic vision analysis (fallback):", {
          applicationContext: visionResult.applicationContext,
          elementsFound: visionResult.elements.length,
          screenDescription: visionResult.screenDescription.substring(0, 100),
        });

        // Use first element as fallback
        targetElement = visionResult.elements[0] || null;

        if (targetElement) {
          console.log("[GuideNextStepTool] Using first element as fallback:", {
            label: targetElement.label,
            type: targetElement.type,
            confidence: targetElement.confidence,
          });
        }
      }

      // If we found a target element, generate guidance
      if (targetElement) {
        // Generate guidance based on whether we have a multi-step plan
        const currentStepData = allSteps.length > 0 ? allSteps.find((s) => s.element) || allSteps[0] : null;
        const stepInstruction = currentStepData
          ? currentStepData.instruction
          : `Click "${targetElement.label}"`;

        // Build context-aware response
        let responseText = "";
        if (allSteps.length > 0) {
          // Multi-step plan response
          responseText = `I can see you're on ${applicationContext}. ${screenDescription}

Here's your ${allSteps.length}-step plan to ${task}:

${allSteps
  .map((s, idx) => `${idx + 1}. ${s.instruction}${s.confidence !== "high" ? ` (${s.confidence} confidence)` : ""}`)
  .join("\n")}

Let's start with step 1: ${stepInstruction.toLowerCase()}`;
        } else if (stepNumber === 1) {
          // Single step, first time
          responseText = `I can see you're on ${applicationContext}. ${screenDescription}

To ${task}, ${stepInstruction.toLowerCase()}.`;
        } else {
          // Continuation step
          responseText = `Great! ${previousStep ? `You completed: "${previousStep}". ` : ""}

Now, ${stepInstruction.toLowerCase()}.`;
        }

        // Scale coordinates by scaleFactor to match physical display resolution
        // Gemini analyzes resized image (e.g., 1920x1080), but overlay renders on full resolution (e.g., 3840x2160)
        const scaleFactor = context.screenshotMetadata?.scaleFactor || 1;
        const scaledBoundingBox = {
          x: targetElement.boundingBox.x * scaleFactor,
          y: targetElement.boundingBox.y * scaleFactor,
          width: targetElement.boundingBox.width * scaleFactor,
          height: targetElement.boundingBox.height * scaleFactor,
        };

        console.log("[GuideNextStepTool] Generated step:", {
          stepNumber,
          targetLabel: targetElement.label,
          coordinates: scaledBoundingBox,
          scaleFactor,
        });

        // Build steps array for Guide window
        // Mark steps before current step as completed
        const currentStepNumber = currentStepData?.stepNumber || stepNumber;
        const guideSteps =
          allSteps.length > 0
            ? allSteps.map((step) => ({
                id: `step-${step.stepNumber}`,
                stepNumber: step.stepNumber,
                instruction: step.instruction,
                targetElement: step.element
                  ? {
                      label: step.element.label,
                      boundingBox: {
                        x: step.element.boundingBox.x * scaleFactor,
                        y: step.element.boundingBox.y * scaleFactor,
                        width: step.element.boundingBox.width * scaleFactor,
                        height: step.element.boundingBox.height * scaleFactor,
                      },
                    }
                  : undefined,
                completed: step.stepNumber < currentStepNumber, // Mark previous steps as completed
                confidence: step.confidence,
              }))
            : [
                {
                  id: `step-${stepNumber}`,
                  stepNumber,
                  instruction: stepInstruction,
                  targetElement: {
                    label: targetElement.label,
                    boundingBox: scaledBoundingBox,
                  },
                  completed: false,
                },
              ];

        // Find index of current (first incomplete) step
        const currentStepIndex = guideSteps.findIndex((s) => !s.completed);

        return {
          messageType: "workflow",
          content: responseText,
          cardData: {
            stepNumber: currentStepData?.stepNumber || stepNumber,
            totalSteps: allSteps.length || 1,
            instruction: stepInstruction,
            targetElement: {
              label: targetElement.label,
              boundingBox: scaledBoundingBox,
            },
            allSteps: guideSteps,
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
                description: screenDescription,
                steps: guideSteps,
                currentStep: currentStepIndex !== -1 ? currentStepIndex : guideSteps.length - 1,
                totalSteps: guideSteps.length,
                completed: currentStepIndex === -1, // All steps completed if no incomplete step found
              },
            },
          },
        };
      }

      // No clear target element - describe what we see and ask for clarification
      console.log(
        "[GuideNextStepTool] No target element found - providing screen context instead"
      );

      return {
        messageType: "text",
        content: `I can see you're on ${applicationContext}. ${screenDescription}

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
