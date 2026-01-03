import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { z } from "zod";
import { toGeminiSchema } from "../utils/gemini-schema.js";
import { InterpretationOptionSchema, VisualGuidanceSchema, StepSchema } from "@mitable/shared";
import { logger } from "../lib/logger.js";
import type {
  SolutionObject,
  Step,
  VisualGuidance,
  InterpretationOption,
  WindowScreenshot,
} from "@mitable/shared";
import type { Message as DbMessage } from "../db/schema/conversations.schema.js";

const InterpretResponseSchema = z.object({
  interpretations: z.array(InterpretationOptionSchema),
});

const EvaluateProgressResponseSchema = z.object({
  needsAdjustment: z.boolean(),
  adjustedStepList: z.array(StepSchema).optional(),
  adjustmentReason: z.string().optional(),
});

const ScreenshotFilterResultSchema = z.object({
  relevantScreenshots: z.array(
    z.object({
      imageName: z.string(),
      inclusionReason: z.string(),
    })
  ),
});

type ScreenshotFilterResult = z.infer<typeof ScreenshotFilterResultSchema>;

/**
 * UI Element detected by Gemini Vision
 */
export interface UIElement {
  label: string; // Button text, field label, etc.
  type: string; // button, input, link, dropdown, etc.
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  interactable: boolean;
  confidence: number; // 0-1
}

/**
 * Gemini Vision analysis result (generic - all elements)
 */
export interface VisionAnalysisResult {
  elements: UIElement[];
  applicationContext: string; // e.g., "GitHub Pull Request Page", "Slack Workspace"
  screenDescription: string; // Natural language description of what's on screen
}

/**
 * Task-focused vision result (single recommended element + alternatives)
 */
export interface TaskFocusedVisionResult {
  applicationContext: string;
  taskUnderstanding: string; // What Gemini understood the user wants to do
  recommendedAction: {
    element: UIElement;
    reasoning: string; // Why this element was chosen
  };
  alternatives?: UIElement[]; // Backup options if primary isn't correct
}

/**
 * Multi-step guidance result (iterative workflow planning)
 */
export interface MultiStepGuidanceResult {
  applicationContext: string;
  taskUnderstanding: string;
  currentScreenAnalysis: string; // Description of what's currently visible
  steps: Array<{
    stepNumber: number;
    instruction: string;
    element?: UIElement; // Present if visible on current screen
    confidence: "high" | "medium" | "low"; // Confidence level for this step
    reasoning: string; // Why this step is needed
  }>;
  totalEstimatedSteps: number;
}

/**
 * Gemini Vision Service
 *
 * Uses Google's Gemini Vision API to analyze screenshots and detect UI elements.
 * Extracts bounding boxes, labels, and element types for visual guidance.
 */
