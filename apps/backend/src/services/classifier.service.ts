import { db } from "../db/client";
import { users, sessionCaptures } from "../db/schema";
import { eq, asc, and, isNotNull } from "drizzle-orm";
import { createSessionLogger } from "../lib/sessionLogger";
import { classifierRLMService } from "./classifier-rlm/classifier-rlm.service";

export interface ClassifierInput {
  userId: string;
  sessionId: string;
  deltaDescription: string;
  frameId: string;
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
      // Order by capturedAt ascending to get chronological order directly
      const historyCaptures = await db.query.sessionCaptures.findMany({
        where: and(
          eq(sessionCaptures.sessionId, input.sessionId),
          isNotNull(sessionCaptures.activityDescription)
        ),
        orderBy: [asc(sessionCaptures.capturedAt)],
        limit: 5,
        columns: {
          activityDescription: true,
        },
      });

      // History is already in chronological order [oldest ... newest]
      const history = historyCaptures.map((c) => c.activityDescription as string);

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
