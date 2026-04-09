/**
 * Intermediate Summary Service
 *
 * Generates real-time intermediate summaries during active monitoring sessions.
 * Updates every configured interval (default 30 minutes) or on-demand via force trigger.
 *
 * Uses the existing Storyteller RLM infrastructure with simplified preferences
 * for faster, lighter-weight summary generation during live sessions.
 */

import { db } from "../../../db/client";
import { monitoringSessions, sessionCaptures, sessionTranscripts } from "../../../db/schema";
import { eq, and, isNotNull, asc } from "drizzle-orm";
import { storytellerRLMService } from "../rlm/storyteller/storyteller-rlm.service";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "intermediate-summary" });

export interface IntermediateSummaryResult {
  summary: string;
  generatedAt: Date;
  activityCount: number;
  executionTimeMs: number;
}

class IntermediateSummaryService {
  /**
   * Check if a session needs an intermediate summary update
   * Returns true if:
   * - Session is active or paused
   * - Intermediate summaries are enabled
   * - Enough time has passed since last summary (based on interval)
   */
  async shouldGenerateSummary(sessionId: string): Promise<boolean> {
    const [session] = await db
      .select({
        status: monitoringSessions.status,
        intermediateSummaryEnabled: monitoringSessions.intermediateSummaryEnabled,
        intermediateSummaryIntervalMs: monitoringSessions.intermediateSummaryIntervalMs,
        lastIntermediateSummaryAt: monitoringSessions.lastIntermediateSummaryAt,
        intermediateSummaryStatus: monitoringSessions.intermediateSummaryStatus,
      })
      .from(monitoringSessions)
      .where(eq(monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      logger.warn({ sessionId }, "Session not found for intermediate summary check");
      return false;
    }

    // Only generate for active or paused sessions
    if (session.status !== "active" && session.status !== "paused") {
      return false;
    }

    // Check if intermediate summaries are enabled
    if (!session.intermediateSummaryEnabled) {
      return false;
    }

    // Don't start if already generating
    if (session.intermediateSummaryStatus === "generating") {
      return false;
    }

    // Check if enough time has passed since last summary
    if (session.lastIntermediateSummaryAt) {
      const elapsed = Date.now() - new Date(session.lastIntermediateSummaryAt).getTime();
      if (elapsed < session.intermediateSummaryIntervalMs) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate an intermediate summary for an active session
   * Uses the Storyteller RLM with concise preferences for faster generation
   */
  async generateIntermediateSummary(
    sessionId: string,
    force: boolean = false
  ): Promise<IntermediateSummaryResult> {
    const startTime = Date.now();

    // Verify session exists and is eligible
    const [session] = await db
      .select({
        status: monitoringSessions.status,
        intermediateSummaryEnabled: monitoringSessions.intermediateSummaryEnabled,
        intermediateSummaryStatus: monitoringSessions.intermediateSummaryStatus,
        startedAt: monitoringSessions.startedAt,
      })
      .from(monitoringSessions)
      .where(eq(monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Only allow for active/paused sessions (unless forced)
    if (!force && session.status !== "active" && session.status !== "paused") {
      throw new Error(`Session ${sessionId} is not active (status: ${session.status})`);
    }

    // Prevent concurrent generation
    if (session.intermediateSummaryStatus === "generating") {
      throw new Error(`Intermediate summary already generating for session ${sessionId}`);
    }

    // Mark as generating
    await db
      .update(monitoringSessions)
      .set({ intermediateSummaryStatus: "generating" })
      .where(eq(monitoringSessions.id, sessionId));

    try {
      // Fetch activity timeline
      const rawActivities = await db.query.sessionCaptures.findMany({
        where: and(
          eq(sessionCaptures.sessionId, sessionId),
          isNotNull(sessionCaptures.activityDescription)
        ),
        orderBy: [asc(sessionCaptures.sequenceNumber)],
        columns: {
          activityDescription: true,
          capturedAt: true,
          sequenceNumber: true,
          classifierData: true,
        },
      });

      // Filter and map activities
      const timeline = rawActivities
        .filter(
          (
            a
          ): a is {
            activityDescription: string;
            capturedAt: Date;
            sequenceNumber: number;
            classifierData: any;
          } => a.activityDescription !== null
        )
        .map((a) => ({
          activityDescription: a.activityDescription!,
          capturedAt: a.capturedAt,
          classifierData: a.classifierData
            ? typeof a.classifierData === "string"
              ? JSON.parse(a.classifierData)
              : a.classifierData
            : undefined,
        }));

      if (timeline.length === 0) {
        const noActivityResult: IntermediateSummaryResult = {
          summary: "Session in progress. No significant activity captured yet.",
          generatedAt: new Date(),
          activityCount: 0,
          executionTimeMs: Date.now() - startTime,
        };

        // Update session with empty summary
        await db
          .update(monitoringSessions)
          .set({
            intermediateSummary: noActivityResult.summary,
            lastIntermediateSummaryAt: noActivityResult.generatedAt,
            intermediateSummaryStatus: "completed",
            updatedAt: new Date(),
          })
          .where(eq(monitoringSessions.id, sessionId));

        return noActivityResult;
      }

      // Fetch audio transcripts for context
      const transcripts = await db.query.sessionTranscripts.findMany({
        where: eq(sessionTranscripts.sessionId, sessionId),
        orderBy: [asc(sessionTranscripts.startTime)],
        columns: {
          speakerId: true,
          transcript: true,
          startTime: true,
        },
      });

      const fullTranscriptText =
        transcripts.length > 0
          ? transcripts
              .map((t) => {
                const time = new Date(t.startTime).toLocaleTimeString();
                return `[${time}] Speaker ${t.speakerId}: ${t.transcript}`;
              })
              .join("\n")
          : undefined;

      // Calculate session metadata
      const sessionStart = timeline[0]?.capturedAt || session.startedAt;
      const sessionEnd = timeline[timeline.length - 1]?.capturedAt || new Date();
      const durationMinutes = Math.round(
        (sessionEnd.getTime() - new Date(sessionStart).getTime()) / (1000 * 60)
      );

      const metadata = {
        sessionId,
        totalActivities: timeline.length,
        durationMinutes,
        startTime: new Date(sessionStart),
        endTime: sessionEnd,
      };

      logger.info(
        { sessionId, activityCount: timeline.length, durationMinutes },
        "Generating intermediate summary"
      );

      const rlmResult = await storytellerRLMService.generateSummary({
        sessionId,
        timeline,
        fullTranscriptText,
        metadata,
      });

      const result: IntermediateSummaryResult = {
        summary: rlmResult.summary,
        generatedAt: new Date(),
        activityCount: timeline.length,
        executionTimeMs: Date.now() - startTime,
      };

      // Update session with intermediate summary
      await db
        .update(monitoringSessions)
        .set({
          intermediateSummary: result.summary,
          lastIntermediateSummaryAt: result.generatedAt,
          intermediateSummaryStatus: "completed",
          updatedAt: new Date(),
        })
        .where(eq(monitoringSessions.id, sessionId));

      logger.info(
        {
          sessionId,
          activityCount: result.activityCount,
          executionTimeMs: result.executionTimeMs,
          summaryLength: result.summary.length,
        },
        "Intermediate summary generated successfully"
      );

      return result;
    } catch (error) {
      // Mark as failed
      await db
        .update(monitoringSessions)
        .set({
          intermediateSummaryStatus: "failed",
          updatedAt: new Date(),
        })
        .where(eq(monitoringSessions.id, sessionId));

      logger.error(
        {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to generate intermediate summary"
      );

      throw error;
    }
  }

  /**
   * Check and trigger intermediate summary if needed
   * Called after frame uploads to opportunistically generate summaries
   * Non-blocking - runs in background
   */
  async checkAndTriggerIfNeeded(sessionId: string): Promise<void> {
    try {
      const shouldGenerate = await this.shouldGenerateSummary(sessionId);
      if (shouldGenerate) {
        // Don't await - run in background
        this.generateIntermediateSummary(sessionId).catch((error) => {
          logger.warn(
            { sessionId, error: String(error) },
            "Background intermediate summary generation failed"
          );
        });
      }
    } catch (error) {
      logger.warn(
        { sessionId, error: String(error) },
        "Failed to check intermediate summary eligibility"
      );
    }
  }

  /**
   * Update session intermediate summary settings
   */
  async updateSettings(
    sessionId: string,
    settings: {
      intermediateSummaryIntervalMs?: number;
      intermediateSummaryEnabled?: boolean;
    }
  ): Promise<void> {
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (settings.intermediateSummaryIntervalMs !== undefined) {
      updateData.intermediateSummaryIntervalMs = settings.intermediateSummaryIntervalMs;
    }

    if (settings.intermediateSummaryEnabled !== undefined) {
      updateData.intermediateSummaryEnabled = settings.intermediateSummaryEnabled;
    }

    await db.update(monitoringSessions).set(updateData).where(eq(monitoringSessions.id, sessionId));

    logger.info({ sessionId, settings }, "Intermediate summary settings updated");
  }
}

export const intermediateSummaryService = new IntermediateSummaryService();
