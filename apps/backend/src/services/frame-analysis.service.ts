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
  ActivityRegistryContext,
  ProgressionDetectorResponse,
  ProgressState,
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
  // Optional activity context for Activity Registry integration
  activityContext?: ActivityRegistryContext;
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

  // Activity Registry fields
  keyActivityName: string | null;
  keyActivityId: string | null;
  progress: ProgressState;
  
  // Milestone Detection
  milestoneDetected: boolean;
  milestoneDescription: string | null;
  evidenceReference: string | null;

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

    // Build prompt with goal context and activity context
    const { system: systemPrompt, user: userPrompt } = buildProgressionDetectorPrompt(
      input.goalContext,
      input.activityContext
    );

    // Log full prompt for deep debugging (when SESSION_LOG_FULL_AI=true)
    log.logFullAIInteraction(
      "progression_detector_prompt_full",
      systemPrompt,
      userPrompt,
      "", // Response comes later
      {
        frameId: input.frameId,
        isFirstFrame: input.previousFrame === null,
        appName: input.windowInfo.appName,
        windowTitle: input.windowInfo.windowTitle,
        hasGoalContext: !!input.goalContext,
        hasActivityContext: !!input.activityContext,
        goalContext: input.goalContext
          ? {
              sessionGoal: input.goalContext.sessionGoal,
              linearIssueId: input.goalContext.linearIssueId,
              linearIssueTitle: input.goalContext.linearIssueTitle,
              hasRelatedDocs: !!input.goalContext.relatedDocsContext,
            }
          : null,
      }
    );

    try {
      // Call Gemini Vision with two images
      const visionResult = await geminiVisionFrameService.compareFrames(
        input.previousFrame,
        input.currentFrame,
        systemPrompt,
        userPrompt
      );

      // Log full response for deep debugging (when SESSION_LOG_FULL_AI=true)
      log.logFullAIInteraction(
        "progression_detector_response_full",
        "", // Prompt already logged
        "", // Prompt already logged
        visionResult.content,
        {
          frameId: input.frameId,
          model: visionResult.model,
          latencyMs: visionResult.latencyMs,
          tokensUsed: visionResult.usage.totalTokens,
          promptTokens: visionResult.usage.promptTokens,
          completionTokens: visionResult.usage.completionTokens,
        }
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

      // Map progression result
      const isFirstFrame = input.previousFrame === null;
      
      // Determine if progression happened based on analysis result
      // The new prompt doesn't return a boolean, but specific states
      const hasAction = !progressionResult.analysis_result.toLowerCase().includes("no meaningful visual change") &&
                        !progressionResult.analysis_result.toLowerCase().includes("no observable changes");
      
      const progressionDetected = isFirstFrame || 
                                  progressionResult.milestone_detected || 
                                  progressionResult.progress === "COMPLETE" || 
                                  hasAction;

      const deltaChanged = progressionDetected;

      const result: FrameAnalysisResult = {
        frameId: input.frameId,
        progressionDetected,
        summaryOfAction: progressionResult.analysis_result,
        deltaChanged,
        changeType: isFirstFrame ? "none" : (progressionDetected ? "content" : "none"), // Inferred
        changeMagnitude: isFirstFrame ? "trivial" : (progressionDetected ? "standard" : "none"), // Inferred
        changeDescription: isFirstFrame
          ? "First frame in session"
          : progressionResult.analysis_result,
        
        // Activity Registry Fields
        keyActivityName: progressionResult.key_activity_name,
        keyActivityId: progressionResult.key_activity_id,
        progress: progressionResult.progress,
        milestoneDetected: progressionResult.milestone_detected,
        milestoneDescription: progressionResult.milestone_description,
        evidenceReference: progressionResult.evidence_reference,

        // Enhanced analysis fields - DEFAULT VALUES as they are removed from prompt
        artifacts: [],
        signals: {
          has_blocker: false,
          has_outcome: progressionResult.progress === "COMPLETE" || progressionResult.milestone_detected,
          blocker_type: null,
          outcome_type: progressionResult.milestone_detected ? "milestone" : (progressionResult.progress === "COMPLETE" ? "completion" : null),
        },
        onTask: progressionResult.progress !== "CONTEXT_SWITCH",
        taskRelevance: progressionResult.progress === "CONTEXT_SWITCH" ? 0.1 : 0.9,
        offTaskReason: progressionResult.progress === "CONTEXT_SWITCH" ? "Context switch detected" : null,
        
        // Metadata
        confidence: 0.8, // Default confidence since it's not in the new schema
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
      
      // Activity Registry Fields
      keyActivityName: null,
      keyActivityId: null,
      progress: "IN_PROGRESS",
      milestoneDetected: false,
      milestoneDescription: null,
      evidenceReference: null,

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
