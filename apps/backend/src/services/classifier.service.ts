import { db } from "../db/client";
import { users, sessionCaptures, sessionTranscripts } from "../db/schema";
import { eq, asc, desc, and, isNotNull, gte, lte } from "drizzle-orm";
import { createSessionLogger } from "../domains/shared-infra/lib/sessionLogger.js";
import { classifierRLMService } from "./classifier-rlm/classifier-rlm.service";

export interface ClassifierInput {
  userId: string;
  sessionId: string;
  deltaDescription: string;
  sceneContext?: string | null; // Scene context from sensor (meeting participants, screen sharing, app environment)
  frameId: string;
  captureTimestamp?: Date; // Timestamp of screenshot for audio context matching
  windowInfo?: {
    appName: string;
    windowTitle: string;
  };
  previousDelta?: string;
  timeElapsedSec?: number;
  intervalEvidence?: {
    keyboardEventCount: number;
    copyCount: number;
    pasteCount: number;
    cutCount: number;
    mouseClickCount: number;
    mouseScrollCount: number;
  };
}

export interface ClassifierEvent {
  type: "navigation" | "composition" | "paste" | "view" | "edit";
  verb: string;
  object: string;
  via?: string;
}

export interface ClassifierResult {
  activity: string;
  confidence: number;
  isContinuation: boolean;
  actionType?: "VIEWING" | "NAVIGATION" | "PASTING" | "AUTHORING" | "EDITING";
  events?: ClassifierEvent[];
  entities?: {
    people: string[];
    systems: string[];
  };
  metrics?: {
    messages_composed: number;
    links_opened: number;
    pastes_performed: number;
  };
}

class ClassifierService {
  /**
   * Classify the current delta into a meaningful activity
   */
  async classifyActivity(input: ClassifierInput): Promise<ClassifierResult | null> {
    const log = createSessionLogger({ sessionId: input.sessionId });

    try {
      // 1. Fetch User Persona
      const user = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: {
          jobTitle: true,
          regularTasks: true,
          regularApps: true,
          additionalContext: true,
        },
      });

      if (!user) {
        log.warn("User not found for classification", { userId: input.userId });
        return null; // Should ideally have a fallback
      }

      // 2. Fetch Recent History (Last 5 valid activities)
      // We look for captures that HAVE an activityDescription already
      // Order by capturedAt descending to get the MOST RECENT 5, then reverse for chronological order
      const historyCaptures = await db.query.sessionCaptures.findMany({
        where: and(
          eq(sessionCaptures.sessionId, input.sessionId),
          isNotNull(sessionCaptures.activityDescription)
        ),
        orderBy: [desc(sessionCaptures.capturedAt)],
        limit: 5,
        columns: {
          activityDescription: true,
        },
      });

      // Reverse to chronological order [oldest ... newest]
      const history = historyCaptures.reverse().map((c) => c.activityDescription as string);

      // 3. Fetch Audio Transcripts (±5 seconds around capture time)
      let audioContext: string | undefined;
      if (input.captureTimestamp) {
        const windowMs = 5000; // ±5 seconds
        const captureTime = input.captureTimestamp;
        const startWindow = new Date(captureTime.getTime() - windowMs);
        const endWindow = new Date(captureTime.getTime() + windowMs);

        const transcripts = await db.query.sessionTranscripts.findMany({
          where: and(
            eq(sessionTranscripts.sessionId, input.sessionId),
            gte(sessionTranscripts.startTime, startWindow),
            lte(sessionTranscripts.endTime, endWindow)
          ),
          orderBy: [asc(sessionTranscripts.startTime)],
          columns: {
            speakerId: true,
            transcript: true,
            startTime: true,
            confidence: true,
          },
        });

        // Build audio context string if transcripts exist
        if (transcripts.length > 0) {
          audioContext = transcripts
            .map((t) => {
              const time = new Date(t.startTime).toLocaleTimeString();
              return `[${time}] Speaker ${t.speakerId}: ${t.transcript}`;
            })
            .join("\n");

          log.info("Audio context found for classification", {
            frameId: input.frameId,
            transcriptCount: transcripts.length,
          });
        }
      }

      // Fetch previous delta for temporal reasoning (N-1 frame)
      let previousDelta = input.previousDelta;
      const timeElapsedSec = input.timeElapsedSec;

      if (!previousDelta) {
        const previousCaptures = await db.query.sessionCaptures.findMany({
          where: and(
            eq(sessionCaptures.sessionId, input.sessionId),
            isNotNull(sessionCaptures.deltaChangeDescription)
          ),
          orderBy: [asc(sessionCaptures.capturedAt)],
          limit: 2,
          columns: {
            deltaChangeDescription: true,
            capturedAt: true,
          },
        });

        // Get N-1 capture (previous delta)
        if (previousCaptures.length >= 2) {
          previousDelta =
            previousCaptures[previousCaptures.length - 2].deltaChangeDescription || undefined;
        } else if (previousCaptures.length === 1) {
          previousDelta = previousCaptures[0].deltaChangeDescription || undefined;
        }
      }

      // Use Classifier RLM with 3 focused tools for iterative reasoning
      const rlmResult = await classifierRLMService.classify({
        userId: input.userId,
        sessionId: input.sessionId,
        frameId: input.frameId,
        deltaDescription: input.deltaDescription,
        sceneContext: input.sceneContext,
        audioContext, // Audio transcripts from ±5 seconds around screenshot
        windowInfo: input.windowInfo,
        intervalEvidence: input.intervalEvidence,
        previousDelta,
        timeElapsedSec,
        recentHistory: history,
        userPersona: {
          jobTitle: user.jobTitle || undefined,
          regularTasks: (user.regularTasks as string[]) || undefined,
          regularApps: (user.regularApps as string[]) || undefined,
          additionalContext: user.additionalContext || undefined,
        },
      });

      // Map RLM result to ClassifierResult interface
      const result: ClassifierResult = {
        activity: rlmResult.activity,
        confidence: rlmResult.confidence,
        isContinuation: rlmResult.is_continuation,
        actionType: rlmResult.action_type,
        events: rlmResult.events,
        entities: rlmResult.entities,
        metrics: rlmResult.metrics,
      };

      log.info("✅ Classifier RLM completed:", {
        frameId: input.frameId,
        activity: result.activity,
        actionType: result.actionType,
        confidence: result.confidence,
        toolCalls: rlmResult.toolCallCount,
        executionTimeMs: rlmResult.executionTimeMs,
      });

      return result;
    } catch (error) {
      log.error("Classifier failed", {
        error: error instanceof Error ? error.message : String(error),
        delta: input.deltaDescription,
      });
      // Fallback: Use the raw delta as the activity
      return {
        activity: input.deltaDescription,
        confidence: 0.1,
        isContinuation: false,
      };
    }
  }
}

export const classifierService = new ClassifierService();
