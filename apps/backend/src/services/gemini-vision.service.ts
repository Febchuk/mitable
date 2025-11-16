import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { z } from "zod";
import { toGeminiSchema } from "../utils/gemini-schema.js";
import { InterpretationOptionSchema, VisualGuidanceSchema, StepSchema } from "@mitable/shared";
import type { SolutionObject, Step, VisualGuidance, InterpretationOption } from "@mitable/shared";
import type { Message as DbMessage } from "../db/schema/conversations.schema.js";
import { coordinateConverterService } from "./coordinate-converter.service.js";

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
  private clarificationModel: any; // Phase 1: Clarify what to look for

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
    console.log("[GeminiVision] Phase 1: Clarifying target element");
    console.log("[GeminiVision] Step description:", stepDescription);

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

      console.log("[GeminiVision] Clarified element description:", clarifiedDescription);
      console.log("[GeminiVision] Clarification took:", elapsedMs, "ms");

      return clarifiedDescription;
    } catch (error) {
      console.error("[GeminiVision] Clarification failed:", error);
      // Fallback: return original step description
      console.warn("[GeminiVision] Using fallback - original step description");
      return stepDescription;
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
    conversationHistory: DbMessage[],
    imageDimensions?: { width: number; height: number }
  ): Promise<VisualGuidance> {
    const phaseStartTime = Date.now();
    console.log("[GeminiVision] ========================================");
    console.log("[GeminiVision] PHASE 2: Analyzing step execution");
    console.log("[GeminiVision] Step:", currentStep.stepNumber, "-", currentStep.description);
    console.log("[GeminiVision] ========================================");

    try {
      // PHASE 1: Clarify what to look for
      const clarifiedDescription = await this.clarifyTargetElement(currentStep.description);
      console.log("[GeminiVision] Using clarified description for detection");

      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `You are helping a user find a SPECIFIC UI element on their screen.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET ELEMENT TO FIND:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"${clarifiedDescription}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT - What the user is trying to do:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step ${currentStep.stepNumber}: "${currentStep.description}"

CRITICAL: You're looking for: "${clarifiedDescription}"
NOT just anything related to: "${currentStep.description}"

Your job: Look at the screenshot and locate the UI element described above with precise bounding box coordinates.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HELPING A USER COMPLETE THIS SPECIFIC ACTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STEP (your focus):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step ${currentStep.stepNumber}: "${currentStep.description}"

Your job: Look at the screenshot and tell the user EXACTLY which UI element to click/interact with to complete this action.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPLETE WORKFLOW CONTEXT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overall Task: ${solutionObject.solution}

Explanation: ${solutionObject.solutionExplanation}

Search Query Used: ${solutionObject.searchQuery}

Supporting Data Explanation: ${solutionObject.supportingDataExplanation}

Complete Step List:
${solutionObject.stepList.map((s) => `${s.stepNumber}. ${s.description} [${s.status}]`).join("\n")}

Company Documentation (from knowledge base search):
${solutionObject.supportingData.map((d) => `[${d.title}]\n${d.snippet}\nSource: ${d.url}`).join("\n\n")}

Recent Conversation History:
${conversationHistory
  .slice(-5)
  .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
  .join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Your recommendation must help complete the current step: "${currentStep.description}"
2. Use the supporting data and step list context to understand the workflow
3. Identify the specific button, link, or UI element that accomplishes this step
4. If the required app/page is not visible, tell the user to open/navigate to it first
5. NEVER suggest clicking unrelated elements just because they're visible
6. Ignore any chat/agent windows in the screenshot (those are AI assistant interfaces)
7. DO NOT reference future steps - focus only on the current step

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. elementDescription: The exact UI element that helps complete "${currentStep.description}"
   - If visible: Describe its precise location (e.g., "Blue 'Save' button in top-right corner")
   - If NOT visible: Explain what needs to be opened first (e.g., "Notion app needs to be opened")

2. visualContext: Current state of the screen and relevance to the step

3. confidence:
   - "high" = Correct app/page is visible AND target element is clearly identified
   - "medium" = Correct context but element location uncertain
   - "low" = Wrong app/page is currently visible

4. conversationalMessage: Natural guidance in 1-2 sentences telling user what to click
   - Be specific about the UI element's location
   - Use conversational tone like a helpful teammate
   - If wrong app is open, guide them to the correct one

5. element (ALWAYS REQUIRED): Information about the target UI element
   - label: Short descriptive label for the element (e.g., "Save Button")
   - type: Element type (button, input, link, dropdown, checkbox, text)
   - boundingBox: Normalized coordinates (0.0-1.0 range) OR null if not visible

     CRITICAL BOUNDING BOX RULES:
     * NEVER highlight entire application windows - only specific interactive elements
     * Application-level bounding boxes (covering >50% of screen) are NOT helpful
     * If the step asks to "open an app" but the app is already open:
       - Set boundingBox to null
       - Set confidence to "high"
       - conversationalMessage should say "The app is already open! You're ready for the next step."

     * If element IS visible: Provide normalized coordinates for the SPECIFIC UI element
       - x: horizontal position as fraction (0.0 = left edge, 1.0 = right edge)
       - y: vertical position as fraction (0.0 = top edge, 1.0 = bottom edge)
       - width: width as fraction of image width (typically 0.05-0.25 for buttons)
       - height: height as fraction of image height (typically 0.02-0.10 for buttons)

     * Sanity check - Most interactive elements are SMALL:
       - Buttons/Links: width 5-25%, height 2-10%
       - Input fields: width 10-40%, height 2-5%
       - Icons: width 2-8%, height 2-8%
       - Dropdowns: width 10-30%, height 2-5%
       - If your bounding box is >50% width OR >30% height, it's probably wrong!

     * If element NOT visible: Set boundingBox to null
   - confidence: Detection confidence (0.0-1.0)

   CRITICAL: ALWAYS include the "element" field. Set boundingBox to null ONLY if:
   - Wrong app is open
   - Element requires scrolling to be visible
   - Element is off-screen or obscured
   - The step asks to "open/launch" an app that is already open

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example 1:
Step: "Navigate to the Mitable PRD document in Notion"
Screenshot shows: Slack is open
✅ GOOD conversationalMessage: "I can see Slack is open. Let's switch to Notion - you can open it from your dock or use Cmd+Space to search for the Notion app."
❌ BAD: "Click on the DM with Aurel in the left sidebar" (Wrong - this doesn't help open Notion!)

Example 2:
Step: "Click the Save button"
Screenshot shows: Document editor with visible Save button in top-right
✅ GOOD response:
{
  "elementDescription": "Blue 'Save' button in top-right corner of the document editor, next to the Share button",
  "visualContext": "Document editor is open with the Save button clearly visible",
  "confidence": "high",
  "conversationalMessage": "Perfect! Click the blue 'Save' button in the top-right corner, next to the Share button.",
  "element": {
    "label": "Save Button",
    "type": "button",
    "boundingBox": { "x": 0.85, "y": 0.05, "width": 0.08, "height": 0.04 },
    "confidence": 0.95
  }
}
❌ BAD: No bounding box provided even though element is visible!

Example 3:
Step: "Scroll to the Product Vision section"
Screenshot shows: Notion document with Product Vision section off-screen, need to scroll
✅ GOOD response:
{
  "elementDescription": "Product Vision section heading that needs scrolling to reach",
  "visualContext": "Notion document is open showing the top sections, Product Vision is below the fold",
  "confidence": "medium",
  "conversationalMessage": "I can see you're in the right document. Scroll down about halfway to find the 'Product Vision & Strategy' section.",
  "element": {
    "label": "Product Vision Section",
    "type": "text",
    "boundingBox": null,
    "confidence": 0.7
  }
}
Note: boundingBox is null because element requires scrolling to be visible
❌ BAD: Omitting the "element" field entirely (element field is ALWAYS required!)`;

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

      // Add clarified description to response (from Phase 1)
      parsed.clarifiedDescription = clarifiedDescription;

      // Convert normalized coordinates (0.0-1.0) to pixel coordinates
      if (imageDimensions && parsed.element?.boundingBox) {
        const normalized = { ...parsed.element.boundingBox };
        parsed.element.boundingBox = coordinateConverterService.convertToPixels(
          parsed.element.boundingBox,
          imageDimensions
        );

        console.log("[GeminiVision] Converted bounding box coordinates:", {
          normalized,
          pixels: parsed.element.boundingBox,
          imageDimensions,
        });

        // Filter out application-type elements (they represent entire windows, not specific UI elements)
        if (parsed.element.type === "application") {
          console.log(
            "[GeminiVision] Element type is 'application' - setting boundingBox to null (application windows should not have bounding boxes)"
          );
          parsed.element.boundingBox = null;
        }

        // Validate bounding box size (catch oversized boxes from Gemini)
        // Only validate if boundingBox is still present (not nullified above)
        if (parsed.element.boundingBox) {
          const bbox = parsed.element.boundingBox;
          const widthPercent = (bbox.width / imageDimensions.width) * 100;
          const heightPercent = (bbox.height / imageDimensions.height) * 100;

          // Warn if bounding box is suspiciously large (>50% width or >50% height)
          if (widthPercent > 50 || heightPercent > 50) {
            console.warn("[GeminiVision] WARNING: Bounding box is very large!", {
              widthPercent: widthPercent.toFixed(1) + "%",
              heightPercent: heightPercent.toFixed(1) + "%",
              elementType: parsed.element.type,
              elementLabel: parsed.element.label,
              normalizedWidth: normalized.width.toFixed(3),
              normalizedHeight: normalized.height.toFixed(3),
            });

            // If it's marked as "application" type and covers >30% of screen, set to null
            if (
              parsed.element.type === "application" &&
              (widthPercent > 30 || heightPercent > 30)
            ) {
              console.warn(
                "[GeminiVision] Nullifying application-level bounding box (too large to be useful)"
              );
              parsed.element.boundingBox = null;
            }
            // For other element types, warn but don't auto-nullify (let it through for debugging)
            else {
              console.warn(
                "[GeminiVision] Large bounding box detected but not auto-nullified. Review Gemini prompt effectiveness."
              );
            }
          }
        } // End of bounding box validation
      }

      // Comprehensive logging for debugging
      const totalTimeMs = Date.now() - phaseStartTime;
      console.log("[GeminiVision] ========================================");
      console.log("[GeminiVision] Detection complete:");
      console.log("[GeminiVision] ========================================");
      console.log("[GeminiVision] Original step:", currentStep.description);
      console.log("[GeminiVision] Clarified (what we looked for):", clarifiedDescription);
      console.log("[GeminiVision] Found element:", {
        type: parsed.element?.type,
        label: parsed.element?.label,
        confidence: parsed.element?.confidence,
        hasBoundingBox: !!parsed.element?.boundingBox,
        boundingBox: parsed.element?.boundingBox,
      });
      console.log("[GeminiVision] Overall confidence:", parsed.confidence);
      console.log("[GeminiVision] Total processing time:", totalTimeMs, "ms");
      console.log("[GeminiVision] ========================================");

      // Detailed response logging
      console.log("[GeminiVision] Visual guidance generated:", {
        elementDescription: parsed.elementDescription?.substring(0, 100) + "...",
        visualContext: parsed.visualContext?.substring(0, 100) + "...",
        conversationalMessage: parsed.conversationalMessage,
        conversationalMessageLength: parsed.conversationalMessage?.length || 0,
        confidence: parsed.confidence,
        clarifiedDescription: parsed.clarifiedDescription?.substring(0, 100) + "...",
        hasElement: !!parsed.element,
        hasBoundingBox: !!parsed.element?.boundingBox,
        boundingBox: parsed.element?.boundingBox,
        elementLabel: parsed.element?.label,
        elementType: parsed.element?.type,
        elementConfidence: parsed.element?.confidence,
      });

      // Validate conversationalMessage quality
      if (!parsed.conversationalMessage || parsed.conversationalMessage.trim().length < 10) {
        console.warn("[GeminiVision] WARNING: conversationalMessage is too short or missing!", {
          conversationalMessage: parsed.conversationalMessage,
          length: parsed.conversationalMessage?.length || 0,
          stepDescription: currentStep.description,
        });

        // Generate fallback message using step description
        const fallbackMessage = `Let's work on step ${currentStep.stepNumber}: ${currentStep.description}. ${parsed.elementDescription || "I'll guide you through this step."}`;
        console.log("[GeminiVision] Using fallback message:", fallbackMessage);
        parsed.conversationalMessage = fallbackMessage;
      }

      console.log("[GeminiVision] Guidance confidence:", parsed.confidence);
      return parsed;
    } catch (error) {
      console.error("[GeminiVision] Step analysis failed:", error);
      return {
        elementDescription: `Look for elements related to: ${currentStep.description}`,
        visualContext: "Unable to analyze screenshot",
        confidence: "low",
        conversationalMessage: `I'm having trouble analyzing your screenshot right now. For this step (${currentStep.description}), look for any UI elements that would help you accomplish this. Let me know if you need help!`,
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
