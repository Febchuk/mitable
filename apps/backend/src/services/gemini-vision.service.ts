import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";

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
 * Gemini Vision analysis result
 */
export interface VisionAnalysisResult {
  elements: UIElement[];
  applicationContext: string; // e.g., "GitHub Pull Request Page", "Slack Workspace"
  screenDescription: string; // Natural language description of what's on screen
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

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    // Use Gemini 2.0 Flash for vision tasks
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
  }

  /**
   * Analyze a screenshot to detect UI elements
   *
   * @param screenshotData - Base64-encoded screenshot (with data URL prefix)
   * @param task - Optional task description for context
   * @returns Detected UI elements with bounding boxes
   */
  async analyzeScreenshot(
    screenshotData: string,
    task?: string
  ): Promise<VisionAnalysisResult> {
    console.log("[GeminiVision] Starting screenshot analysis", {
      hasTask: !!task,
      dataLength: screenshotData.length,
    });

    try {
      // Remove data URL prefix if present
      const base64Data = screenshotData.replace(/^data:image\/\w+;base64,/, "");

      // Construct prompt for UI element detection
      const prompt = task
        ? `You are analyzing a screenshot to help a user complete the following task: "${task}"

Analyze this screenshot and identify ALL interactive UI elements (buttons, links, input fields, dropdowns, etc.).

For each element, provide:
1. A descriptive label (the text on the button/field, or a description if no text)
2. The element type (button, input, link, dropdown, checkbox, etc.)
3. The bounding box coordinates (x, y, width, height) in pixels from top-left
4. Whether it's interactable (true/false)
5. Your confidence level (0-1)

Also provide:
- Application context (what app/page is this?)
- A brief description of what's on screen

Return your analysis in this EXACT JSON format (no markdown, just raw JSON):
{
  "applicationContext": "Application name and page",
  "screenDescription": "Brief description of the screen",
  "elements": [
    {
      "label": "Element label or description",
      "type": "button|input|link|dropdown|checkbox|etc",
      "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 40 },
      "interactable": true,
      "confidence": 0.95
    }
  ]
}`
        : `Analyze this screenshot and identify ALL interactive UI elements.

Return a JSON object with:
- applicationContext: What application/page is this?
- screenDescription: Brief description of the screen
- elements: Array of detected UI elements with label, type, boundingBox {x, y, width, height}, interactable, and confidence

Return ONLY raw JSON, no markdown formatting.`;

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

      const analysis: VisionAnalysisResult = JSON.parse(jsonText);

      console.log("[GeminiVision] Analysis complete:", {
        applicationContext: analysis.applicationContext,
        elementCount: analysis.elements.length,
        screenDescription: analysis.screenDescription.substring(0, 100),
      });

      return analysis;
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

  /**
   * Find the best UI element for a given task/instruction
   *
   * @param elements - Detected UI elements
   * @param instruction - What the user wants to do (e.g., "Click the New PR button")
   * @returns The most relevant element, or null
   */
  findRelevantElement(elements: UIElement[], instruction: string): UIElement | null {
    if (elements.length === 0) return null;

    const instructionLower = instruction.toLowerCase();

    // Simple keyword matching (can be improved with embeddings)
    const scored = elements.map((element) => {
      const labelLower = element.label.toLowerCase();
      let score = 0;

      // Exact label match
      if (instructionLower.includes(labelLower)) {
        score += 10;
      }

      // Partial word match
      const instructionWords = instructionLower.split(/\s+/);
      const labelWords = labelLower.split(/\s+/);
      const matchingWords = instructionWords.filter((word) => labelWords.includes(word));
      score += matchingWords.length * 2;

      // Boost interactable elements
      if (element.interactable) {
        score += 5;
      }

      // Confidence boost
      score += element.confidence * 3;

      return { element, score };
    });

    // Sort by score and return top match
    scored.sort((a, b) => b.score - a.score);

    return scored[0].score > 0 ? scored[0].element : elements[0];
  }
}

// Export singleton instance
export const geminiVisionService = new GeminiVisionService();
