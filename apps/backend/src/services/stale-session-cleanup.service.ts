/**
 * Stale Session Cleanup Service
 *
 * Detects and auto-ends sessions that were never properly closed.
 * Common causes: laptop lid closed, app crash, network loss, machine shutdown.
 *
 * Strategy:
 *   1. Find sessions with status 'active' or 'paused'
 *   2. Check if the last capture is older than MAX_CAPTURE_GAP (30 min)
 *      OR total elapsed time exceeds MAX_SESSION_DURATION (12 hours)
 *   3. Set endedAt to the last capture timestamp (real end, not current time)
 *   4. Run the activity materializer and trigger storyteller summarization
 *      if enough data exists, otherwise mark as a short session
 *
 * Triggered by:
 *   - Cron job (every 15 minutes) — catches orphans server-side
 *   - Client startup endpoint — catches stale sessions when user reopens app
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, inArray, isNotNull, sql } from "drizzle-orm";
import { createLogger } from "../domains/shared-infra/lib/logger.js";
import { materializeSession } from "./activity-materializer.service";
import { masterStoryService } from "../domains/updates/services/master-story.service";
import { sessionSummarizationService } from "./session-summarization.service";

const logger = createLogger({ context: "stale-session-cleanup" });

const MAX_SESSION_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CAPTURE_GAP_MS = 5 * 60 * 1000; // 5 minutes with no captures → stale

export interface CleanupResult {
  sessionsFound: number;
  sessionsEnded: number;
  sessionsFailed: number;
  details: { sessionId: string; userId: string; lastCaptureAge: string; endedAt: string }[];
}

/**
 * Find and end all stale sessions across the platform.
 * Called by cron and by the client-startup endpoint.
 *
 * If userId is provided, only check sessions for that user (client startup).
 * If forceEnd is true, skip staleness checks and end ALL active sessions
 * for that user — used on app startup where any active session is orphaned.
 */
