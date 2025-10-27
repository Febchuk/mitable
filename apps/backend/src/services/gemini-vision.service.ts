import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { z } from "zod";
import { toGeminiSchema } from "../utils/gemini-schema.js";
import {
  InterpretationOptionSchema,
  VisualGuidanceSchema,
  StepSchema,
} from "@mitable/shared";
import type { SolutionObject, Step, VisualGuidance, InterpretationOption } from "@mitable/shared";
import type { Message as DbMessage } from "../db/schema/conversations.schema.js";

const InterpretResponseSchema = z.object({
  interpretations: z.array(InterpretationOptionSchema),
});

const EvaluateProgressResponseSchema = z.object({
  needsAdjustment: z.boolean(),
  adjustedStepList: z.array(StepSchema).optional(),
  adjustmentReason: z.string().optional(),
});

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
    console.log("[GeminiVision] Starting screenshot analysis", {
      hasTask: !!task,
      dataLength: screenshotData.length,
    });

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

      console.log("[GeminiVision] Raw response:", text.substring(0, 200));

      // Parse JSON response
      // Gemini sometimes wraps JSON in markdown code blocks
      const jsonMatch = text.match(/```json?\s*([\s\S]*?)\s*```/) || text.match(/({[\s\S]*})/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;

      const parsed = JSON.parse(jsonText);

      // Determine result type based on fields present
      if (parsed.steps && Array.isArray(parsed.steps)) {
        // Multi-step guidance result
        const result: MultiStepGuidanceResult = parsed;

        console.log("[GeminiVision] Multi-step analysis complete:", {
          applicationContext: result.applicationContext,
          taskUnderstanding: result.taskUnderstanding,
          currentScreenAnalysis: result.currentScreenAnalysis?.substring(0, 100),
          totalSteps: result.steps.length,
          estimatedTotal: result.totalEstimatedSteps,
        });

        console.log(
          "[GeminiVision] Step plan:",
          result.steps.map((s) => ({
            stepNumber: s.stepNumber,
            instruction: s.instruction,
            hasElement: !!s.element,
            confidence: s.confidence,
          }))
        );

        return result;
      } else if (parsed.recommendedAction) {
        // Task-focused result (single step)
        const result: TaskFocusedVisionResult = parsed;

        console.log("[GeminiVision] Task-focused analysis complete:", {
          applicationContext: result.applicationContext,
          taskUnderstanding: result.taskUnderstanding,
          recommendedElement: result.recommendedAction.element.label,
          reasoning: result.recommendedAction.reasoning,
          hasAlternatives: !!result.alternatives?.length,
        });

        console.log("[GeminiVision] Recommended element:", {
          label: result.recommendedAction.element.label,
          type: result.recommendedAction.element.type,
          bbox: result.recommendedAction.element.boundingBox,
          confidence: result.recommendedAction.element.confidence,
        });

        return result;
      } else {
        // Generic result with all elements
        const result: VisionAnalysisResult = parsed;

        console.log("[GeminiVision] Generic analysis complete:", {
          applicationContext: result.applicationContext,
          elementCount: result.elements.length,
          screenDescription: result.screenDescription.substring(0, 100),
        });

        // Log detected elements with their bounding boxes
        console.log(
          "[GeminiVision] Detected elements with bounding boxes:",
          result.elements.map((e) => ({
            label: e.label,
            type: e.type,
            bbox: e.boundingBox,
            confidence: e.confidence,
          }))
        );

        return result;
      }
    } catch (error) {
      console.error("[GeminiVision] Analysis failed:", error);

      // Return empty result on error
      return {
        elements: [],
        applicationContext: "Unknown",
        screenDescription: "Failed to analyze screenshot",
      };
    }
  }

  async interpretVaguePrompt(
    screenshot: string,
    vaguePrompt: string
  ): Promise<{ interpretations: InterpretationOption[] }> {
    console.log("[GeminiVision] Interpreting vague prompt:", vaguePrompt);

    try {
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");

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

      console.log("[GeminiVision] Interpretations:", parsed.interpretations.length);
      return parsed;
    } catch (error) {
      console.error("[GeminiVision] Interpretation failed:", error);
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
    screenshot: string,
    solutionObject: SolutionObject,
    currentStep: Step,
    conversationHistory: DbMessage[]
  ): Promise<VisualGuidance> {
    console.log("[GeminiVision] Analyzing step execution:", currentStep.stepNumber);

    try {
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");

      const supportingContext = solutionObject.supportingData
        .slice(0, 5)
        .map((data) => `[${data.title}] ${data.snippet}`)
        .join("\n\n");

      const conversationContext = conversationHistory
        .slice(-5)
        .map((msg) => `${msg.role}: ${msg.content.substring(0, 150)}`)
        .join("\n");

      const prompt = `Task: "${solutionObject.solution}"
Current Step: ${currentStep.description}

Company Process Context:
${supportingContext}

${solutionObject.solutionExplanation}

Recent Conversation:
${conversationContext}

Analyze the screenshot and provide EXTREMELY PRECISE guidance:
1. Exact element name/label
2. Visual indicators (icons, colors)
3. Precise location (top-right, center, etc.)
4. Surrounding context
5. Consider any confusion or questions from the conversation history`;

      const result = await this.stepGuidanceModel.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/png",
            data: base64Data,
          },
        },
      ]);

      const text = result.response.text();
      const parsed = VisualGuidanceSchema.parse(JSON.parse(text));

      console.log("[GeminiVision] Guidance confidence:", parsed.confidence);
      return parsed;
    } catch (error) {
      console.error("[GeminiVision] Step analysis failed:", error);
      return {
        elementDescription: `Look for elements related to: ${currentStep.description}`,
        visualContext: "Unable to analyze screenshot",
        confidence: "low",
      };
    }
  }

  async evaluateProgress(
    screenshot: string,
    solutionObject: SolutionObject,
    conversationHistory: DbMessage[],
    nextStepIndex: number
  ): Promise<{
    needsAdjustment: boolean;
    adjustedStepList?: Step[];
    adjustmentReason?: string;
  }> {
    console.log("[GeminiVision] Evaluating progress to step:", nextStepIndex + 1);

    try {
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");

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

      console.log("[GeminiVision] Needs adjustment:", parsed.needsAdjustment);
      return parsed;
    } catch (error) {
      console.error("[GeminiVision] Evaluation failed:", error);
      return { needsAdjustment: false };
    }
  }

}

// Export singleton instance
export const geminiVisionService = new GeminiVisionService();
