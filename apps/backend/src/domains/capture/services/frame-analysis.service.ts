/**
 * Frame Analysis Service
 *
 * Implements the "Sensor" (Step 1) of the Screen Understanding Pipeline.
 *
 * Responsibility:
 * - Compare consecutive frames (Previous A vs Current B).
 * - Detect purely visual deltas (text input, scroll, focus change).
 * - NO interpretation of "work" or "progress" (that happens in Classifier).
 *
 * Key changes from v1:
 * - Replaced "Progression Detector" with "Sensor Prompt".
 * - Output is strictly physical/visual, not semantic.
 */

import { geminiVisionFrameService } from "./gemini-vision-frame.service.js";
import { SENSOR_SYSTEM_PROMPT, SENSOR_USER_PROMPT } from "../../../prompts/session-prompts.js";
import {
  createSessionLogger,
  createTimer,
  CHECKPOINTS,
} from "../../shared-infra/lib/sessionLogger.js";

// Types
export type ChangeType =
  | "text_input"
  | "scroll"
  | "window_switch"
  | "click"
  | "navigation"
  | "none";

export type ChangeMagnitude = "major" | "minor" | "trivial";

export interface ExtractedArtifact {
  type: string;
  value: string;
}

export interface FrameSignals {
  has_blocker?: boolean;
  has_outcome?: boolean;
  blocker_type?: string | null;
  outcome_type?: string | null;
}

// Input/Output Types
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
  browserContext?: {
    activeTabUrl: string;
    activeTabTitle: string;
    tabCount: number;
  };
}

export interface FrameAnalysisResult {
  frameId: string;

  // Sensor Output (Visual Delta)
  deltaChanged: boolean;
  changeType: ChangeType;
  changeDescription: string; // The "Literal Delta"
  sceneContext: string | null; // Contextual observations (meeting participants, screen sharing, app environment)

  // Metadata
  confidence: number;
  analysisLatencyMs: number;
  model: string;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };

  // Legacy fields (kept for type compatibility until full system update)
  progressionDetected: boolean;
  summaryOfAction: string;
  changeMagnitude: ChangeMagnitude;
  artifacts: ExtractedArtifact[];
  signals: FrameSignals;
  onTask: boolean;
  taskRelevance: number;
  offTaskReason: string | null;
}

interface SensorResponse {
  changed: boolean;
  change_type: ChangeType;
  description: string;
  context: string | null;
}