export async function cleanupStaleSessions(
  userId?: string,
  forceEnd = false
): Promise<CleanupResult> {
  const result: CleanupResult = {
    sessionsFound: 0,
    sessionsEnded: 0,
    sessionsFailed: 0,
    details: [],
  };

  try {
    // Find active/paused sessions
    const conditions = [inArray(schema.monitoringSessions.status, ["active", "paused"])];
    if (userId) {
      conditions.push(eq(schema.monitoringSessions.userId, userId));
    }

    const staleCandidates = await db
      .select({
        id: schema.monitoringSessions.id,
        userId: schema.monitoringSessions.userId,
        organizationId: schema.monitoringSessions.organizationId,
        startedAt: schema.monitoringSessions.startedAt,
        status: schema.monitoringSessions.status,
        totalPausedMs: schema.monitoringSessions.totalPausedMs,
        pausedAt: schema.monitoringSessions.pausedAt,
      })
      .from(schema.monitoringSessions)
      .where(and(...conditions));

    if (staleCandidates.length === 0) return result;

    const now = Date.now();

    for (const session of staleCandidates) {
      try {
        // Get the last capture timestamp for this session
        const [lastCapture] = await db
          .select({ capturedAt: schema.sessionCaptures.capturedAt })
          .from(schema.sessionCaptures)
          .where(eq(schema.sessionCaptures.sessionId, session.id))
          .orderBy(sql`${schema.sessionCaptures.capturedAt} DESC`)
          .limit(1);

        // Also check the last audio transcript (audio can keep a session alive)
        let lastTranscriptMs = 0;
        try {
          const [lastTranscript] = await db
            .select({ endTime: schema.sessionTranscripts.endTime })
            .from(schema.sessionTranscripts)
            .where(eq(schema.sessionTranscripts.sessionId, session.id))
            .orderBy(sql`${schema.sessionTranscripts.endTime} DESC`)
            .limit(1);
          if (lastTranscript) {
            lastTranscriptMs = new Date(lastTranscript.endTime).getTime();
          }
        } catch {
          // sessionTranscripts may not exist for older sessions
        }

        const sessionStartMs = new Date(session.startedAt).getTime();
        const elapsedMs = now - sessionStartMs;
        const lastCaptureMs = lastCapture
          ? new Date(lastCapture.capturedAt).getTime()
          : sessionStartMs;

        // Last activity = the later of last capture or last transcript
        const lastActivityMs = Math.max(lastCaptureMs, lastTranscriptMs, sessionStartMs);
        const activityGapMs = now - lastActivityMs;

        // Is this session stale?
        // When forceEnd is true (app startup), skip the check — any active session is orphaned.
        const isOverDuration = elapsedMs > MAX_SESSION_DURATION_MS;
        const isActivityGapExceeded = activityGapMs > MAX_CAPTURE_GAP_MS;

        if (!forceEnd && !isOverDuration && !isActivityGapExceeded) continue;

        result.sessionsFound++;

        // End time = last activity timestamp (the real last activity, capture or audio)
        const effectiveEndTime = new Date(lastActivityMs);

        // Calculate total paused time
        let totalPausedMs = session.totalPausedMs || 0;
        if (session.status === "paused" && session.pausedAt) {
          // If paused, add time from pause start to effective end
          const pauseStart = new Date(session.pausedAt).getTime();
          const pauseEnd = effectiveEndTime.getTime();
          if (pauseEnd > pauseStart) {
            totalPausedMs += pauseEnd - pauseStart;
          }
        }

        // Check if the session qualifies for summarization before choosing status
        // (same guard thresholds as the /sessions/:id/end route)
        const MIN_DURATION_MS = 3 * 60 * 1000; // 3 minutes
        const MIN_CLASSIFIED_CAPTURES = 5;
        const activeDurationMs =
          effectiveEndTime.getTime() - new Date(session.startedAt).getTime() - totalPausedMs;

        const [{ count: classifiedCount }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.sessionCaptures)
          .where(
            and(
              eq(schema.sessionCaptures.sessionId, session.id),
              isNotNull(schema.sessionCaptures.activityDescription)
            )
          );

        const qualifiesForSummary =
          activeDurationMs >= MIN_DURATION_MS && classifiedCount >= MIN_CLASSIFIED_CAPTURES;

        // Set the right status from the start to avoid a transient "ended" state
        // that looks like a completed-but-empty session to the frontend.
        await db
          .update(schema.monitoringSessions)
          .set({
            status: qualifiesForSummary ? "summarizing" : "ended",
            endedAt: effectiveEndTime,
            totalPausedMs,
            updatedAt: new Date(),
            ...(qualifiesForSummary ? { summarizationProgress: "generating_title" } : {}),
          })
          .where(eq(schema.monitoringSessions.id, session.id));

        const reason = isOverDuration ? "duration_exceeded" : "activity_gap";
        const lastCaptureAge = `${Math.round(activityGapMs / 60000)}min ago`;

        logger.info(
          {
            sessionId: session.id,
            userId: session.userId,
            reason,
            lastCaptureAge,
            effectiveEndTime: effectiveEndTime.toISOString(),
            elapsedHours: Math.round((elapsedMs / 3600000) * 10) / 10,
          },
          "Auto-ending stale session"
        );

        // Run the materializer to process whatever captures exist
        try {
          await materializeSession(session.id);
          logger.info({ sessionId: session.id }, "Materialized stale session successfully");
        } catch (matError) {
          logger.warn(
            { sessionId: session.id, error: String(matError) },
            "Materializer failed for stale session (non-fatal)"
          );
        }

        if (qualifiesForSummary) {
          // Session qualifies — fire async summarization (don't block cleanup loop)
          triggerSummarization(session.id, session.userId).catch((err) => {
            logger.error(
              { sessionId: session.id, error: String(err) },
              "Stale session summarization trigger failed"
            );
          });
        } else {
          // Short session — insert a friendly summary row (matches /end route behavior)
          logger.info(
            { sessionId: session.id, activeDurationMs, classifiedCount },
            "Stale session too short for summarization"
          );

          const friendlyMessage =
            "This session was too short to generate a meaningful summary. " +
            "For the best results, sessions should be at least 3 minutes long " +
            "with enough screen activity for analysis.";

          await db.insert(schema.sessionSummaries).values({
            sessionId: session.id,
            version: 1,
            summaryType: "master_story",
            narrativeSummary: friendlyMessage,
            modelUsed: "guard:short_session",
            generationTimeMs: 0,
          });

          await db
            .update(schema.monitoringSessions)
            .set({ status: "ready", name: "Short session", summarizationProgress: null })
            .where(eq(schema.monitoringSessions.id, session.id));
        }

        result.sessionsEnded++;
        result.details.push({
          sessionId: session.id,
          userId: session.userId,
          lastCaptureAge,
          endedAt: effectiveEndTime.toISOString(),
        });
      } catch (sessionError) {
        result.sessionsFailed++;
        logger.error(
          { sessionId: session.id, error: String(sessionError) },
          "Error processing stale session"
        );
      }
    }

    if (result.sessionsEnded > 0) {
      logger.info(
        { ended: result.sessionsEnded, failed: result.sessionsFailed },
        "Stale session cleanup completed"
      );
    }
  } catch (error) {
    logger.error({ error: String(error) }, "Stale session cleanup failed");
  }

  return result;
}

