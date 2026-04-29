/**
 * Local Inference Service
 *
 * Orchestrates the on-device AI pipeline:
 *   1. Sensor  — vision model classifies each screenshot (SmolVLM2 via llama-server)
 *   2. Classifier — text model stitches sensor outputs into activity narrative
 *   3. Storyteller — text model generates session story + tasks at session end
 *
 * Frames are captured every 10s as before, but instead of sending each to the
 * cloud, they're buffered and flushed through the local pipeline in batches
 * (~20-30 frames or every 60s, whichever comes first).
 *
 * All outputs are stored in the local SQLite database. Only final session
 * summaries are exported to the cloud backend.
 */

import { randomUUID } from "crypto";
import { createLogger } from "../../lib/logger";
import { ollamaService } from "./ollamaService";
import { localDb } from "./localDb";
import { runRLMLoop, type CompletionFn } from "./rlm/local-rlm-engine";
import { ClassifierEnvironment, type SensorFrame } from "./rlm/classifier-rlm-environment";
import { CLASSIFIER_TOOLS } from "./rlm/classifier-rlm-tools";
import { getClassifierSystemPrompt, getClassifierUserPrompt } from "./rlm/classifier-rlm-prompts";
import { StorytellerEnvironment } from "./rlm/storyteller-rlm-environment";
import { STORYTELLER_TOOLS } from "./rlm/storyteller-rlm-tools";
import {
  getStorytellerSystemPrompt,
  getStorytellerUserPrompt,
} from "./rlm/storyteller-rlm-prompts";
import type { IntervalEvidence } from "../activityTracker";

const logger = createLogger("LocalInference");

// ── Configuration ───────────────────────────────────────────────────────────

const BATCH_SIZE = 20;
const BATCH_FLUSH_INTERVAL_MS = 60_000;

// ── Types ───────────────────────────────────────────────────────────────────

export interface BufferedFrame {
  frameId: string;
  sessionId: string;
  sequenceNumber: number;
  capturedAt: number;
  imageBase64: string;
  previousImageBase64: string | null;
  windowId: string;
  appName: string;
  windowTitle: string;
  intervalEvidence?: IntervalEvidence;
  browserContext?: { activeTabUrl: string; activeTabTitle: string; tabCount: number };
}

interface SensorResult {
  frameId: string;
  description: string;
  deltaChanged: boolean;
  changeType: string | null;
  userAction: string | null;
}

// ── Service ─────────────────────────────────────────────────────────────────

