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
import { llamaServerService } from "./llamaServerService";
import { localDb } from "./localDb";
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
        this.flushBatch().catch((err) =>
          logger.error("Auto-flush failed:", String(err))
        );
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
    if (this.frameBuffer.length > 0) {
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

      // Step 2: Classifier — stitch sensor outputs into activity narrative
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

    const contextStr =
      contextParts.length > 0 ? `\nContext:\n${contextParts.join("\n")}` : "";

    const imageUrl = frame.imageBase64.startsWith("data:")
      ? frame.imageBase64
      : `data:image/png;base64,${frame.imageBase64}`;

    const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      {
        type: "image_url",
        image_url: { url: imageUrl },
      },
      {
        type: "text",
        text: `Describe what the user is doing on their computer screen in 1-2 sentences. Focus on the specific application, content, and action.${contextStr}`,
      },
    ];

    const response = await llamaServerService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a screen activity classifier. Given a screenshot and optional context, describe what the user is doing in 1-2 concise sentences. Note the application, content type, and user action (reading, typing, browsing, coding, etc). If there is keyboard/mouse activity data, use it to infer intent.",
        },
        { role: "user", content },
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

  // ── Classifier layer (text) ───────────────────────────────────────────

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
    const timeline = sensorResults
      .map((s, i) => {
        const frame = batch[i];
        const time = new Date(frame.capturedAt).toLocaleTimeString();
        const action = s.userAction ? ` [${s.userAction}]` : "";
        return `${time}${action}: ${s.description}`;
      })
      .join("\n");

    const prompt = `Analyze the following timeline of screen activity (${batch.length} frames captured over ~${Math.round((batch.length * 10) / 60)} minutes) and produce a concise summary.

Timeline:
${timeline}

Respond in this exact JSON format:
{
  "description": "2-3 sentence summary of what the user was doing during this period",
  "activityType": "coding|browsing|writing|communicating|designing|meeting|reading|other",
  "onTask": true/false,
  "taskRelevance": "brief note on how this relates to productive work",
  "importanceScore": 0.0 to 1.0
}`;

    // For now, use the vision model's text capabilities for classification.
    // This will be replaced with node-llama-cpp + a dedicated text model.
    const response = await llamaServerService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a work activity classifier. Given a timeline of screen observations, summarize the activity period. Always respond with valid JSON matching the requested format.",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.1, max_tokens: 512 }
    );

    try {
      const parsed = JSON.parse(response);
      return {
        description: parsed.description || "Activity recorded",
        activityType: parsed.activityType || null,
        onTask: parsed.onTask ?? true,
        taskRelevance: parsed.taskRelevance || null,
        importanceScore: parsed.importanceScore ?? 0.5,
        rawOutput: response,
      };
    } catch {
      logger.warn("Failed to parse classifier JSON, using raw response");
      return {
        description: response.slice(0, 500),
        activityType: null,
        onTask: true,
        taskRelevance: null,
        importanceScore: 0.5,
        rawOutput: response,
      };
    }
  }

  // ── Storyteller layer ─────────────────────────────────────────────────

  /**
   * Called at session end. Reads all classifications from local DB and
   * generates the final session narrative + tasks.
   */
  async generateStory(sessionId: string): Promise<{
    narrative: string;
    tasks: string[];
  }> {
    const classifications = localDb.getClassificationsForSession(sessionId);
    const transcriptions = localDb.getTranscriptionsForSession(sessionId);

    if (classifications.length === 0 && transcriptions.length === 0) {
      return { narrative: "No activity was recorded during this session.", tasks: [] };
    }

    const timeline = classifications
      .map((c) => `[Batch ${c.batchIndex}] ${c.activityDescription}`)
      .join("\n\n");

    const transcriptBlock =
      transcriptions.length > 0
        ? `\n\nAudio transcriptions from the session (spoken by the user or in meetings):\n${transcriptions
            .map(
              (t) =>
                `[${new Date(t.startTimeMs).toISOString().slice(11, 19)} - ${new Date(t.endTimeMs).toISOString().slice(11, 19)}] ${t.transcript}`
            )
            .join("\n")}`
        : "";

    const prompt = `You are analyzing a complete work session. Below are the classified activity blocks from screen capture, and any audio transcriptions from the session. Use both to generate:
1. A coherent narrative summary (3-5 paragraphs) of what the user accomplished
2. A list of concrete tasks/accomplishments extracted from the session

When audio transcriptions are available, integrate what was said with what was seen on screen. For example, if the user was in a video call and spoke about project deadlines, combine that with the visual context of the call.

Activity blocks:
${timeline}${transcriptBlock}

Respond in this exact JSON format:
{
  "narrative": "Full session narrative...",
  "tasks": ["Task 1 description", "Task 2 description", ...]
}`;

    const response = await llamaServerService.chatCompletion(
      [
        {
          role: "system",
          content:
            "You are a professional work session analyst. Given classified activity blocks from a monitoring session, create a clear narrative of what was accomplished and extract specific tasks. Write in third person past tense.",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.3, max_tokens: 2048 }
    );

    try {
      const parsed = JSON.parse(response);
      const narrative = parsed.narrative || "Session completed.";
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

      localDb.insertStory({
        id: randomUUID(),
        sessionId,
        narrative,
        tasks: JSON.stringify(tasks),
        timeBreakdown: null,
        modelUsed: "local-smolvlm2+phi3",
      });

      logger.info(`Story generated for session ${sessionId}: ${tasks.length} tasks extracted`);
      return { narrative, tasks };
    } catch {
      logger.warn("Failed to parse storyteller JSON");
      return {
        narrative: response.slice(0, 2000),
        tasks: [],
      };
    }
  }
}

export const localInferenceService = new LocalInferenceService();
