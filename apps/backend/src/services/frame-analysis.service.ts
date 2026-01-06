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
  ExtractedArtifact,
  FrameSignals,
} from "../prompts/session-prompts";
import {
  createSessionLogger,
  createTimer,
  CHECKPOINTS,
  SESSION_EVENTS,
} from "../lib/sessionLogger";

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

  // Enhanced analysis fields
  artifacts: ExtractedArtifact[];
  signals: FrameSignals;
  onTask: boolean;
  taskRelevance: number;
  offTaskReason: string | null;

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
    const timer = createTimer("FrameAnalysis.analyzeFrame");
    const log = createSessionLogger({ sessionId: input.sessionId });

    log.debug("Starting frame analysis", {
      frameId: input.frameId,
      isFirstFrame: input.previousFrame === null,
      appName: input.windowInfo.appName,
      hasGoalContext: !!input.goalContext,
    });

    // CHECKPOINT: Frame analysis start
    log.checkpoint(CHECKPOINTS.FRAME_ANALYSIS_START, {
      frameId: input.frameId,
      isFirstFrame: input.previousFrame === null,
      appName: input.windowInfo.appName,
      windowTitle: input.windowInfo.windowTitle,
      hasGoalContext: !!input.goalContext,
    });

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
        log.warn("Failed to parse progression response", {
          frameId: input.frameId,
          responsePreview: visionResult.content.slice(0, 200),
        });
        return this.createFallbackResult(input, visionResult);
      }

      // Map progression result - directly use LLM's observable classifications
      const isFirstFrame = input.previousFrame === null;
      const deltaChanged = isFirstFrame || progressionResult.progression_detected;

      const result: FrameAnalysisResult = {
        frameId: input.frameId,
        progressionDetected: progressionResult.progression_detected,
        summaryOfAction: progressionResult.summary_of_action,
        deltaChanged,
        changeType: isFirstFrame ? "none" : progressionResult.change_type,
        changeMagnitude: isFirstFrame ? "trivial" : progressionResult.change_magnitude,
        changeDescription: isFirstFrame
          ? "First frame in session"
          : progressionResult.summary_of_action,
        // Enhanced analysis fields
        artifacts: progressionResult.artifacts,
        signals: progressionResult.signals,
        onTask: progressionResult.on_task,
        taskRelevance: progressionResult.task_relevance,
        offTaskReason: progressionResult.off_task_reason,
        // Metadata
        confidence: progressionResult.confidence,
        analysisLatencyMs: visionResult.latencyMs,
        model: visionResult.model,
        tokenUsage: {
          prompt: visionResult.usage.promptTokens,
          completion: visionResult.usage.completionTokens,
          total: visionResult.usage.totalTokens,
        },
      };

      // CHECKPOINT: Frame analysis complete
      log.checkpoint(CHECKPOINTS.FRAME_ANALYSIS_COMPLETE, {
        frameId: input.frameId,
        progressionDetected: result.progressionDetected,
        deltaChanged: result.deltaChanged,
        changeType: result.changeType,
        changeMagnitude: result.changeMagnitude,
        hasBlocker: result.signals.has_blocker,
        hasOutcome: result.signals.has_outcome,
        onTask: result.onTask,
        confidence: result.confidence,
        durationMs: timer.elapsed(),
        tokensUsed: result.tokenUsage.total,
      });

      log.debug("Frame analysis completed", {
        frameId: input.frameId,
        progressionDetected: result.progressionDetected,
        durationMs: timer.elapsed(),
      });

      // Track analytics event
      log.trackEvent(SESSION_EVENTS.FRAME_ANALYZED, {
        frameId: input.frameId,
        progressionDetected: result.progressionDetected,
        deltaChanged: result.deltaChanged,
        hasBlocker: result.signals.has_blocker,
        hasOutcome: result.signals.has_outcome,
        confidence: result.confidence,
        durationMs: timer.elapsed(),
      });

      return result;
    } catch (error) {
      log.error("Error analyzing frame", {
        frameId: input.frameId,
        error: error instanceof Error ? error.message : String(error),
        durationMs: timer.elapsed(),
      });
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
      // Default enhanced analysis fields for fallback
      artifacts: [],
      signals: {
        has_blocker: false,
        has_outcome: false,
        blocker_type: null,
        outcome_type: null,
      },
      onTask: true,
      taskRelevance: 0.5,
      offTaskReason: null,
      // Metadata
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
