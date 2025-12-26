/**
 * Gemini Vision Frame Service
 *
 * Provides vision analysis capabilities using Google's Gemini 2.0 Flash for frame comparison.
 * Optimized for the Progression Detector use case with two-image comparison.
 *
 * Key differences from Groq Vision:
 * - Uses Gemini 2.0 Flash (superior accuracy and instruction following)
 * - Better at detecting subtle UI changes
 * - More reliable JSON parsing
 *
 * Interface compatible with GroqVisionService for easy swapping.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { withRetry } from "../utils/retry";

// Configuration
const VISION_CONFIG = {
  DEFAULT_MODEL: "gemini-2.0-flash-exp", // Latest Gemini Flash model
  MAX_TOKENS: 1024,
  TEMPERATURE: 0.2, // Lower for more deterministic outputs
  RETRY_ATTEMPTS: 3,
};

// Types (matching Groq Vision interface)
export interface VisionAnalysisRequest {
  images: Array<{
    data: string; // Base64 encoded image data
    mimeType?: string; // Default: image/png
  }>;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface VisionAnalysisResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

class GeminiVisionFrameService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: VISION_CONFIG.DEFAULT_MODEL,
    });
  }

  /**
   * Analyze one or more images with a prompt
   */
  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const startTime = Date.now();
    const model = request.model || VISION_CONFIG.DEFAULT_MODEL;

    // Build parts for Gemini API
    const parts: any[] = [];

    // Add images first
    for (const image of request.images) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType || "image/png",
          data: image.data,
        },
      });
    }

    // Add the combined prompt (Gemini doesn't have separate system/user roles for vision)
    const combinedPrompt = `${request.systemPrompt}\n\n${request.userPrompt}`;
    parts.push({ text: combinedPrompt });

    const response = await withRetry(
      async () => {
        return await this.model.generateContent({
          contents: [{ role: "user", parts }],
          generationConfig: {
            maxOutputTokens: request.maxTokens || VISION_CONFIG.MAX_TOKENS,
            temperature: request.temperature ?? VISION_CONFIG.TEMPERATURE,
          },
        });
      },
      "GeminiVisionFrame.analyze",
      { maxRetries: VISION_CONFIG.RETRY_ATTEMPTS }
    );

    const latencyMs = Date.now() - startTime;

    // Extract response text
    const result = response.response;
    const content = result.text() || "";

    // Gemini's usage metrics
    const usageMetadata = result.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const completionTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokens = usageMetadata.totalTokenCount || promptTokens + completionTokens;

    return {
      content,
      model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      latencyMs,
    };
  }

  /**
   * Compare two frames for progression detection
   * Optimized for the Progression Detector prompt
   */
  async compareFrames(
    previousFrame: string | null,
    currentFrame: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<VisionAnalysisResult> {
    const images: VisionAnalysisRequest["images"] = [];

    // Add previous frame if available
    if (previousFrame) {
      images.push({
        data: this.stripDataUrl(previousFrame),
        mimeType: "image/png",
      });
    }

    // Add current frame
    images.push({
      data: this.stripDataUrl(currentFrame),
      mimeType: "image/png",
    });

    // Adjust the user prompt based on whether we have a previous frame
    const adjustedUserPrompt = previousFrame
      ? `${userPrompt}\n\nThe first image is the previous screenshot, and the second image is the current screenshot.`
      : `${userPrompt}\n\nThis is the first screenshot of the session - there is no previous frame to compare.`;

    return this.analyze({
      images,
      systemPrompt,
      userPrompt: adjustedUserPrompt,
    });
  }

  /**
   * Strip data URL prefix if present
   */
  private stripDataUrl(data: string): string {
    if (data.startsWith("data:")) {
      const base64Index = data.indexOf("base64,");
      if (base64Index !== -1) {
        return data.substring(base64Index + 7);
      }
    }
    return data;
  }

  /**
   * Check if the service is available (API key configured)
   */
  isAvailable(): boolean {
    return !!config.gemini.apiKey;
  }

  /**
   * Get available vision models
   */
  getAvailableModels(): string[] {
    return [VISION_CONFIG.DEFAULT_MODEL];
  }
}

// Export singleton instance
export const geminiVisionFrameService = new GeminiVisionFrameService();

