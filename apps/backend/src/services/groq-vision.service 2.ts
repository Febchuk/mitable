/**
 * Groq Vision Service
 *
 * Provides vision analysis capabilities using Groq's Llama models.
 * Optimized for the Progression Detector use case with two-image comparison.
 *
 * Models:
 * - llama-3.2-90b-vision-preview: Best quality, supports multi-image
 * - llama-3.2-11b-vision-preview: Faster, good for simple tasks
 *
 * Note: Groq vision uses the same chat completions API with image content parts.
 */

import Groq from "groq-sdk";
import { config } from "../config";
import { withRetry } from "../utils/retry";

// Configuration
const VISION_CONFIG = {
  DEFAULT_MODEL: "llama-3.2-90b-vision-preview", // Best for multi-image comparison
  FAST_MODEL: "llama-3.2-11b-vision-preview", // Faster alternative
  MAX_TOKENS: 1024,
  TEMPERATURE: 0.2, // Lower for more deterministic outputs
  RETRY_ATTEMPTS: 3,
};

// Types
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

class GroqVisionService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Analyze one or more images with a prompt
   */
  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const startTime = Date.now();
    const model = request.model || VISION_CONFIG.DEFAULT_MODEL;

    // Build content parts with images
    const contentParts: Groq.Chat.ChatCompletionContentPart[] = [];

    // Add images first
    for (const image of request.images) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType || "image/png"};base64,${image.data}`,
        },
      });
    }

    // Add the user prompt as text
    contentParts.push({
      type: "text",
      text: request.userPrompt,
    });

    const response = await withRetry(
      async () => {
        return await this.groq.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content: request.systemPrompt,
            },
            {
              role: "user",
              content: contentParts,
            },
          ],
          max_tokens: request.maxTokens || VISION_CONFIG.MAX_TOKENS,
          temperature: request.temperature ?? VISION_CONFIG.TEMPERATURE,
        });
      },
      "GroqVision.analyze",
      { maxRetries: VISION_CONFIG.RETRY_ATTEMPTS }
    );

    const latencyMs = Date.now() - startTime;

    return {
      content: response.choices[0]?.message?.content || "",
      model,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
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
    return !!config.groq.apiKey;
  }

  /**
   * Get available vision models
   */
  getAvailableModels(): string[] {
    return [VISION_CONFIG.DEFAULT_MODEL, VISION_CONFIG.FAST_MODEL];
  }
}

// Export singleton instance
export const groqVisionService = new GroqVisionService();
