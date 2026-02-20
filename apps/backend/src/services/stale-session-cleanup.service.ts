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
 *   4. Mark status as 'ended' and run the activity materializer
 *
 * Triggered by:
 *   - Cron job (every 15 minutes) — catches orphans server-side
 *   - Client startup endpoint — catches stale sessions when user reopens app
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { materializeSession } from "./activity-materializer.service";

const logger = createLogger({ context: "stale-session-cleanup" });

const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_CAPTURE_GAP_MS = 30 * 60 * 1000; // 30 minutes with no captures → stale

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
 */
export async function cleanupStaleSessions(userId?: string): Promise<CleanupResult> {
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
        const isOverDuration = elapsedMs > MAX_SESSION_DURATION_MS;
        const isActivityGapExceeded = activityGapMs > MAX_CAPTURE_GAP_MS;

        if (!isOverDuration && !isActivityGapExceeded) continue;

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

        // Update session: mark as ended
        await db
          .update(schema.monitoringSessions)
          .set({
            status: "ended",
            endedAt: effectiveEndTime,
            totalPausedMs,
            updatedAt: new Date(),
            // Store the reason in the delivery error field (reuse existing column)
            // or we can add a note. For now, use deliveryStatus as a signal.
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