class LocalInferenceService {
  private frameBuffer: BufferedFrame[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private batchIndex = 0;
  private processing = false;
  private currentSessionId: string | null = null;

  // ── Lifecycle ───────────────────────────────────────────────────────────

  start(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.batchIndex = 0;
    this.frameBuffer = [];
    this.processing = false;

    this.flushTimer = setInterval(() => {
      if (this.frameBuffer.length > 0 && !this.processing) {
        this.flushBatch().catch((err) => logger.error("Auto-flush failed:", String(err)));
      }
    }, BATCH_FLUSH_INTERVAL_MS);

    logger.info("Started local inference for session", sessionId);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.currentSessionId = null;
    logger.info("Stopped local inference");
  }

  clear(): void {
    this.frameBuffer = [];
    this.processing = false;
    logger.info("Cleared inference buffer");
  }

  // ── Frame buffering ─────────────────────────────────────────────────────

  /**
   * Called by monitoringSessionService instead of analyzeFrameAsync.
   * Buffers the frame; auto-flushes when batch is full.
   */
  async addFrame(frame: BufferedFrame): Promise<void> {
    this.frameBuffer.push(frame);
    logger.debug(
      `Buffered frame ${frame.sequenceNumber} (${this.frameBuffer.length}/${BATCH_SIZE})`
    );

    if (this.frameBuffer.length >= BATCH_SIZE && !this.processing) {
      await this.flushBatch();
    }
  }

  /**
   * Force-flush remaining frames (call on session end before storyteller).
   */
  async flushRemaining(): Promise<void> {
    const maxWaitMs = 60_000;
    const pollMs = 500;
    let waited = 0;

    while (this.frameBuffer.length > 0) {
      if (this.processing) {
        if (waited >= maxWaitMs) {
          logger.warn(
            `flushRemaining: timed out waiting for batch to finish (${maxWaitMs}ms), ${this.frameBuffer.length} frames dropped`
          );
          this.frameBuffer = [];
          break;
        }
        await new Promise((r) => setTimeout(r, pollMs));
        waited += pollMs;
        continue;
      }
      waited = 0;
      await this.flushBatch();
    }
  }

  // ── Batch pipeline ──────────────────────────────────────────────────────

  private async flushBatch(): Promise<void> {
    if (this.processing || this.frameBuffer.length === 0) return;
    this.processing = true;

    const batch = this.frameBuffer.splice(0, BATCH_SIZE);
    const batchIdx = this.batchIndex++;

    logger.info(
      `Processing batch ${batchIdx}: ${batch.length} frames (seq ${batch[0].sequenceNumber}-${batch[batch.length - 1].sequenceNumber})`
    );

    try {
      // Step 1: Sensor — run vision model on each frame
      const sensorResults = await this.runSensor(batch);

      // Store sensor outputs in local DB
      for (let i = 0; i < batch.length; i++) {
        const frame = batch[i];
        const sensor = sensorResults[i];
        localDb.insertCapture({
          id: randomUUID(),
          sessionId: frame.sessionId,
          frameId: frame.frameId,
          sequenceNumber: frame.sequenceNumber,
          capturedAt: frame.capturedAt,
          windowId: frame.windowId,
          appName: frame.appName,
          windowTitle: frame.windowTitle,
          sensorOutput: sensor.description,
          deltaChanged: sensor.deltaChanged,
          changeType: sensor.changeType,
          userAction: sensor.userAction,
        });
      }

      // Step 2: Classifier — always runs (single Ollama model handles everything)
      const classifierResult = await this.runClassifier(batch, sensorResults);

      localDb.insertClassification({
        id: randomUUID(),
        sessionId: batch[0].sessionId,
        batchIndex: batchIdx,
        startSequence: batch[0].sequenceNumber,
        endSequence: batch[batch.length - 1].sequenceNumber,
        activityDescription: classifierResult.description,
        activityType: classifierResult.activityType,
        onTask: classifierResult.onTask,
        taskRelevance: classifierResult.taskRelevance,
        importanceScore: classifierResult.importanceScore,
        rawOutput: classifierResult.rawOutput,
      });

      logger.info(`Batch ${batchIdx} complete:`, classifierResult.description.slice(0, 100));
    } catch (err) {
      logger.error(`Batch ${batchIdx} failed:`, String(err));
    } finally {
      this.processing = false;
    }
  }

  // ── Sensor layer (vision) ─────────────────────────────────────────────

  private async runSensor(batch: BufferedFrame[]): Promise<SensorResult[]> {
    const results: SensorResult[] = [];

    for (const frame of batch) {
      try {
        const result = await this.analyzeSingleFrame(frame);
        results.push(result);
      } catch (err) {
        logger.warn(`Sensor failed for frame ${frame.frameId}:`, String(err));
        results.push({
          frameId: frame.frameId,
          description: `[${frame.appName}] ${frame.windowTitle}`,
          deltaChanged: false,
          changeType: null,
          userAction: null,
        });
      }
    }

    return results;
  }

  private async analyzeSingleFrame(frame: BufferedFrame): Promise<SensorResult> {
    const contextParts: string[] = [];
    if (frame.appName) contextParts.push(`Application: ${frame.appName}`);
    if (frame.windowTitle) contextParts.push(`Window: ${frame.windowTitle}`);
    if (frame.browserContext) {
      contextParts.push(`Browser URL: ${frame.browserContext.activeTabUrl}`);
      contextParts.push(`Browser Tab: ${frame.browserContext.activeTabTitle}`);
    }
    if (frame.intervalEvidence) {
      const ev = frame.intervalEvidence;
      const parts: string[] = [];
      if (ev.keyboardEventCount > 0) parts.push(`${ev.keyboardEventCount} keystrokes`);
      if (ev.mouseClickCount > 0) parts.push(`${ev.mouseClickCount} clicks`);
      if (ev.mouseScrollCount > 0) parts.push(`${ev.mouseScrollCount} scrolls`);
      if (ev.copyCount > 0) parts.push(`${ev.copyCount} copies`);
      if (ev.pasteCount > 0) parts.push(`${ev.pasteCount} pastes`);
      if (parts.length > 0) contextParts.push(`Activity: ${parts.join(", ")}`);
    }

    const contextStr = contextParts.length > 0 ? `\nContext:\n${contextParts.join("\n")}` : "";

    const imageUrl = frame.imageBase64.startsWith("data:")
      ? frame.imageBase64
      : `data:image/png;base64,${frame.imageBase64}`;

    const response = await ollamaService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a screen activity classifier. Given a screenshot and optional context, describe what the user is doing in 1-2 concise sentences. Note the application, content type, and user action (reading, typing, browsing, coding, etc). If there is keyboard/mouse activity data, use it to infer intent.",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            {
              type: "text",
              text: `Describe what the user is doing on their computer screen in 1-2 sentences. Focus on the specific application, content, and action.${contextStr}`,
            },
          ],
        },
      ],
      { temperature: 0.1, max_tokens: 256 }
    );

    const description = response.trim();
    const hasActivity =
      (frame.intervalEvidence?.keyboardEventCount ?? 0) > 0 ||
      (frame.intervalEvidence?.mouseClickCount ?? 0) > 0;

    return {
      frameId: frame.frameId,
      description,
      deltaChanged: hasActivity || description.length > 20,
      changeType: hasActivity ? "user_interaction" : "passive_view",
      userAction: this.inferAction(frame.intervalEvidence),
    };
  }

  private inferAction(evidence?: IntervalEvidence): string | null {
    if (!evidence) return null;
    if (evidence.keyboardEventCount > 10) return "typing";
    if (evidence.pasteCount > 0) return "pasting";
    if (evidence.copyCount > 0) return "copying";
    if (evidence.mouseScrollCount > 3) return "scrolling/reading";
    if (evidence.mouseClickCount > 0) return "clicking/navigating";
    return "idle/watching";
  }

  // ── Classifier layer (RLM) ───────────────────────────────────────────

  private async runClassifier(
    batch: BufferedFrame[],
    sensorResults: SensorResult[]
  ): Promise<{
    description: string;
    activityType: string | null;
    onTask: boolean;
    taskRelevance: string | null;
    importanceScore: number;
    rawOutput: string;
  }> {
    const frames: SensorFrame[] = sensorResults.map((s, i) => ({
      index: i,
      time: new Date(batch[i].capturedAt).toLocaleTimeString(),
      appName: batch[i].appName,
      windowTitle: batch[i].windowTitle,
      sensorOutput: s.description,
      userAction: s.userAction,
    }));

    const env = new ClassifierEnvironment({
      frames,
      sessionId: batch[0].sessionId,
      batchIndex: this.batchIndex - 1,
    });

    const completionFn: CompletionFn = (msgs, opts) =>
      ollamaService.chatCompletion(msgs, {
        temperature: opts?.temperature,
        max_tokens: opts?.max_tokens,
        format: "json",
      });

    const result = await runRLMLoop<ClassifierEnvironment, Record<string, unknown>>(
      getClassifierSystemPrompt(),
      getClassifierUserPrompt(frames.length, env.batchIndex),
      CLASSIFIER_TOOLS,
      env,
      { maxIterations: 5, doneResultField: "classification", temperature: 0.1, completionFn }
    );

    const classification =
      env.getClassification() ?? (result.result as Record<string, unknown> | null);

    if (classification) {
      return {
        description: String(classification.description || "Activity recorded"),
        activityType: classification.activityType ? String(classification.activityType) : null,
        onTask: Boolean(classification.onTask),
        taskRelevance: classification.taskRelevance ? String(classification.taskRelevance) : null,
        importanceScore: Number(classification.importanceScore) || 0.5,
        rawOutput: JSON.stringify(result),
      };
    }

    logger.warn("Classifier RLM produced no result, using fallback");
    const fallbackDesc = sensorResults
      .map((s) => s.description)
      .join(". ")
      .slice(0, 500);
    return {
      description: fallbackDesc || "Activity recorded",
      activityType: null,
      onTask: true,
      taskRelevance: null,
      importanceScore: 0.5,
      rawOutput: JSON.stringify(result),
    };
  }

  // ── Storyteller layer (RLM) ───────────────────────────────────────────

  /**
   * Called at session end. Reads all classifications from local DB and
   * generates the final session narrative + tasks via the RLM loop.
   */
  async generateStory(sessionId: string): Promise<{
    narrative: string;
    tasks: Array<{ description: string; minutes: number }>;
  }> {
    const classifications = localDb.getClassificationsForSession(sessionId);
    const transcriptions = localDb.getTranscriptionsForSession(sessionId);

    if (classifications.length === 0 && transcriptions.length === 0) {
      const narrative = "No activity was recorded during this session.";
      localDb.insertStory({
        id: randomUUID(),
        sessionId,
        narrative,
        tasks: "[]",
        timeBreakdown: null,
        modelUsed: ollamaService.getLoadedModel() ?? "gemma4",
      });
      return { narrative, tasks: [] };
    }

    const completionFn: CompletionFn = (msgs, opts) =>
      ollamaService.chatCompletion(msgs, {
        temperature: opts?.temperature,
        max_tokens: opts?.max_tokens,
        format: "json",
      });

    const env = new StorytellerEnvironment({
      sessionId,
      classifications,
      transcriptions,
      completionFn,
    });

    const result = await runRLMLoop<
      StorytellerEnvironment,
      { narrative: string; tasks: Array<{ description: string; minutes: number }> }
    >(
      getStorytellerSystemPrompt(),
      getStorytellerUserPrompt(classifications.length),
      STORYTELLER_TOOLS,
      env,
      {
        maxIterations: 15,
        doneResultField: "summary",
        temperature: 0.3,
        maxTokens: 2048,
        completionFn,
      }
    );

    const story = env.getFinalStory() ?? result.result;
    const narrative = story?.narrative || "Session completed.";
    const tasks = Array.isArray(story?.tasks) ? story.tasks : [];

    localDb.insertStory({
      id: randomUUID(),
      sessionId,
      narrative,
      tasks: JSON.stringify(tasks),
      timeBreakdown: null,
      modelUsed: ollamaService.getLoadedModel() ?? "gemma4",
    });

    localDb.checkpoint();

    logger.info(
      `Story generated for session ${sessionId}: ${tasks.length} tasks, ${result.iterations} RLM iterations`
    );
    return { narrative, tasks };
  }

  /**
   * Export the locally-generated story for a session in the format the cloud
   * backend expects. Only the narrative + task breakdown leave the device —
   * raw captures, classifications, and transcriptions stay in local SQLite.
   */
  exportResultsForBackend(sessionId: string, _activeDurationMs: number): OnDeviceSummary | null {
    const story = localDb.getStoryForSession(sessionId);
    if (!story) return null;

    let parsedTasks: Array<{ description: string; minutes?: number } | string> = [];
    try {
      parsedTasks = JSON.parse(story.tasks);
      if (!Array.isArray(parsedTasks)) parsedTasks = [];
    } catch {
      parsedTasks = [];
    }

    const taskBreakdown = parsedTasks.map((t) => {
      const desc = typeof t === "string" ? t : t.description || "Task";
      const minutes = typeof t === "object" && t.minutes ? t.minutes : 0;
      return {
        shortTitle: desc.length > 40 ? desc.slice(0, 37) + "..." : desc,
        description: desc,
        minutes: Math.max(1, minutes),
      };
    });

    let timeBreakdown: Record<string, number> | null = null;
    if (story.timeBreakdown) {
      try {
        timeBreakdown = JSON.parse(story.timeBreakdown);
      } catch {
        /* ignore malformed */
      }
    }

    return {
      narrative: story.narrative,
      taskBreakdown,
      timeBreakdown,
      modelUsed: story.modelUsed,
    };
  }
}

export interface OnDeviceSummary {
  narrative: string;
  taskBreakdown: Array<{ shortTitle: string; description: string; minutes: number }>;
  timeBreakdown: Record<string, number> | null;
  modelUsed: string;
}

export const localInferenceService = new LocalInferenceService();