class GeminiVisionService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private interpretModel: any;
  private stepGuidanceModel: any;
  private evaluateModel: any;
  private clarificationModel: any; // Phase 1: Clarify what to look for
  private screenshotFilterModel: any; // Phase 1a: Filter relevant screenshots

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);

    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    this.interpretModel = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(InterpretResponseSchema) as any,
      },
    });

    this.stepGuidanceModel = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(VisualGuidanceSchema) as any,
      },
    });

    this.evaluateModel = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(EvaluateProgressResponseSchema) as any,
      },
    });

    // Clarification model (Phase 1): Returns plain text description
    this.clarificationModel = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });

    this.screenshotFilterModel = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(ScreenshotFilterResultSchema) as any,
      },
    });
  }

  /**
   * PHASE 1: Clarify Target Element
   *
   * Takes a step description and returns a detailed visual description
   * of what UI element to look for. This improves detection accuracy by
   * being explicit about visual characteristics before analyzing the screenshot.
   *
   * @param stepDescription - Brief task description (e.g., "Click the Save button")
   * @returns Detailed visual description (e.g., "A blue rectangular button labeled 'Save' with a white floppy disk icon...")
   */
  async clarifyTargetElement(stepDescription: string): Promise<string> {
    const startTime = Date.now();
    logger.info({ stepDescription }, "[GeminiVision] Phase 1: Clarifying target element");

    const prompt = `You are helping identify the specific UI element a user needs to interact with.

TASK DESCRIPTION: "${stepDescription}"

Your job: Describe in detail what UI element the user should look for on their screen. Be specific about:
- Element type (button, input field, link, dropdown, icon, checkbox, toggle, etc.)
- Visual appearance (color, shape, size, icons, text labels, styling)
- Location hints (top-right, left sidebar, toolbar, header, footer, navigation bar, etc.)
- Distinctive features that make it recognizable
- Text content or labels if applicable
- Any surrounding context that helps identify it

EXAMPLES:

Task: "Click the Save button"
Output: "A blue rectangular button labeled 'Save' with a white floppy disk icon, typically located in the top toolbar area, approximately 80-100px wide with rounded corners"

Task: "Enter your email address"
Output: "A text input field with placeholder text 'Email' or 'Enter your email', usually appearing with a light gray border (1px) and white background, commonly found in forms or login screens, approximately 250-400px wide"

Task: "Open the settings menu"
Output: "A gear/cog icon button, typically gray or dark colored, about 20-30px in size, usually located in the top-right corner of the application or in a navigation sidebar"

Task: "Select a date from the calendar"
Output: "A date picker dropdown or calendar icon, often showing a small calendar grid icon, typically appearing next to date input fields, clicking it reveals a calendar popup interface"

Now describe what to look for based on: "${stepDescription}"

Return ONLY the detailed description, no JSON, no extra formatting, no preamble.`;

    try {
      const result = await this.clarificationModel.generateContent(prompt);
      const clarifiedDescription = result.response.text().trim();

      const elapsedMs = Date.now() - startTime;

      logger.debug(
        { clarifiedDescription, elapsedMs },
        "[GeminiVision] Clarification complete"
      );

      return clarifiedDescription;
    } catch (error) {
      logger.error({ err: error }, "[GeminiVision] Clarification failed");
      logger.warn("[GeminiVision] Using fallback - original step description");
      return stepDescription;
    }
  }

  async filterRelevantScreenshots(
    screenshots: WindowScreenshot[],
    currentStep: Step,
    solutionObject: SolutionObject
  ): Promise<ScreenshotFilterResult> {
    logger.info(
      { screenshotCount: screenshots.length },
      "[GeminiVision] Filtering relevant screenshots"
    );

    if (!screenshots.length) {
      logger.debug("[GeminiVision] No screenshots supplied to filter");
      return { relevantScreenshots: [] };
    }

    try {
      const prompt = `You are helping a coworker complete a workflow step.

CURRENT STEP:
Step ${currentStep.stepNumber}: "${currentStep.description}"

OVERALL TASK:
${solutionObject.solution}

FULL STEP LIST:
${solutionObject.stepList.map((s) => `${s.stepNumber}. ${s.description} [${s.status}]`).join("\n")}

You will be given ${screenshots.length} screenshots from their desktop. Some may show the app they need, others may not.

For EACH screenshot, decide if it will actually help them complete THIS step. Return JSON:
{
  "relevantScreenshots": [
    { "imageName": "screenshot_0", "inclusionReason": "Why this screenshot helps" }
  ]
}

Rules:
1. Include a screenshot only if its content is required to complete the current step.
2. If multiple windows together are needed (e.g., copy from email, paste into settings), include both with reasons.
3. If none of the screenshots help, return an empty array.
4. Reason should be specific: e.g., "Shows Slack with #product-team channel where user must post update".
`;

      const contentParts: any[] = [prompt];

      screenshots.forEach((screenshot, index) => {
        const base64Data = screenshot.dataUrl.replace(/^data:image\/\w+;base64,/, "");
        contentParts.push({
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        });
        contentParts.push(`screenshot_${index}: ${screenshot.appName} - ${screenshot.windowTitle}`);
      });

      const result = await this.screenshotFilterModel.generateContent(contentParts);
      const parsed = ScreenshotFilterResultSchema.parse(JSON.parse(result.response.text()));

      logger.info(
        {
          relevantCount: parsed.relevantScreenshots.length,
          screenshots: parsed.relevantScreenshots.map((e) => ({
            name: e.imageName,
            reason: e.inclusionReason,
          })),
        },
        "[GeminiVision] Relevant screenshots identified"
      );

      return parsed;
    } catch (error) {
      logger.error({ err: error }, "[GeminiVision] Screenshot filtering failed");
      // Fallback to including all screenshots so user still gets guidance
      return {
        relevantScreenshots: screenshots.map((_, index) => ({
          imageName: `screenshot_${index}`,
          inclusionReason: "Filtering failed - include by default",
        })),
      };
    }
  }

  /**
   * Analyze a screenshot to detect UI elements
   *
   * @param screenshotData - Base64-encoded screenshot (with data URL prefix)
   * @param task - Optional task description
   * @param mode - Analysis mode: "single-step" (default) or "multi-step"
   * @param completedSteps - Previously completed steps (for refinement)
   * @param remainingPlan - Previous step plan to refine
   * @returns Vision analysis result based on mode
   */
  async analyzeScreenshot(
    screenshotData: string,
    task?: string,
    mode: "single-step" | "multi-step" = "single-step",
    completedSteps?: string[],
    remainingPlan?: any[]
  ): Promise<VisionAnalysisResult | TaskFocusedVisionResult | MultiStepGuidanceResult> {
    logger.info(
      { hasTask: !!task, mode, dataLength: screenshotData.length },
      "[GeminiVision] Starting screenshot analysis"
    );

    try {
      // Remove data URL prefix if present
      const base64Data = screenshotData.replace(/^data:image\/\w+;base64,/, "");

      // Construct prompt based on mode
      let prompt: string;

      if (!task) {
        // Generic analysis - no task provided
        prompt = `Analyze this screenshot and identify ALL interactive UI elements.

Return a JSON object with:
- applicationContext: What application/page is this?
- screenDescription: Brief description of the screen
- elements: Array of detected UI elements with label, type, boundingBox {x, y, width, height}, interactable, and confidence

Return ONLY raw JSON, no markdown formatting.`;
      } else if (mode === "multi-step") {
        // Multi-step planning mode
        const isInitialRequest = !completedSteps || completedSteps.length === 0;

        if (isInitialRequest) {
          // Initial request - generate full step plan
          prompt = `You are helping a user complete this task: "${task}"

OBJECTIVE: Generate a step-by-step plan showing the FULL workflow to complete this task.

Analyze the current screenshot and:
1. Identify the CURRENT step (element visible NOW that should be clicked/interacted with)
2. Predict the NEXT 2-4 steps that will likely follow
3. For the current step, provide exact UI element with bounding box coordinates
4. For future steps, describe what to expect (predictions)

Return ONLY raw JSON (no markdown):
{
  "applicationContext": "Application name and current page",
  "taskUnderstanding": "What the user is trying to accomplish",
  "currentScreenAnalysis": "Description of what's currently visible on screen",
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "Click 'Send confirmation code'",
      "element": {
        "label": "Element label",
        "type": "button",
        "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 40 },
        "interactable": true,
        "confidence": 0.95
      },
      "confidence": "high",
      "reasoning": "Button is visible on current screen"
    },
    {
      "stepNumber": 2,
      "instruction": "Enter email address in dialog",
      "confidence": "medium",
      "reasoning": "Predicted - dialog will likely appear after step 1"
    }
  ],
  "totalEstimatedSteps": 4
}`;
        } else {
          // Continuation request - refine existing plan
          prompt = `You are helping a user complete this task: "${task}"

PROGRESS UPDATE:
- Completed steps: ${JSON.stringify(completedSteps)}
- Previous plan was: ${JSON.stringify(remainingPlan)}

OBJECTIVE: Update the step plan based on the NEW screenshot.

Analyze what ACTUALLY happened vs what we predicted:
1. What's now visible that we didn't predict?
2. Are the remaining steps still valid or do they need adjustment?
3. What is the NEXT step the user should take right now?

Return updated plan starting from the NEXT step (provide exact UI element for current step, predictions for future):
{
  "applicationContext": "Application name and current page",
  "taskUnderstanding": "What the user is accomplishing",
  "currentScreenAnalysis": "What changed since last step",
  "steps": [
    {
      "stepNumber": ${(completedSteps?.length || 0) + 1},
      "instruction": "Next action to take",
      "element": { /* if visible */ },
      "confidence": "high|medium|low",
      "reasoning": "Why this step is needed"
    }
  ],
  "totalEstimatedSteps": number
}`;
        }
      } else {
        // Single-step mode (task-focused)
        prompt = `You are helping a user complete this task: "${task}"

OBJECTIVE: Find the SINGLE MOST RELEVANT UI element the user should interact with to complete this task.

Analyze the screenshot considering:
- Visual hierarchy (button size, position, color, prominence)
- Button/link labels that match the task
- Contextual placement (notification banners, toolbars, main content area)
- Semantic meaning (what would a user naturally click?)

Return ONLY raw JSON (no markdown code blocks):
{
  "applicationContext": "Application name and current page/section",
  "taskUnderstanding": "Brief interpretation of what the user is trying to do",
  "recommendedAction": {
    "element": {
      "label": "Element label or descriptive text",
      "type": "button|input|link|dropdown|checkbox",
      "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 40 },
      "interactable": true,
      "confidence": 0.95
    },
    "reasoning": "One sentence explaining why this is the correct element"
  },
  "alternatives": []
}`;
      }

      // Call Gemini Vision API
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        },
      ]);

      const response = result.response;
      const text = response.text();

      logger.debug({ preview: text.substring(0, 200) }, "[GeminiVision] Raw response");

      // Parse JSON response
      // Gemini sometimes wraps JSON in markdown code blocks
      const jsonMatch = text.match(/```json?\s*([\s\S]*?)\s*```/) || text.match(/({[\s\S]*})/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;

      const parsed = JSON.parse(jsonText);

      // Determine result type based on fields present
      if (parsed.steps && Array.isArray(parsed.steps)) {
        // Multi-step guidance result
        const result: MultiStepGuidanceResult = parsed;

        logger.info(
          {
            applicationContext: result.applicationContext,
            taskUnderstanding: result.taskUnderstanding,
            totalSteps: result.steps.length,
            estimatedTotal: result.totalEstimatedSteps,
            stepPlan: result.steps.map((s) => ({
              stepNumber: s.stepNumber,
              instruction: s.instruction,
              hasElement: !!s.element,
              confidence: s.confidence,
            })),
          },
          "[GeminiVision] Multi-step analysis complete"
        );

        return result;
      } else if (parsed.recommendedAction) {
        // Task-focused result (single step)
        const result: TaskFocusedVisionResult = parsed;

        logger.info(
          {
            applicationContext: result.applicationContext,
            taskUnderstanding: result.taskUnderstanding,
            recommendedElement: {
              label: result.recommendedAction.element.label,
              type: result.recommendedAction.element.type,
              bbox: result.recommendedAction.element.boundingBox,
              confidence: result.recommendedAction.element.confidence,
            },
            reasoning: result.recommendedAction.reasoning,
            hasAlternatives: !!result.alternatives?.length,
          },
          "[GeminiVision] Task-focused analysis complete"
        );

        return result;
      } else {
        // Generic result with all elements
        const result: VisionAnalysisResult = parsed;

        logger.info(
          {
            applicationContext: result.applicationContext,
            elementCount: result.elements.length,
            screenDescription: result.screenDescription?.substring(0, 100),
            elements: result.elements.map((e) => ({
              label: e.label,
              type: e.type,
              bbox: e.boundingBox,
              confidence: e.confidence,
            })),
          },
          "[GeminiVision] Generic analysis complete"
        );

        return result;
      }
    } catch (error) {
      logger.error({ err: error }, "[GeminiVision] Analysis failed");

      // Return empty result on error
      return {
        elements: [],
        applicationContext: "Unknown",
        screenDescription: "Failed to analyze screenshot",
      };
    }
  }

  async interpretVaguePrompt(
    screenshots: WindowScreenshot[],
    vaguePrompt: string
  ): Promise<{ interpretations: InterpretationOption[] }> {
    logger.info({ vaguePrompt }, "[GeminiVision] Interpreting vague prompt");

    try {
      if (!screenshots.length) {
        return {
          interpretations: [
            {
              task: "No screenshot available to analyze",
              confidence: "low",
              reasoning: "User did not share their screen",
            },
          ],
        };
      }

      const base64Data = screenshots[0].dataUrl.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `The user said: "${vaguePrompt}"

This is vague. Based on their current screen, what specific tasks might they be asking about?

Provide 3-5 most likely interpretations with confidence levels and reasoning.`;

      const result = await this.interpretModel.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        },
      ]);

      const text = result.response.text();
      const parsed = InterpretResponseSchema.parse(JSON.parse(text));

      logger.info(
        { interpretationCount: parsed.interpretations.length },
        "[GeminiVision] Interpretations generated"
      );
      return parsed;
    } catch (error) {
      logger.error({ err: error }, "[GeminiVision] Interpretation failed");
      return {
        interpretations: [
          {
            task: "Complete the task visible on your screen",
            confidence: "low",
            reasoning: "Unable to analyze screenshot",
          },
        ],
      };
    }
  }

  async analyzeStepExecution(
    screenshots: WindowScreenshot[],
    solutionObject: SolutionObject,
    currentStep: Step,
    conversationHistory: DbMessage[]
  ): Promise<VisualGuidance> {
    const phaseStartTime = Date.now();
    logger.info(
      {
        stepNumber: currentStep.stepNumber,
        stepDescription: currentStep.description,
        screenshotCount: screenshots.length,
      },
      "[GeminiVision] PHASE 2: Conversational guidance"
    );

    if (!screenshots.length) {
      return {
        elementDescription: "No screenshots provided",
        visualContext: "Unable to view the user's workspace.",
        confidence: "low",
        conversationalMessage:
          "I don’t have any screenshots to reference yet. Capture the windows you’re using and I’ll guide you through this step.",
      };
    }

    try {
      const clarifiedDescription = await this.clarifyTargetElement(currentStep.description);
      const filterResult = await this.filterRelevantScreenshots(
        screenshots,
        currentStep,
        solutionObject
      );

      if (!filterResult.relevantScreenshots.length) {
        return {
          elementDescription: "Required application not visible",
          visualContext: "None of the captured windows match the app needed for this step.",
          confidence: "low",
          conversationalMessage: `I can’t see the application needed for step ${currentStep.stepNumber}. Open the app where you "${currentStep.description}" and capture it again so I can walk you through it.`,
        };
      }

      const relevantEntries = filterResult.relevantScreenshots
        .map((entry) => {
          const index = Number.parseInt(entry.imageName.replace("screenshot_", ""), 10);
          const screenshot = screenshots[index];
          if (!screenshot) {
            return undefined;
          }
          return {
            screenshot,
            inclusionReason: entry.inclusionReason,
            originalIndex: index,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            screenshot: WindowScreenshot;
            inclusionReason: string;
            originalIndex: number;
          } => !!entry
        );

      if (!relevantEntries.length) {
        relevantEntries.push(
          ...screenshots.map((screenshot, index) => ({
            screenshot,
            inclusionReason: "Fallback include (filter returned invalid indexes)",
            originalIndex: index,
          }))
        );
      }

      const prompt = `You are a patient senior engineer on a Zoom call, guiding a teammate through step ${
        currentStep.stepNumber
      }: "${currentStep.description}".

You will see only the screenshots that matter, each followed by the reason it's included. Explain what to click or manipulate in a conversational tone.

Return JSON exactly matching:
{
  "elementDescription": "What needs to be interacted with",
  "visualContext": "What you observed in the screenshots",
  "confidence": "high|medium|low",
  "alternativeElements": ["Optional fallbacks"],
  "conversationalMessage": "Friendly instructions describing the sequence of actions"
}

Guidelines:
- Reference screenshots naturally (e.g., "In the Slack window...", "Back in Chrome...").
- If multiple windows matter, describe the order of actions across them.
- If something is missing, explicitly say what the user should open or capture next.
- Sound like you're narrating in real time to a teammate.`;

      const contentParts: any[] = [
        prompt,
        `Clarified UI element to look for: ${clarifiedDescription}`,
        `Solution summary: ${solutionObject.solution}`,
        `Step list:\n${solutionObject.stepList
          .map((s) => `${s.stepNumber}. ${s.description} [${s.status}]`)
          .join("\n")}`,
        `Recent conversation snippets:\n${conversationHistory
          .slice(-5)
          .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
          .join("\n")}`,
      ];

      relevantEntries.forEach((entry, idx) => {
        const base64Data = entry.screenshot.dataUrl.replace(/^data:image\/\w+;base64,/, "");
        contentParts.push({
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        });
        contentParts.push(
          `Screenshot ${idx} (captured window ${entry.originalIndex}): ${entry.screenshot.appName} - ${entry.screenshot.windowTitle}. Why it matters: ${entry.inclusionReason}`
        );
      });

      const result = await this.stepGuidanceModel.generateContent(contentParts);
      const parsed = VisualGuidanceSchema.parse(JSON.parse(result.response.text()));

      const totalTimeMs = Date.now() - phaseStartTime;
      logger.info(
        { confidence: parsed.confidence, totalTimeMs },
        "[GeminiVision] Conversational guidance complete"
      );

      if (!parsed.conversationalMessage || parsed.conversationalMessage.trim().length < 10) {
        parsed.conversationalMessage = `Let's focus on step ${currentStep.stepNumber}: ${currentStep.description}. Follow the instructions I outlined for the captured windows.`;
      }

      return parsed;
    } catch (error) {
      logger.error({ err: error }, "[GeminiVision] Step analysis failed");
      return {
        elementDescription: `Look for elements related to: ${currentStep.description}`,
        visualContext: "Unable to analyze screenshots",
        confidence: "low",
        conversationalMessage: `I'm having trouble analyzing the screenshots right now. For this step (${currentStep.description}), look for UI elements that match the workflow instructions and let me know if you'd like me to try again.`,
      };
    }
  }

  async evaluateProgress(
    screenshots: WindowScreenshot[],
    solutionObject: SolutionObject,
    conversationHistory: DbMessage[],
    nextStepIndex: number
  ): Promise<{
    needsAdjustment: boolean;
    adjustedStepList?: Step[];
    adjustmentReason?: string;
  }> {
    logger.info({ nextStep: nextStepIndex + 1 }, "[GeminiVision] Evaluating progress");

    try {
      if (!screenshots.length) {
        logger.warn("[GeminiVision] evaluateProgress called without screenshots");
        return { needsAdjustment: false };
      }

      const base64Data = screenshots[0].dataUrl.replace(/^data:image\/\w+;base64,/, "");

      const currentPlan = solutionObject.stepList
        .map((s) => `${s.stepNumber}. ${s.description} [${s.status}]`)
        .join("\n");

      const conversationContext = conversationHistory
        .slice(-5)
        .map((msg) => `${msg.role}: ${msg.content.substring(0, 150)}`)
        .join("\n");

      const prompt = `Task: "${solutionObject.solution}"

Current Plan:
${currentPlan}

User was on step ${solutionObject.currentStepIndex + 1}, advancing to step ${nextStepIndex + 1}.

Recent Conversation:
${conversationContext}

Analyze screenshot to determine if plan needs adjustment. Consider:
- Did user skip steps?
- Did new complexity appear?
- Are remaining steps still valid?
- Has the user expressed confusion or encountered repeated issues?`;

      const result = await this.evaluateModel.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        },
      ]);

      const text = result.response.text();
      const parsed = EvaluateProgressResponseSchema.parse(JSON.parse(text));

      logger.info(
        { needsAdjustment: parsed.needsAdjustment },
        "[GeminiVision] Progress evaluation complete"
      );
      return parsed;
    } catch (error) {
      logger.error({ err: error }, "[GeminiVision] Evaluation failed");
      return { needsAdjustment: false };
    }
  }
}

// Export singleton instance
export const geminiVisionService = new GeminiVisionService();