/**
 * Trigger the storyteller summarization pipeline for a stale session.
 * Mirrors the async summarization logic from POST /sessions/:id/end.
 */
async function triggerSummarization(sessionId: string, userId: string): Promise<void> {
  logger.info({ sessionId }, "Triggering summarization for stale session");

  // Status is already "summarizing" with summarizationProgress "generating_title"
  // (set by the caller before invoking this function)
  try {
    // Generate title + story in parallel (same pattern as /end route)
    const [, storyResult] = await Promise.all([
      // Generate AI session title
      (async () => {
        try {
          const { sessionTitleService } = await import("./session-title.service.js");
          const aiTitle = await sessionTitleService.generateTitle(sessionId);
          const finalTitle = aiTitle && aiTitle.trim().length > 0 ? aiTitle : "Work session";
          await db
            .update(schema.monitoringSessions)
            .set({ name: finalTitle })
            .where(eq(schema.monitoringSessions.id, sessionId));
          logger.info({ sessionId, title: finalTitle }, "Stale session title generated");
        } catch (error) {
          logger.error(
            { sessionId, error: String(error) },
            "Stale session title generation failed"
          );
          await db
            .update(schema.monitoringSessions)
            .set({ name: "Work session" })
            .where(eq(schema.monitoringSessions.id, sessionId));
        }
      })(),
      // Generate master story
      (async () => {
        await db
          .update(schema.monitoringSessions)
          .set({ summarizationProgress: "analyzing_activities" })
          .where(eq(schema.monitoringSessions.id, sessionId));
        return masterStoryService.generateStory({
          sessionId,
          userId,
        });
      })(),
    ]);

    // Refine master story and persist (shared with /end route)
    const { taskBreakdown } = await sessionSummarizationService.refineAndPersistSession(
      sessionId,
      storyResult
    );
    logger.info(
      { sessionId, taskCount: taskBreakdown.length },
      "Stale session summarization completed"
    );
  } catch (error) {
    logger.error(
      { sessionId, error: String(error) },
      "Stale session summarization failed — marking as ready anyway"
    );
    // Don't leave stuck at 'summarizing' — mark as ready even on failure
    await db
      .update(schema.monitoringSessions)
      .set({ status: "ready", summarizationProgress: null })
      .where(eq(schema.monitoringSessions.id, sessionId));
  }
}