class FrameAnalysisService {
  /**
   * Analyze a frame using the Sensor Prompt (Step 1)
   */
  async analyzeFrame(input: FrameAnalysisInput): Promise<FrameAnalysisResult> {
    const timer = createTimer("FrameAnalysis.analyzeFrame");
    const log = createSessionLogger({ sessionId: input.sessionId });

    log.debug("Starting frame analysis (Sensor)", {
      frameId: input.frameId,
      isFirstFrame: input.previousFrame === null,
      appName: input.windowInfo.appName,
    });

    // CHECKPOINT: Sensor start
    log.checkpoint(CHECKPOINTS.FRAME_ANALYSIS_START, {
      frameId: input.frameId,
      stage: "sensor_visual_delta",
    });

    try {
      // 1. Handle First Frame (No comparison possible)
      if (!input.previousFrame) {
        return this.createFirstFrameResult(input);
      }

      // 2. Call Gemini Vision with Sensor Prompt (enriched with browser context if available)
      let userPrompt = SENSOR_USER_PROMPT;
      if (input.browserContext) {
        userPrompt += `\n\nBrowser context: The user is viewing "${input.browserContext.activeTabTitle}" (${input.browserContext.activeTabUrl})`;
      }

      const visionResult = await geminiVisionFrameService.compareFrames(
        input.previousFrame,
        input.currentFrame,
        SENSOR_SYSTEM_PROMPT,
        userPrompt
      );

      // 3. Parse Sensor Response
      const sensorData = this.parseSensorResponse(visionResult.content);

      if (!sensorData) {
        log.warn("Failed to parse sensor response", {
          frameId: input.frameId,
          appName: input.windowInfo.appName,
          responseLength: visionResult.content.length,
          responsePreview: visionResult.content.slice(0, 500),
        });
        return this.createFallbackResult(input, visionResult);
      }

      const result: FrameAnalysisResult = {
        frameId: input.frameId,

        // Sensor Data
        deltaChanged: sensorData.changed,
        changeType: sensorData.change_type,
        changeDescription: sensorData.description,
        sceneContext: sensorData.context,

        // Metadata
        confidence: 0.9, // Sensor is usually high confidence on literal changes
        analysisLatencyMs: visionResult.latencyMs,
        model: visionResult.model,
        tokenUsage: {
          prompt: visionResult.usage.promptTokens,
          completion: visionResult.usage.completionTokens,
          total: visionResult.usage.totalTokens,
        },

        // Legacy / Default fields (to be filled by Classifier or ignored)
        progressionDetected: sensorData.changed,
        summaryOfAction: sensorData.description, // Temporarily use delta as summary
        changeMagnitude: sensorData.changed ? "minor" : "trivial",
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
      };

      // CHECKPOINT: Sensor complete
      log.checkpoint(CHECKPOINTS.FRAME_ANALYSIS_COMPLETE, {
        frameId: input.frameId,
        deltaChanged: result.deltaChanged,
        changeType: result.changeType,
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
   * Parse the JSON response from the Sensor model
   */
  private parseSensorResponse(rawResponse: string): SensorResponse | null {
    try {
      // Strip markdown code fences (```json ... ``` or ``` ... ```)
      const cleaned = rawResponse
        .replace(/^```(?:json)?\s*\n?/gm, "")
        .replace(/\n?```\s*$/gm, "")
        .trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

      // If no JSON found, check if Gemini returned a text-only "no change" response
      if (!jsonMatch) {
        const lower = cleaned.toLowerCase();
        if (
          lower.includes("identical") ||
          lower.includes("no change") ||
          lower.includes("no visual") ||
          lower.includes("no difference") ||
          lower.includes("same as") ||
          cleaned.length === 0
        ) {
          return {
            changed: false,
            change_type: "none",
            description: "No visual change detected",
            context: null,
          };
        }
        // Fall through to partial extraction below
      }

      // Try full JSON parse first
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            changed: typeof parsed.changed === "boolean" ? parsed.changed : false,
            change_type: parsed.change_type || "none",
            description: parsed.description || "No visual change detected",
            context: parsed.context || null,
          };
        } catch {
          // JSON truncated — fall through to partial extraction
        }
      }

      // Partial extraction: recover fields from truncated/incomplete JSON
      // Gemini sometimes returns truncated responses (~31% of frames)
      const text = cleaned || rawResponse;
      const changedMatch = text.match(/"changed"\s*:\s*(true|false)/);
      const typeMatch = text.match(/"change_type"\s*:\s*"([^"]+)"/);
      const descMatch = text.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);
      const ctxMatch = text.match(/"context"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/);

      if (changedMatch) {
        return {
          changed: changedMatch[1] === "true",
          change_type: (typeMatch?.[1] as ChangeType) || "none",
          description: descMatch?.[1] || "Visual change detected (truncated response)",
          context: ctxMatch?.[1] || null,
        };
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  private createFirstFrameResult(input: FrameAnalysisInput): FrameAnalysisResult {
    return {
      frameId: input.frameId,
      deltaChanged: true,
      changeType: "none",
      changeDescription: "Session started (First frame)",
      sceneContext: null,
      confidence: 1.0,
      analysisLatencyMs: 0,
      model: "system",
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      // Legacy defaults
      progressionDetected: true,
      summaryOfAction: "Session started",
      changeMagnitude: "trivial",
      artifacts: [],
      signals: { has_blocker: false, has_outcome: false, blocker_type: null, outcome_type: null },
      onTask: true,
      taskRelevance: 0.5,
      offTaskReason: null,
    };
  }

  /**
   * Create fallback result when parsing fails
   */
  private createFallbackResult(
    input: FrameAnalysisInput,
    visionResult: { latencyMs: number; model: string; usage: any }
  ): FrameAnalysisResult {
    return {
      frameId: input.frameId,
      deltaChanged: false,
      changeType: "none",
      changeDescription: "Analysis inconclusive",
      sceneContext: null,
      confidence: 0.5,
      analysisLatencyMs: visionResult.latencyMs,
      model: visionResult.model,
      tokenUsage: {
        prompt: visionResult.usage.promptTokens,
        completion: visionResult.usage.completionTokens,
        total: visionResult.usage.totalTokens,
      },
      // Legacy defaults
      progressionDetected: false,
      summaryOfAction: "Analysis failed",
      changeMagnitude: "trivial",
      artifacts: [],
      signals: { has_blocker: false, has_outcome: false, blocker_type: null, outcome_type: null },
      onTask: true,
      taskRelevance: 0.5,
      offTaskReason: null,
    };
  }

  isAvailable(): boolean {
    return geminiVisionFrameService.isAvailable();
  }
}

export const frameAnalysisService = new FrameAnalysisService();
