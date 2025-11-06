import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { z } from "zod";
import { toGeminiSchema } from "../utils/gemini-schema.js";
import { InterpretationOptionSchema, VisualGuidanceSchema, StepSchema } from "@mitable/shared";
import type { SolutionObject, Step, VisualGuidance, InterpretationOption } from "@mitable/shared";
import type { Message as DbMessage } from "../db/schema/conversations.schema.js";
import { coordinateConverter, type ImageDimensions } from "./coordinate-converter.service.js";
import { renderDebugScreenshot } from "../utils/bounding-box-renderer.js";

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
   * @param imageDimensions - Screenshot dimensions in pixels (for coordinate conversion)
   * @returns Vision analysis result based on mode
   */
  async analyzeScreenshot(
    screenshotData: string,
    task?: string,
    mode: "single-step" | "multi-step" = "single-step",
    completedSteps?: string[],
    remainingPlan?: any[],
    imageDimensions?: ImageDimensions
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

CRITICAL COORDINATE FORMAT REQUIREMENT:
Return bounding box coordinates as NORMALIZED values (0.0 to 1.0 range):
- x: horizontal position as percentage (0.0 = left edge, 1.0 = right edge)
- y: vertical position as percentage (0.0 = top edge, 1.0 = bottom edge)
- width: width as percentage (0.1 = 10% of image width)
- height: height as percentage (0.05 = 5% of image height)

Example: {"x": 0.45, "y": 0.12, "width": 0.15, "height": 0.04} means:
- Element starts at 45% from left, 12% from top
- Element is 15% of image width, 4% of image height

DO NOT return pixel coordinates. Always use 0.0-1.0 normalized range.

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

CRITICAL COORDINATE FORMAT REQUIREMENT:
Return bounding box coordinates as NORMALIZED values (0.0 to 1.0 range):
- x: 0.0 = left edge, 1.0 = right edge
- y: 0.0 = top edge, 1.0 = bottom edge
- width/height: as fraction of total dimensions

Example: {"x": 0.5, "y": 0.3, "width": 0.1, "height": 0.04} means element at 50% from left, 30% from top, 10% width, 4% height.

DO NOT return pixel coordinates. Always use 0.0-1.0 normalized range.

Analyze the current screenshot and:
1. Identify the CURRENT step (element visible NOW that should be clicked/interacted with)
2. Predict the NEXT 2-4 steps that will likely follow
3. For the current step, provide exact UI element with bounding box coordinates (NORMALIZED 0-1 range)
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
        "boundingBox": { "x": 0.45, "y": 0.12, "width": 0.15, "height": 0.04 },
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

CRITICAL COORDINATE FORMAT REQUIREMENT:
Return bounding box coordinates as NORMALIZED values (0.0 to 1.0 range):
- x: 0.0 = left edge, 1.0 = right edge
- y: 0.0 = top edge, 1.0 = bottom edge
Example: {"x": 0.5, "y": 0.3, "width": 0.1, "height": 0.04}

DO NOT return pixel coordinates. Always use 0.0-1.0 normalized range.

OBJECTIVE: Update the step plan based on the NEW screenshot.

Analyze what ACTUALLY happened vs what we predicted:
1. What's now visible that we didn't predict?
2. Are the remaining steps still valid or do they need adjustment?
3. What is the NEXT step the user should take right now?

Return updated plan starting from the NEXT step (provide exact UI element for current step with NORMALIZED coordinates, predictions for future):
{
  "applicationContext": "Application name and current page",
  "taskUnderstanding": "What the user is accomplishing",
  "currentScreenAnalysis": "What changed since last step",
  "steps": [
    {
      "stepNumber": ${(completedSteps?.length || 0) + 1},
      "instruction": "Next action to take",
      "element": { "boundingBox": { "x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0 } },
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

CRITICAL COORDINATE FORMAT REQUIREMENT:
Return bounding box coordinates as NORMALIZED values (0.0 to 1.0 range):
- x: horizontal position as percentage (0.0 = left edge, 1.0 = right edge)
- y: vertical position as percentage (0.0 = top edge, 1.0 = bottom edge)
- width: width as percentage of image (0.1 = 10% of width)
- height: height as percentage of image (0.05 = 5% of height)

Example: {"x": 0.45, "y": 0.12, "width": 0.15, "height": 0.04} means:
- Element starts at 45% from left, 12% from top
- Element is 15% of image width, 4% of image height

DO NOT return pixel coordinates. Always use 0.0-1.0 normalized range.

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
      "boundingBox": { "x": 0.45, "y": 0.12, "width": 0.15, "height": 0.04 },
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

      // Convert normalized coordinates to pixels if dimensions provided
      if (imageDimensions) {
        console.log("[GeminiVision] Converting coordinates to pixels using dimensions:", imageDimensions);

        // Convert single-step task-focused result
        if (parsed.recommendedAction?.element?.boundingBox) {
          parsed.recommendedAction.element.boundingBox = coordinateConverter.convertToPixels(
            parsed.recommendedAction.element.boundingBox,
            imageDimensions
          );
        }

        // Convert alternatives if present
        if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
          parsed.alternatives = parsed.alternatives.map((alt: any) => ({
            ...alt,
            boundingBox: alt.boundingBox
              ? coordinateConverter.convertToPixels(alt.boundingBox, imageDimensions)
              : alt.boundingBox,
          }));
        }

        // Convert generic analysis elements
        if (parsed.elements && Array.isArray(parsed.elements)) {
          parsed.elements = parsed.elements.map((el: any) => ({
            ...el,
            boundingBox: el.boundingBox
              ? coordinateConverter.convertToPixels(el.boundingBox, imageDimensions)
              : el.boundingBox,
          }));
        }

        // Convert multi-step guidance steps
        if (parsed.steps && Array.isArray(parsed.steps)) {
          parsed.steps = parsed.steps.map((step: any) => ({
            ...step,
            element: step.element && step.element.boundingBox
              ? {
                  ...step.element,
                  boundingBox: coordinateConverter.convertToPixels(
                    step.element.boundingBox,
                    imageDimensions
                  ),
                }
              : step.element,
          }));
        }
      } else {
        console.warn("[GeminiVision] No image dimensions provided - coordinates will remain in Gemini's format");
      }

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
    screenshotMetadata?: { width: number; height: number }
  ): Promise<VisualGuidance> {
    console.log("[GeminiVision] Analyzing step execution:", currentStep.stepNumber, {
      hasMetadata: !!screenshotMetadata,
      dimensions: screenshotMetadata ? `${screenshotMetadata.width}x${screenshotMetadata.height}` : "N/A",
    });

    try {
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL: VISUAL DETECTION CONSTRAINT 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ONLY DETECT ELEMENTS THAT ARE ACTUALLY VISIBLE IN THE SCREENSHOT.

DO NOT hallucinate or assume elements exist based on:
- The step description
- Workflow context
- General knowledge about applications
- What "should" be there

Your analysis must be based SOLELY on what you can SEE in the image.

If the element mentioned in the step is NOT visible:
1. Set confidence: "low"
2. DO NOT include targetElement (set it to null/undefined)
3. Explain in conversationalMessage what the user needs to do first (e.g., "open the app", "navigate to the page", "scroll to show the menu")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STEP (your focus):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step ${currentStep.stepNumber}: "${currentStep.description}"

Your job: Look at the screenshot and tell the user EXACTLY which UI element to click/interact with to complete this action - BUT ONLY if that element is VISIBLE in the screenshot.

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
3. Identify the specific button, link, or UI element that accomplishes this step - ONLY if it's visible
4. If the required app/page is not visible, tell the user to open/navigate to it first
5. NEVER suggest clicking unrelated elements just because they're visible
6. NEVER return bounding boxes for elements you cannot see in the screenshot
7. Ignore any chat/agent windows in the screenshot (those are AI assistant interfaces)
8. DO NOT reference future steps - focus only on the current step

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

5. targetElement (OPTIONAL - include ONLY if element is visible on current screen):
   - label: Brief description of the element (e.g., "Save button", "Settings icon")
   - boundingBox: Coordinates in NORMALIZED format (0.0-1.0 range):
     * x: horizontal position (0.0 = left edge, 1.0 = right edge)
     * y: vertical position (0.0 = top edge, 1.0 = bottom edge)
     * width: element width as fraction (0.1 = 10% of screen width)
     * height: element height as fraction (0.05 = 5% of screen height)

   CRITICAL: Bounding box MUST be normalized 0-1 range, NOT pixel coordinates!
   Example: {"label": "Submit button", "boundingBox": {"x": 0.85, "y": 0.12, "width": 0.08, "height": 0.04}}

   DO NOT include targetElement if:
   - Element is not visible on current screen
   - Wrong app/page is open
   - Confidence is "low"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Example 1:
Step: "Navigate to the Mitable PRD document in Notion"
Screenshot shows: Slack is open
✅ GOOD conversationalMessage: "I can see Slack is open. Let's switch to Notion - you can open it from your dock or use Cmd+Space to search for the Notion app."
✅ GOOD: confidence="low", targetElement=null
❌ BAD: "Click on the DM with Aurel in the left sidebar" (Wrong - this doesn't help open Notion!)

Example 2:
Step: "Click the Save button"
Screenshot shows: Document editor with visible Save button in top-right
✅ GOOD conversationalMessage: "Perfect! Click the blue 'Save' button in the top-right corner, next to the Share button."
✅ GOOD: confidence="high", targetElement with bounding box
❌ BAD: "You're in the right place, keep working on the document" (Wrong - doesn't identify the Save button!)

Example 3:
Step: "Scroll to the Product Vision section"
Screenshot shows: Notion document with Product Vision visible below the fold
✅ GOOD conversationalMessage: "I can see you're in the right document. Scroll down about halfway - the 'Product Vision & Strategy' heading is visible in the middle of the page."
❌ BAD: "Click on the settings icon" (Wrong - step is about scrolling, not clicking settings!)

Example 4 - HALLUCINATION PREVENTION:
Step: "Click on the 'File' menu at the top of the screen"
Screenshot shows: Safari browser with NO visible menu bar (it's hidden or in full-screen mode)
✅ GOOD: confidence="low", targetElement=null, conversationalMessage: "I can see Safari is open, but the menu bar isn't visible in the screenshot. The app might be in full-screen mode. Try pressing Fn+Control+F2 to access the menu bar, or move your mouse to the very top of the screen to reveal it."
❌ BAD: Returns bounding box with coordinates for File menu (THIS IS HALLUCINATION - menu is NOT visible in the screenshot!)`;

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

      // Convert normalized coordinates to pixels if bounding box present and metadata available
      if (parsed.targetElement?.boundingBox && screenshotMetadata) {
        console.log("[GeminiVision] Converting normalized coordinates to pixels:", {
          normalized: parsed.targetElement.boundingBox,
          imageDimensions: screenshotMetadata,
        });

        parsed.targetElement.boundingBox = coordinateConverter.convertToPixels(
          parsed.targetElement.boundingBox,
          screenshotMetadata
        );

        console.log("[GeminiVision] Converted to pixel coordinates:", parsed.targetElement.boundingBox);
      } else if (parsed.targetElement?.boundingBox && !screenshotMetadata) {
        console.warn("[GeminiVision] Bounding box present but no screenshot metadata - cannot convert coordinates");
      }

      // VALIDATION: Reject low-confidence detections with bounding boxes (likely hallucinations)
      if (parsed.targetElement?.boundingBox && parsed.confidence === "low") {
        console.warn("[GeminiVision] ⚠️  HALLUCINATION DETECTED: Removing bounding box from low-confidence detection", {
          element: parsed.targetElement.label,
          confidence: parsed.confidence,
          stepDescription: currentStep.description,
          boundingBox: parsed.targetElement.boundingBox,
        });
        parsed.targetElement = undefined; // Remove to prevent hallucinated overlays
      }

      // DEBUG: Save screenshot with bounding box visualization if enabled
      if (process.env.DEBUG_SAVE_SCREENSHOTS === 'true' && parsed.targetElement?.boundingBox && screenshotMetadata) {
        try {
          const debugPath = await renderDebugScreenshot({
            screenshot,
            boundingBox: parsed.targetElement.boundingBox,
            label: parsed.targetElement.label,
            confidence: parsed.confidence,
            stepDescription: currentStep.description,
            metadata: {
              width: screenshotMetadata.width,
              height: screenshotMetadata.height,
              stepNumber: currentStep.stepNumber,
            },
          });
          console.log("[GeminiVision] 🖼️  Debug screenshot saved:", debugPath);
        } catch (debugError) {
          console.error("[GeminiVision] Failed to save debug screenshot:", debugError);
          // Don't throw - debug screenshots are optional
        }
      }

      // Comprehensive logging for debugging
      console.log("[GeminiVision] Visual guidance generated:", {
        elementDescription: parsed.elementDescription?.substring(0, 100) + "...",
        visualContext: parsed.visualContext?.substring(0, 100) + "...",
        conversationalMessage: parsed.conversationalMessage,
        conversationalMessageLength: parsed.conversationalMessage?.length || 0,
        confidence: parsed.confidence,
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
- Has the user expressed confusion or encountered repeated issues?

CRITICAL GUIDELINES FOR PLAN ADJUSTMENT:
1. Be CONSERVATIVE - prefer keeping extra steps over reducing step count
2. ONLY reduce step count if remaining steps are clearly unnecessary or already completed
3. NEVER reduce step count if it would leave fewer than 2 steps remaining after current step
4. If uncertain, keep the original plan (needsAdjustment: false)
5. Better to have one extra step than to complete workflow prematurely

Example scenarios:
- User on step 2 of 4, screen shows steps 3-4 completed → Reduce to 2 steps (valid)
- User on step 2 of 4, screen unclear if steps 3-4 needed → Keep 4 steps (safer)
- User on step 3 of 4, one step remaining → Keep 4 steps (don't reduce to 3)

Remember: The user should always get visual guidance for the NEXT step. Premature completion is worse than having an extra step.`;

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

      console.log("[GeminiVision] Evaluation complete:", {
        needsAdjustment: parsed.needsAdjustment,
        adjustmentReason: parsed.adjustmentReason || "N/A",
        originalStepCount: solutionObject.stepList.length,
        adjustedStepCount: parsed.adjustedStepList?.length || solutionObject.stepList.length,
        nextStepIndex: nextStepIndex,
        wouldCauseCompletion: parsed.adjustedStepList && nextStepIndex >= parsed.adjustedStepList.length,
      });

      // Additional warning if adjustment would cause immediate completion
      if (parsed.needsAdjustment && parsed.adjustedStepList && nextStepIndex >= parsed.adjustedStepList.length) {
        console.warn("[GeminiVision] WARNING: Gemini's plan adjustment would cause immediate workflow completion!", {
          reason: parsed.adjustmentReason,
          originalSteps: solutionObject.stepList.length,
          adjustedSteps: parsed.adjustedStepList.length,
          nextStepIndex,
          advice: "Consider tuning the evaluation prompt to be more conservative",
        });
      }

      return parsed;
    } catch (error) {
      console.error("[GeminiVision] Evaluation failed:", error);
      return { needsAdjustment: false };
    }
  }
}

// Export singleton instance
export const geminiVisionService = new GeminiVisionService();
