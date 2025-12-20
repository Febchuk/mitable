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

import { groqVisionService } from "./groq-vision.service";
import {
  buildProgressionDetectorPrompt,
  parseProgressionResponse,
  ProgressionDetectorResponse,
} from "../prompts/session-prompts";
import { DeltaChangeType } from "../db/schema/monitoring.schema";

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
}

export interface FrameAnalysisResult {
  frameId: string;
  progressionDetected: boolean;
  summaryOfAction: string;

  // Enhanced delta detection (mapped from progression result)
  deltaChanged: boolean;
  deltaChangeType: DeltaChangeType;
  deltaChangeDescription: string;
  deltaUserAction: string | null;

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
   */
  async analyzeFrame(input: FrameAnalysisInput): Promise<FrameAnalysisResult> {
    const { system: systemPrompt, user: userPrompt } =
      buildProgressionDetectorPrompt();

    try {
      // Call Groq Vision with two images
      const visionResult = await groqVisionService.compareFrames(
        input.previousFrame,
        input.currentFrame,
        systemPrompt,
        userPrompt
      );

      // Parse the structured response
      const progressionResult = parseProgressionResponse(visionResult.content);

      if (!progressionResult) {
        console.warn(
          `[FrameAnalysis] Failed to parse response for frame ${input.frameId}`
        );
        return this.createFallbackResult(input, visionResult);
      }

      // Map progression result to enhanced delta detection
      const deltaResult = this.mapToEnhancedDelta(
        progressionResult,
        input.previousFrame === null
      );

      return {
        frameId: input.frameId,
        progressionDetected: progressionResult.progression_detected,
        summaryOfAction: progressionResult.summary_of_action,
        deltaChanged: deltaResult.changed,
        deltaChangeType: deltaResult.changeType,
        deltaChangeDescription: deltaResult.changeDescription,
        deltaUserAction: deltaResult.userAction,
        confidence: progressionResult.progression_detected ? 0.85 : 0.7,
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
  async analyzeFrameBatch(
    frames: FrameAnalysisInput[]
  ): Promise<FrameAnalysisResult[]> {
    const results: FrameAnalysisResult[] = [];

    for (const frame of frames) {
      const result = await this.analyzeFrame(frame);
      results.push(result);
    }

    return results;
  }

  /**
   * Map progression detection to enhanced delta types
   */
  private mapToEnhancedDelta(
    progression: ProgressionDetectorResponse,
    isFirstFrame: boolean
  ): {
    changed: boolean;
    changeType: DeltaChangeType;
    changeDescription: string;
    userAction: string | null;
  } {
    if (isFirstFrame) {
      return {
        changed: true,
        changeType: "none",
        changeDescription: "First frame in session",
        userAction: "Started monitoring session",
      };
    }

    if (!progression.progression_detected) {
      return {
        changed: false,
        changeType: "none",
        changeDescription: "No meaningful change detected",
        userAction: null,
      };
    }

    // Infer change type from summary
    const summary = progression.summary_of_action.toLowerCase();
    let changeType: DeltaChangeType = "content_update";
    let userAction: string | null = null;

    // Typing patterns
    if (
      summary.includes("typed") ||
      summary.includes("wrote") ||
      summary.includes("entered") ||
      summary.includes("edited") ||
      summary.includes("modified")
    ) {
      changeType = "typing";
      userAction = "typing";
    }
    // Navigation patterns
    else if (
      summary.includes("navigated") ||
      summary.includes("clicked") ||
      summary.includes("opened") ||
      summary.includes("switched to") ||
      summary.includes("went to")
    ) {
      changeType = "navigation";
      userAction = "clicking";
    }
    // Scroll patterns
    else if (summary.includes("scrolled") || summary.includes("scroll")) {
      changeType = "scroll";
      userAction = "scrolling";
    }
    // Focus change patterns
    else if (
      summary.includes("focused") ||
      summary.includes("switched window") ||
      summary.includes("moved to")
    ) {
      changeType = "focus_change";
      userAction = "clicking";
    }
    // Default to content update
    else {
      changeType = "content_update";
      userAction = "viewing";
    }

    return {
      changed: true,
      changeType,
      changeDescription: progression.summary_of_action,
      userAction,
    };
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
      summaryOfAction: isFirstFrame
        ? "Session started"
        : "Unable to determine activity",
      deltaChanged: isFirstFrame,
      deltaChangeType: "none",
      deltaChangeDescription: isFirstFrame
        ? "First frame in session"
        : "Analysis inconclusive",
      deltaUserAction: null,
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
    return groqVisionService.isAvailable();
  }
}

// Export singleton instance
export const frameAnalysisService = new FrameAnalysisService();
