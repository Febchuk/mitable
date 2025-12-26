/**
 * Frame Analysis Service
 *
 * Analyzes individual frames using the Progression Detector prompt.
 * Compares consecutive frames to detect meaningful user actions.
 *
 * Key features:
 * - Two-image comparison (before/after)
 * - Delta detection (distinguishes action from passive viewing)
 * - Integration with Groq Vision (Llama 4 Scout)
 */

import { geminiVisionFrameService } from "./gemini-vision-frame.service";
import {
  buildProgressionDetectorPrompt,
  parseProgressionResponse,
  ChangeType,
  ChangeMagnitude,
  GoalContext,
} from "../prompts/session-prompts";

// Types
export interface FrameAnalysisInput {
  sessionId: string;
  frameId: string;
  currentFrame: string; // Base64 image data
  previousFrame: string | null; // Base64 image data (null for first frame)
  windowInfo: {
    windowSourceId: string;
    appName: string;
    windowTitle: string;
  };
  timestamp: string;
  // Optional goal context for enhanced analysis
  goalContext?: GoalContext;
}

export interface FrameAnalysisResult {
  frameId: string;
  progressionDetected: boolean;
  summaryOfAction: string;

  // Observable delta detection (what visually changed, not how)
  deltaChanged: boolean;
  changeType: ChangeType;
  changeMagnitude: ChangeMagnitude;
  changeDescription: string;

  // Metadata
  confidence: number;
  analysisLatencyMs: number;
  model: string;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

class FrameAnalysisService {
  /**
   * Analyze a frame using the Progression Detector
   * @param input Frame analysis input including optional goal context
   */
  async analyzeFrame(input: FrameAnalysisInput): Promise<FrameAnalysisResult> {
    // Build prompt with goal context if available
    const { system: systemPrompt, user: userPrompt } = buildProgressionDetectorPrompt(
      input.goalContext
    );

    try {
      // Call Gemini Vision with two images
      const visionResult = await geminiVisionFrameService.compareFrames(
        input.previousFrame,
        input.currentFrame,
        systemPrompt,
        userPrompt
      );

      // Parse the structured response
      const progressionResult = parseProgressionResponse(visionResult.content);

      if (!progressionResult) {
        console.warn(`[FrameAnalysis] Failed to parse response for frame ${input.frameId}`);
        return this.createFallbackResult(input, visionResult);
      }

      // Map progression result - directly use LLM's observable classifications
      const isFirstFrame = input.previousFrame === null;
      const deltaChanged = isFirstFrame || progressionResult.progression_detected;

      return {
        frameId: input.frameId,
        progressionDetected: progressionResult.progression_detected,
        summaryOfAction: progressionResult.summary_of_action,
        deltaChanged,
        changeType: isFirstFrame ? "none" : progressionResult.change_type,
        changeMagnitude: isFirstFrame ? "trivial" : progressionResult.change_magnitude,
        changeDescription: isFirstFrame
          ? "First frame in session"
          : progressionResult.summary_of_action,
        confidence: progressionResult.confidence,
        analysisLatencyMs: visionResult.latencyMs,
        model: visionResult.model,
        tokenUsage: {
          prompt: visionResult.usage.promptTokens,
          completion: visionResult.usage.completionTokens,
          total: visionResult.usage.totalTokens,
        },
      };
    } catch (error) {
      console.error(`[FrameAnalysis] Error analyzing frame ${input.frameId}:`, error);
      throw error;
    }
  }

  /**
   * Batch analyze multiple frames
   * Note: Processes sequentially to maintain frame order for delta comparison
   */
  async analyzeFrameBatch(frames: FrameAnalysisInput[]): Promise<FrameAnalysisResult[]> {
    const results: FrameAnalysisResult[] = [];

    for (const frame of frames) {
      const result = await this.analyzeFrame(frame);
      results.push(result);
    }

    return results;
  }

  /**
   * Create fallback result when parsing fails
   */
  private createFallbackResult(
    input: FrameAnalysisInput,
    visionResult: { latencyMs: number; model: string; usage: any }
  ): FrameAnalysisResult {
    const isFirstFrame = input.previousFrame === null;

    return {
      frameId: input.frameId,
      progressionDetected: isFirstFrame, // First frame is always considered progression
      summaryOfAction: isFirstFrame ? "Session started" : "Unable to determine activity",
      deltaChanged: isFirstFrame,
      changeType: "none",
      changeMagnitude: "trivial",
      changeDescription: isFirstFrame ? "First frame in session" : "Analysis inconclusive",
      confidence: 0.5,
      analysisLatencyMs: visionResult.latencyMs,
      model: visionResult.model,
      tokenUsage: {
        prompt: visionResult.usage.promptTokens,
        completion: visionResult.usage.completionTokens,
        total: visionResult.usage.totalTokens,
      },
    };
  }

  /**
   * Check if the service is available
   */
  isAvailable(): boolean {
    return geminiVisionFrameService.isAvailable();
  }
}

// Export singleton instance
export const frameAnalysisService = new FrameAnalysisService();
