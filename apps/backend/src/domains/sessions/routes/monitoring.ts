import express, { Router, Request, Response } from "express";
import { eq, sql, desc, and, inArray, isNull, isNotNull, gte, lte } from "drizzle-orm";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { requireAuth } from "../../auth/middleware/auth.js";
import { config } from "../../../config.js";
import {
  sessionDeliveryService,
  type MultiDeliveryTarget,
} from "../services/session-delivery.service.js";
import { sessionSummarizationService } from "../services/session-summarization.service.js";
import { recapRLMService } from "../../updates/services/recap-rlm.service.js";
import { frameAnalysisService } from "../../capture/services/frame-analysis.service.js";
import { classifierService } from "../services/classifier.service.js";
import { masterStoryService } from "../../updates/services/master-story.service.js";
import { searchService } from "../../agent/services/search.service.js";
import { SessionIngestionService } from "../services/session-ingestion.service.js";
import { workstreamAggregationService } from "../../workstreams/services/workstream-aggregation.service.js";
import { workstreamRLMService } from "../../workstreams/services/workstream-rlm.service.js";
import { intermediateSummaryService } from "../services/intermediate-summary.service.js";
import { summaryRefinementService } from "../services/summary-refinement.service.js";
import type { SelectedWindowInfo, MonitoringSessionState } from "@mitable/shared";
import {
  createSessionLogger,
  CHECKPOINTS,
  SESSION_EVENTS,
} from "../../shared-infra/lib/sessionLogger.js";
import { closeAudioConnection } from "../../capture/routes/audio.js";
import { canEditSession } from "../../auth/services/permissions.service.js";
import { logger } from "../../shared-infra/lib/logger.js";
import { runBlockAnalyzer } from "../services/block-analyzer-orchestrator.service";
import { classifySession } from "../services/session-classification.service";
import { materializeSession } from "../services/activity-materializer.service";
import { cleanupStaleSessions } from "../services/stale-session-cleanup.service";

const router = Router();

/**
 * Format milliseconds into a human-readable duration string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Check if the requesting user can edit the session.
 * True if: actor owns the session, is an admin in the same org, or manages the session owner (direct or transitive).
 * Delegates to the centralized permissions service.
 */
async function isOwnerOrOrgAdmin(
  userId: string,
  session: { userId: string; organizationId: string }
): Promise<boolean> {
  if (session.userId === userId) return true;

  const [actor] = await db
    .select({ role: schema.users.role, organizationId: schema.users.organizationId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!actor) return false;

  return canEditSession(userId, session.userId, actor.role, actor.organizationId);
}

/**
 * POST /api/monitoring/sessions
 * Start a new monitoring session
 *
 * Supports optional goal context:
 * - sessionGoal: Free-text description of what user is working on
 * - linearIssueId: Optional Linear issue identifier (e.g., "LIN-341")
 * - linearIssueTitle: Optional Linear issue title
 * - linearIssueDescription: Optional Linear issue description
 * - additionalContext: Optional additional context text
 *
 * When goal context is provided, RAG is used to retrieve related docs
 * which are stored in relatedDocsContext for use during frame analysis.
 */
router.post("/sessions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  const {
    selectedWindows,
    captureIntervalMs = 30000,
    name,
    sessionType = "focused",
    // Goal context fields
    sessionGoal,
    linearIssueId,
    linearIssueTitle,
    linearIssueDescription,
    additionalContext,
  }: {
    selectedWindows: SelectedWindowInfo[];
    captureIntervalMs?: number;
    name?: string;
    sessionType?: "focused" | "passive";
    sessionGoal?: string;
    linearIssueId?: string;
    linearIssueTitle?: string;
    linearIssueDescription?: string;
    additionalContext?: string;
  } = req.body;

  // Get user's organizationId from database
  const [user] = await db
    .select({ organizationId: schema.users.organizationId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user?.organizationId) {
    res.status(400).json({
      error: "Bad Request",
      message: "User organization not found",
    });
    return;
  }

  const organizationId = user.organizationId;

  // Allow empty selectedWindows array - focus tracker will add windows dynamically
  const initialWindows = selectedWindows || [];

  try {
    // Check for existing active session
    const existingSession = await db
      .select()
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.userId, userId),
          eq(schema.monitoringSessions.status, "active")
        )
      )
      .limit(1);

    if (existingSession.length > 0) {
      res.status(409).json({
        error: "Conflict",
        message: "An active session already exists. End it before starting a new one.",
        existingSessionId: existingSession[0].id,
      });
      return;
    }

    // Build combined goal text for RAG retrieval
    const goalParts: string[] = [];
    if (linearIssueTitle) {
      goalParts.push(`${linearIssueId ? `[${linearIssueId}] ` : ""}${linearIssueTitle}`);
    }
    if (linearIssueDescription) {
      goalParts.push(linearIssueDescription.substring(0, 500)); // Limit description length
    }
    if (sessionGoal) {
      goalParts.push(sessionGoal);
    }
    if (additionalContext) {
      goalParts.push(additionalContext);
    }
    const combinedGoalText = goalParts.join("\n\n").trim();

    // Build session goal (human-readable summary)
    const computedSessionGoal =
      sessionGoal ||
      (linearIssueTitle
        ? `${linearIssueId ? `[${linearIssueId}] ` : ""}${linearIssueTitle}`
        : null);

    // Retrieve related docs via RAG if goal context is provided
    let relatedDocsContext: string | null = null;
    if (combinedGoalText) {
      try {
        const searchResponse = await searchService.search({
          query: combinedGoalText,
          organizationId,
          topK: 5,
        });

        if (searchResponse.results.length > 0) {
          // Format retrieved docs for context injection
          relatedDocsContext = searchResponse.results
            .map((r) => {
              const source =
                r.source === "slack"
                  ? `[Slack: ${r.channelName || "channel"}]`
                  : `[Notion: ${r.pageTitle || "page"}]`;
              return `${source}\n${r.text.substring(0, 400)}`;
            })
            .join("\n\n---\n\n");
        }
      } catch (ragError) {
        // RAG failure shouldn't block session creation - will log after session is created
      }
    }

    // Create new session with goal context
    const [session] = await db
      .insert(schema.monitoringSessions)
      .values({
        organizationId,
        userId,
        name: name || null,
        sessionType,
        status: "active",
        captureIntervalMs,
        selectedWindows: initialWindows as any,
        startedAt: new Date(),
        // Goal context fields
        sessionGoal: computedSessionGoal,
        linearIssueId: linearIssueId || null,
        linearIssueTitle: linearIssueTitle || null,
        linearIssueDescription: linearIssueDescription || null,
        additionalContext: additionalContext || null,
        relatedDocsContext: relatedDocsContext,
      })
      .returning();

    // Now we have sessionId, create logger and log checkpoint
    const log = createSessionLogger({
      sessionId: session.id,
      userId,
      organizationId,
    });

    log.checkpoint(CHECKPOINTS.SESSION_START, {
      sessionName: session.name,
      hasGoal: !!computedSessionGoal,
      goalPreview: computedSessionGoal?.substring(0, 100),
      hasLinearIssue: !!linearIssueId,
      linearIssueId,
      windowCount: initialWindows.length,
      hasRelatedDocs: !!relatedDocsContext,
      relatedDocsCount: relatedDocsContext ? relatedDocsContext.split("---").length : 0,
      captureIntervalMs,
    });

    log.trackEvent(SESSION_EVENTS.SESSION_STARTED, {
      hasGoal: !!computedSessionGoal,
      hasLinearIssue: !!linearIssueId,
      windowCount: initialWindows.length,
      hasRelatedDocs: !!relatedDocsContext,
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        name: session.name,
        selectedWindows: session.selectedWindows || [],
        captureIntervalMs: session.captureIntervalMs,
        startedAt: session.startedAt,
        sessionGoal: session.sessionGoal,
        linearIssueId: session.linearIssueId,
        hasRelatedDocs: !!relatedDocsContext,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCause =
      error instanceof Error && error.cause
        ? error.cause instanceof Error
          ? error.cause.message
          : String(error.cause)
        : undefined;
    logger.error(
      { error: errorMessage, cause: errorCause, userId },
      "[Monitoring] Error starting session"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: errorCause || errorMessage,
    });
  }
});

/**
 * GET /api/monitoring/sessions
 * Get paginated list of user's monitoring sessions
 */
router.get("/sessions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  // Optional date-range filtering (ISO strings)
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;

  try {
    // Build where conditions
    const conditions = [eq(schema.monitoringSessions.userId, userId)];
    if (startDate) {
      conditions.push(gte(schema.monitoringSessions.startedAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(schema.monitoringSessions.startedAt, new Date(endDate)));
    }
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.monitoringSessions)
      .where(whereClause);

    const totalPages = Math.ceil(count / limit);

    // Get sessions with totalPausedMs for duration calculation
    const sessions = await db
      .select({
        id: schema.monitoringSessions.id,
        name: schema.monitoringSessions.name,
        status: schema.monitoringSessions.status,
        summarizationProgress: schema.monitoringSessions.summarizationProgress,
        selectedWindows: schema.monitoringSessions.selectedWindows,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        totalPausedMs: schema.monitoringSessions.totalPausedMs,
        finalSummary: schema.monitoringSessions.finalSummary,
        rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
        timeBreakdown: schema.monitoringSessions.timeBreakdown,
        taskBreakdown: schema.monitoringSessions.taskBreakdown,
        deliveryStatus: schema.monitoringSessions.deliveryStatus,
        deliveryChannel: schema.monitoringSessions.deliveryChannel,
        createdAt: schema.monitoringSessions.createdAt,
      })
      .from(schema.monitoringSessions)
      .where(whereClause)
      .orderBy(desc(schema.monitoringSessions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get capture counts and per-app breakdown for all sessions in parallel
    const sessionIds = sessions.map((s) => s.id);
    const [captureCounts, appBreakdowns] =
      sessionIds.length > 0
        ? await Promise.all([
            db
              .select({
                sessionId: schema.sessionCaptures.sessionId,
                count: sql<number>`count(*)::int`,
              })
              .from(schema.sessionCaptures)
              .where(inArray(schema.sessionCaptures.sessionId, sessionIds))
              .groupBy(schema.sessionCaptures.sessionId),
            // Per-session app time: count captures per app, each ~30s of activity
            db
              .select({
                sessionId: schema.sessionCaptures.sessionId,
                appName: schema.sessionCaptures.appName,
                captureCount: sql<number>`count(*)::int`,
              })
              .from(schema.sessionCaptures)
              .where(
                and(
                  inArray(schema.sessionCaptures.sessionId, sessionIds),
                  isNotNull(schema.sessionCaptures.appName)
                )
              )
              .groupBy(schema.sessionCaptures.sessionId, schema.sessionCaptures.appName),
          ])
        : [[], []];

    // Group app capture counts by session (raw counts, not time yet)
    const appCaptureMap = new Map<string, Record<string, number>>();
    for (const row of appBreakdowns) {
      if (!row.appName) continue;
      const existing = appCaptureMap.get(row.sessionId) || {};
      existing[row.appName] = (existing[row.appName] || 0) + row.captureCount;
      appCaptureMap.set(row.sessionId, existing);
    }

    // Fallback: for sessions missing finalSummary, check session_summaries table
    const missingSummaryIds = sessions
      .filter((s) => !s.finalSummary && !s.rawActivitySummary)
      .map((s) => s.id);

    const storyFallbacks = new Map<string, string>();
    if (missingSummaryIds.length > 0) {
      const stories = await db
        .select({
          sessionId: schema.sessionSummaries.sessionId,
          narrativeSummary: schema.sessionSummaries.narrativeSummary,
        })
        .from(schema.sessionSummaries)
        .where(
          and(
            inArray(schema.sessionSummaries.sessionId, missingSummaryIds),
            eq(schema.sessionSummaries.summaryType, "master_story")
          )
        );
      for (const story of stories) {
        storyFallbacks.set(story.sessionId, story.narrativeSummary);
      }
    }

    // Build response with duration, captureCount, and timeBreakdown
    const sessionsWithDuration = sessions.map((session) => {
      const now = Date.now();
      const startTime = new Date(session.startedAt).getTime();
      const endTime = session.endedAt ? new Date(session.endedAt).getTime() : now;
      const totalMs = endTime - startTime;
      const pausedMs = session.totalPausedMs || 0;
      const activeMs = Math.max(0, totalMs - pausedMs);

      const captureCount = captureCounts.find((c) => c.sessionId === session.id)?.count || 0;

      // Use stored timeBreakdown if populated, otherwise derive from capture proportions
      const storedTb = session.timeBreakdown as Record<string, number> | null;
      const hasStoredTb = storedTb && Object.keys(storedTb).length > 0;
      let timeBreakdown: Record<string, number> | null = null;
      if (hasStoredTb) {
        timeBreakdown = storedTb;
      } else {
        const captureCounts = appCaptureMap.get(session.id);
        if (captureCounts) {
          const totalCaptures = Object.values(captureCounts).reduce((a, b) => a + b, 0);
          if (totalCaptures > 0) {
            timeBreakdown = {};
            for (const [app, count] of Object.entries(captureCounts)) {
              // Distribute activeMs proportionally by capture count
              timeBreakdown[app] = Math.round((count / totalCaptures) * activeMs);
            }
          }
        }
      }

      // Use story from session_summaries as fallback when finalSummary is missing
      const finalSummary =
        session.finalSummary ||
        session.rawActivitySummary ||
        storyFallbacks.get(session.id) ||
        null;

      return {
        ...session,
        finalSummary,
        captureCount,
        timeBreakdown,
        duration: {
          totalMs,
          activeMs,
          pausedMs,
          formatted: formatDuration(activeMs),
        },
      };
    });

    res.json({
      sessions: sessionsWithDuration,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error fetching sessions"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch sessions",
    });
  }
});

/**
 * GET /api/monitoring/sessions/active
 * Get the current active session (if any)
 */
router.get("/sessions/active", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.userId, userId),
          eq(schema.monitoringSessions.status, "active")
        )
      )
      .limit(1);

    if (!session) {
      res.json({ session: null });
      return;
    }

    // Get capture count
    const [{ count: captureCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, session.id));

    // Calculate elapsed time (excluding pauses)
    const now = Date.now();
    const startTime = new Date(session.startedAt).getTime();
    const elapsedMs = now - startTime - (session.totalPausedMs || 0);

    const sessionState: MonitoringSessionState = {
      id: session.id,
      status: session.status as any,
      name: session.name || undefined,
      selectedWindows: session.selectedWindows as SelectedWindowInfo[],
      captureIntervalMs: session.captureIntervalMs,
      startedAt: startTime,
      pausedAt: session.pausedAt ? new Date(session.pausedAt).getTime() : undefined,
      totalPausedMs: session.totalPausedMs || 0,
      captureCount,
      elapsedMs,
    };

    res.json({ session: sessionState });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error fetching active session"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch active session",
    });
  }
});

/**
 * GET /api/monitoring/sessions/:id
 * Get a specific session with full details
 */
router.get("/sessions/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, id))
      .limit(1);

    if (!session) {
      res.status(404).json({
        error: "Not Found",
        message: "Session not found",
      });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to access this session",
      });
      return;
    }

    // Get capture count
    const [{ count: captureCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, session.id));

    // Get top-k frames (those selected for export)
    const topKFrames = await db
      .select({
        id: schema.sessionCaptures.id,
        sequenceNumber: schema.sessionCaptures.sequenceNumber,
        capturedAt: schema.sessionCaptures.capturedAt,
        appName: schema.sessionCaptures.appName,
        windowTitle: schema.sessionCaptures.windowTitle,
        activityDescription: schema.sessionCaptures.activityDescription,
        importanceScore: schema.sessionCaptures.importanceScore,
        imageData: schema.sessionCaptures.imageData,
      })
      .from(schema.sessionCaptures)
      .where(
        and(
          eq(schema.sessionCaptures.sessionId, session.id),
          eq(schema.sessionCaptures.selectedForExport, true)
        )
      )
      .orderBy(desc(schema.sessionCaptures.capturedAt));

    res.json({
      session: {
        ...session,
        captureCount,
      },
      topKFrames,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId, sessionId: id },
      "[Monitoring] Error fetching session"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch session",
    });
  }
});

/**
 * PATCH /api/monitoring/sessions/:id
 * Update session (pause/resume/rename)
 */
router.patch("/sessions/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;
  const { action, name }: { action?: "pause" | "resume"; name?: string } = req.body;

  try {
    // Verify ownership
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, id))
      .limit(1);

    if (!session) {
      res.status(404).json({
        error: "Not Found",
        message: "Session not found",
      });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to modify this session",
      });
      return;
    }

    const updates: any = { updatedAt: new Date() };

    // Handle pause/resume
    if (action === "pause" && session.status === "active") {
      updates.status = "paused";
      updates.pausedAt = new Date();
    } else if (action === "resume" && session.status === "paused") {
      // Calculate additional paused time
      const pauseDuration = session.pausedAt
        ? Date.now() - new Date(session.pausedAt).getTime()
        : 0;
      updates.status = "active";
      updates.pausedAt = null;
      updates.totalPausedMs = (session.totalPausedMs || 0) + pauseDuration;
    }

    // Handle rename
    if (name !== undefined) {
      updates.name = name;
    }

    const [updated] = await db
      .update(schema.monitoringSessions)
      .set(updates)
      .where(eq(schema.monitoringSessions.id, id))
      .returning();

    // Log session state changes
    const log = createSessionLogger({ sessionId: id, userId });
    if (action === "pause") {
      log.checkpoint(CHECKPOINTS.SESSION_PAUSE, { name: updated.name });
      log.trackEvent(SESSION_EVENTS.SESSION_PAUSED, {});
    } else if (action === "resume") {
      log.checkpoint(CHECKPOINTS.SESSION_RESUME, {
        name: updated.name,
        totalPausedMs: updated.totalPausedMs,
      });
      log.trackEvent(SESSION_EVENTS.SESSION_RESUMED, {});
    }
    log.debug("Session updated", { action, name });

    res.json({
      success: true,
      session: updated,
    });
  } catch (error) {
    const log = createSessionLogger({ sessionId: id, userId });
    log.error("Error updating session", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to update session",
    });
  }
});

/**
 * POST /api/monitoring/sessions/:id/end
 * End a session and trigger summary generation
 */
router.post(
  "/sessions/:id/end",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const { autoRecap } = req.body as {
      autoRecap?: boolean;
    };

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to end this session",
        });
        return;
      }

      // Allow re-generating summary for sessions in any status except "deleted"
      if (session.status === "deleted") {
        res.status(400).json({
          error: "Bad Request",
          message: `Cannot end deleted session`,
        });
        return;
      }

      // Create session logger
      const log = createSessionLogger({
        sessionId: id,
        userId,
        organizationId: session.organizationId,
      });

      // Calculate final duration
      let endTime = new Date();
      const startTime = new Date(session.startedAt).getTime();
      let totalPausedMs = session.totalPausedMs || 0;

      // If currently paused, add remaining pause time
      if (session.status === "paused" && session.pausedAt) {
        totalPausedMs += Date.now() - new Date(session.pausedAt).getTime();
      }

      // Duration correction: if the gap between last real activity and now is
      // large (>5 min), trim endedAt to the last capture/transcript timestamp.
      // Prevents "walked away for 2 hours then hit end" from inflating duration.
      const DURATION_CORRECTION_GAP_MS = 5 * 60 * 1000; // 5 minutes
      try {
        const [lastCapture] = await db
          .select({ capturedAt: schema.sessionCaptures.capturedAt })
          .from(schema.sessionCaptures)
          .where(eq(schema.sessionCaptures.sessionId, id))
          .orderBy(sql`${schema.sessionCaptures.capturedAt} DESC`)
          .limit(1);

        let lastTranscriptMs = 0;
        try {
          const [lastTranscript] = await db
            .select({ endTime: schema.sessionTranscripts.endTime })
            .from(schema.sessionTranscripts)
            .where(eq(schema.sessionTranscripts.sessionId, id))
            .orderBy(sql`${schema.sessionTranscripts.endTime} DESC`)
            .limit(1);
          if (lastTranscript) lastTranscriptMs = new Date(lastTranscript.endTime).getTime();
        } catch {
          /* table may not exist */
        }

        const lastCaptureMs = lastCapture ? new Date(lastCapture.capturedAt).getTime() : 0;
        const lastActivityMs = Math.max(lastCaptureMs, lastTranscriptMs);

        if (lastActivityMs > 0 && endTime.getTime() - lastActivityMs > DURATION_CORRECTION_GAP_MS) {
          log.info("Duration correction: trimming endedAt to last activity", {
            originalEnd: endTime.toISOString(),
            correctedEnd: new Date(lastActivityMs).toISOString(),
            gapMinutes: Math.round((endTime.getTime() - lastActivityMs) / 60000),
          });
          endTime = new Date(lastActivityMs);
        }
      } catch (correctionError) {
        log.warn("Duration correction check failed (non-fatal)", {
          error:
            correctionError instanceof Error ? correctionError.message : String(correctionError),
        });
      }

      const activeDurationMs = endTime.getTime() - startTime - totalPausedMs;

      // Clean up in-memory workstream analysis state (session is ending, no more captures)
      workstreamRLMService.cleanupSession(id);

      // Update session status
      const [updated] = await db
        .update(schema.monitoringSessions)
        .set({
          status: "summarizing",
          summarizationProgress: "generating_title",
          endedAt: endTime,
          totalPausedMs,
          updatedAt: endTime,
        })
        .where(eq(schema.monitoringSessions.id, id))
        .returning();

      // Get capture count
      const [{ count: captureCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.sessionCaptures)
        .where(eq(schema.sessionCaptures.sessionId, id));

      // CHECKPOINT: Session end
      log.checkpoint(CHECKPOINTS.SESSION_END, {
        captureCount,
        activeDurationMs,
        totalPausedMs,
        linearIssueId: session.linearIssueId,
        previousStatus: session.status,
      });

      log.trackEvent(SESSION_EVENTS.SESSION_ENDED, {
        captureCount,
        activeDurationMs,
        totalPausedMs,
      });

      // Proactively close audio WebSocket to stop orphaned audio chunks
      closeAudioConnection(id);

      // Short-session guard: skip storyteller if not enough data
      const MIN_DURATION_MS = 3 * 60 * 1000; // 3 minutes
      const MIN_CLASSIFIED_CAPTURES = 5;

      const [{ count: classifiedCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.sessionCaptures)
        .where(
          and(
            eq(schema.sessionCaptures.sessionId, id),
            isNotNull(schema.sessionCaptures.activityDescription)
          )
        );

      if (activeDurationMs < MIN_DURATION_MS || classifiedCount < MIN_CLASSIFIED_CAPTURES) {
        log.info("Session too short for meaningful summary", {
          activeDurationMs,
          classifiedCount,
          minDurationMs: MIN_DURATION_MS,
          minClassifiedCaptures: MIN_CLASSIFIED_CAPTURES,
        });

        const friendlyMessage =
          "This session was too short to generate a meaningful summary. " +
          "For the best results, sessions should be at least 3 minutes long " +
          "with enough screen activity for analysis.";

        // Save friendly message as summary
        await db.insert(schema.sessionSummaries).values({
          sessionId: id,
          version: 1,
          summaryType: "master_story",
          narrativeSummary: friendlyMessage,
          modelUsed: "guard:short_session",
          generationTimeMs: 0,
        });

        // Update status to ready (skip storyteller entirely)
        await db
          .update(schema.monitoringSessions)
          .set({
            status: "ready",
            summarizationProgress: null,
            name: "Short session",
          })
          .where(eq(schema.monitoringSessions.id, id));

        // Schedule cleanup of imageData after 1 hour
        setTimeout(
          async () => {
            try {
              await db
                .update(schema.sessionCaptures)
                .set({ imageData: null })
                .where(eq(schema.sessionCaptures.sessionId, id));
            } catch (cleanupError) {
              log.error("Failed to clear imageData", {
                error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
              });
            }
          },
          60 * 60 * 1000
        );

        res.json({
          success: true,
          session: {
            id: updated.id,
            status: "ready",
            startedAt: updated.startedAt,
            endedAt: updated.endedAt,
            duration: {
              totalMs: endTime.getTime() - startTime,
              activeMs: activeDurationMs,
              pausedMs: totalPausedMs,
            },
            captureCount,
          },
        });
        return;
      }

      // Wait briefly for in-flight analyze-frame requests to complete before querying activities.
      // The Electron client fires analyzeFrameAsync calls that may still be writing
      // activityDescription to the DB when the end request arrives.
      const SETTLE_DELAY_MS = 5000;

      // Generate AI title and story in parallel (async, don't block response)
      new Promise((r) => setTimeout(r, SETTLE_DELAY_MS))
        .then(() =>
          Promise.all([
            // Generate session title from activity timeline
            (async () => {
              try {
                const { sessionTitleService } =
                  await import("../services/session-title.service.js");
                const aiTitle = await sessionTitleService.generateTitle(id);

                // Always set session name so UI doesn't stay stuck on "Generating title..."
                const finalTitle = aiTitle && aiTitle.trim().length > 0 ? aiTitle : "Work session";
                await db
                  .update(schema.monitoringSessions)
                  .set({ name: finalTitle })
                  .where(eq(schema.monitoringSessions.id, id));
                log.info("Session title generated", { sessionId: id, title: finalTitle });
              } catch (error) {
                log.error("Session title generation failed", {
                  error: error instanceof Error ? error.message : String(error),
                });
                // Still set a fallback name so UI doesn't hang
                await db
                  .update(schema.monitoringSessions)
                  .set({ name: "Work session" })
                  .where(eq(schema.monitoringSessions.id, id));
              }
            })(),
            // Generate master story
            (async () => {
              await db
                .update(schema.monitoringSessions)
                .set({ summarizationProgress: "analyzing_activities" })
                .where(eq(schema.monitoringSessions.id, id));
              return masterStoryService.generateStory({
                sessionId: id,
                userId,
              });
            })(),
          ])
        )
        .then(async ([_, storyResult]) => {
          log.info("Session end processing completed", { sessionId: id });

          // Refine master story and persist summary + task breakdown to DB
          const { taskBreakdown } = await sessionSummarizationService.refineAndPersistSession(
            id,
            storyResult,
            { updateProgress: true }
          );
          log.info("Session refined and persisted", {
            sessionId: id,
            taskCount: taskBreakdown.length,
          });

          // Rolling daily recap: append to today's recap or create a new one
          // Skip if client explicitly disabled auto-recap (default: enabled)
          if (autoRecap === false) {
            log.info("Auto-recap disabled by user preference, skipping", { sessionId: id });
          } else {
            try {
              const [completedSession] = await db
                .select({
                  name: schema.monitoringSessions.name,
                  sessionGoal: schema.monitoringSessions.sessionGoal,
                  startedAt: schema.monitoringSessions.startedAt,
                  endedAt: schema.monitoringSessions.endedAt,
                  totalPausedMs: schema.monitoringSessions.totalPausedMs,
                })
                .from(schema.monitoringSessions)
                .where(eq(schema.monitoringSessions.id, id))
                .limit(1);

              if (!completedSession) {
                log.warn("Recap skipped — session not found after story generation", {
                  sessionId: id,
                });
              } else {
                const sessionStart = new Date(completedSession.startedAt);
                const sessionEnd = completedSession.endedAt
                  ? new Date(completedSession.endedAt)
                  : new Date();
                const activeMinutes = Math.round(
                  Math.max(
                    0,
                    sessionEnd.getTime() -
                      sessionStart.getTime() -
                      (completedSession.totalPausedMs || 0)
                  ) / 60000
                );

                // Block shape for the recap DB row (frontend expects this)
                const newBlock = {
                  id,
                  startTime: sessionStart.toISOString(),
                  endTime: sessionEnd.toISOString(),
                  duration: activeMinutes,
                  goal: completedSession.sessionGoal || undefined,
                  sessionId: id,
                  title: completedSession.name || "Work session",
                  durationMinutes: activeMinutes,
                };

                // Check for an existing recap on the session's calendar day
                const sessionDay = new Date(completedSession.startedAt);
                const todayStart = new Date(sessionDay);
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(sessionDay);
                todayEnd.setHours(23, 59, 59, 999);

                const [existingRecap] = await db
                  .select()
                  .from(schema.recaps)
                  .where(
                    and(
                      eq(schema.recaps.userId, userId),
                      sql`${schema.recaps.createdAt} >= ${todayStart.toISOString()}`,
                      sql`${schema.recaps.createdAt} <= ${todayEnd.toISOString()}`
                    )
                  )
                  .orderBy(desc(schema.recaps.createdAt))
                  .limit(1);

                if (existingRecap) {
                  // Append new block to existing daily recap
                  const existingBlocks = (
                    Array.isArray(existingRecap.blocks) ? existingRecap.blocks : []
                  ) as Array<Record<string, unknown>>;

                  // Skip if this session was already added (idempotency guard)
                  const alreadyAdded = existingBlocks.some((b) => (b.id || b.sessionId) === id);
                  if (!alreadyAdded) {
                    const allBlocks = [...existingBlocks, newBlock];
                    const totalDuration = allBlocks.reduce(
                      (sum, b) => sum + (Number(b.duration) || Number(b.durationMinutes) || 0),
                      0
                    );

                    // Generate recap from raw classifications for ALL blocks in this recap
                    const allSessionIds = allBlocks.map((b) => String(b.id || b.sessionId));
                    const recapContent = await recapRLMService.generateRecap(allSessionIds, userId);

                    // Multi-block title: "Daily Recap — Mon DD"
                    const dateLabel = sessionDay.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                    const recapTitle = `Daily Recap — ${dateLabel}`;

                    await db
                      .update(schema.recaps)
                      .set({
                        title: recapTitle,
                        content: recapContent,
                        blocks: allBlocks,
                        totalDuration,
                        sessionId: id,
                        updatedAt: new Date(),
                      })
                      .where(eq(schema.recaps.id, existingRecap.id));

                    log.info("Updated daily recap with new block", {
                      recapId: existingRecap.id,
                      sessionId: id,
                      blockCount: allBlocks.length,
                    });
                  }
                } else {
                  // First session of the day — create new recap
                  const recapContent = await recapRLMService.generateRecap([id], userId);

                  const recapTitle = completedSession.name || "Work session recap";
                  await db.insert(schema.recaps).values({
                    userId,
                    organizationId: session.organizationId,
                    title: recapTitle,
                    content: recapContent,
                    blocks: [newBlock],
                    totalDuration: activeMinutes,
                    sessionId: id,
                  });
                  log.info("Auto-created daily recap for session", { sessionId: id });
                }
              }
            } catch (recapError) {
              log.error("Auto-recap creation failed (non-blocking)", {
                sessionId: id,
                error: recapError instanceof Error ? recapError.message : String(recapError),
              });
            }
          }

          // Run ingestion in parallel with Block Analyzer RLM
          Promise.all([
            // Chunk + embed session data
            SessionIngestionService.ingestSession(id)
              .then(async () => {
                await db
                  .update(schema.monitoringSessions)
                  .set({ ingestionStatus: "completed" })
                  .where(eq(schema.monitoringSessions.id, id));
              })
              .catch(async (error) => {
                log.error("Session ingestion failed", {
                  sessionId: id,
                  error: error instanceof Error ? error.message : String(error),
                });
                await db
                  .update(schema.monitoringSessions)
                  .set({ ingestionStatus: "failed" })
                  .where(eq(schema.monitoringSessions.id, id));
              }),
            // Block Analyzer RLM: full agentic classification → activity blocks + admin metrics
            runBlockAnalyzer(id).catch((error) => {
              log.error("Block Analyzer failed — falling back to classify → materialize", {
                sessionId: id,
                error: error instanceof Error ? error.message : String(error),
              });
              // Fallback: use the old lightweight pipeline
              return classifySession(id)
                .catch((classifyError) => {
                  log.error("Fallback classification also failed", {
                    sessionId: id,
                    error:
                      classifyError instanceof Error
                        ? classifyError.message
                        : String(classifyError),
                  });
                })
                .then(() => materializeSession(id))
                .catch((matError) => {
                  log.error("Fallback materialization also failed", {
                    sessionId: id,
                    error: matError instanceof Error ? matError.message : String(matError),
                  });
                });
            }),
          ]);
        })
        .catch(async (error) => {
          log.error("Session end processing failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          // Update status to indicate completion (even without story)
          await db
            .update(schema.monitoringSessions)
            .set({ status: "ready", summarizationProgress: null, ingestionStatus: "ingesting" })
            .where(eq(schema.monitoringSessions.id, id));

          // Still attempt recap from raw classifications even when story generation failed
          if (autoRecap !== false) {
            try {
              const [fallbackSession] = await db
                .select({
                  name: schema.monitoringSessions.name,
                  sessionGoal: schema.monitoringSessions.sessionGoal,
                  startedAt: schema.monitoringSessions.startedAt,
                  endedAt: schema.monitoringSessions.endedAt,
                  totalPausedMs: schema.monitoringSessions.totalPausedMs,
                })
                .from(schema.monitoringSessions)
                .where(eq(schema.monitoringSessions.id, id))
                .limit(1);

              if (fallbackSession) {
                const sessionStart = new Date(fallbackSession.startedAt);
                const sessionEnd = fallbackSession.endedAt
                  ? new Date(fallbackSession.endedAt)
                  : new Date();
                const activeMinutes = Math.round(
                  Math.max(
                    0,
                    sessionEnd.getTime() -
                      sessionStart.getTime() -
                      (fallbackSession.totalPausedMs || 0)
                  ) / 60000
                );

                const recapContent = await recapRLMService.generateRecap([id], userId);

                const recapTitle = fallbackSession.name || "Work session recap";
                await db.insert(schema.recaps).values({
                  userId,
                  organizationId: session.organizationId,
                  title: recapTitle,
                  content: recapContent,
                  blocks: [
                    {
                      id,
                      startTime: sessionStart.toISOString(),
                      endTime: sessionEnd.toISOString(),
                      duration: activeMinutes,
                      goal: fallbackSession.sessionGoal || undefined,
                      sessionId: id,
                      title: fallbackSession.name || "Work session",
                      durationMinutes: activeMinutes,
                    },
                  ],
                  totalDuration: activeMinutes,
                  sessionId: id,
                });
                log.info("Auto-created recap from raw classifications (story failed)", {
                  sessionId: id,
                });
              }
            } catch (recapError) {
              log.error("Fallback recap creation failed (non-blocking)", {
                sessionId: id,
                error: recapError instanceof Error ? recapError.message : String(recapError),
              });
            }
          }

          // Still run ingestion + classify → materialize even if storyteller failed
          Promise.all([
            SessionIngestionService.ingestSession(id)
              .then(async () => {
                await db
                  .update(schema.monitoringSessions)
                  .set({ ingestionStatus: "completed" })
                  .where(eq(schema.monitoringSessions.id, id));
              })
              .catch(async (ingestError) => {
                log.error("Session ingestion failed", {
                  sessionId: id,
                  error: ingestError instanceof Error ? ingestError.message : String(ingestError),
                });
                await db
                  .update(schema.monitoringSessions)
                  .set({ ingestionStatus: "failed" })
                  .where(eq(schema.monitoringSessions.id, id));
              }),
            classifySession(id)
              .catch((classifyError) => {
                log.error("Session classification failed", {
                  sessionId: id,
                  error:
                    classifyError instanceof Error ? classifyError.message : String(classifyError),
                });
              })
              .then(() => materializeSession(id))
              .catch((matError) => {
                log.error("Activity materialization failed", {
                  sessionId: id,
                  error: matError instanceof Error ? matError.message : String(matError),
                });
              }),
          ]);
        });

      // Schedule cleanup of imageData after 1 hour to free up storage
      // Screenshots are only needed for AI analysis and Slack delivery
      setTimeout(
        async () => {
          try {
            await db
              .update(schema.sessionCaptures)
              .set({ imageData: null })
              .where(eq(schema.sessionCaptures.sessionId, id));
            log.debug("Cleared imageData (1 hour cleanup)", { sessionId: id });
          } catch (cleanupError) {
            log.error("Failed to clear imageData", {
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          }
        },
        60 * 60 * 1000
      ); // 1 hour

      res.json({
        success: true,
        session: {
          id: updated.id,
          status: "summarizing",
          startedAt: updated.startedAt,
          endedAt: updated.endedAt,
          duration: {
            totalMs: endTime.getTime() - startTime,
            activeMs: activeDurationMs,
            pausedMs: totalPausedMs,
          },
          captureCount,
        },
      });
    } catch (error) {
      // Log error with session context if available
      const log = createSessionLogger({ sessionId: id, userId });
      log.error("Error ending session", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to end session",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/captures
 * Upload captures batch (from Electron)
 * Route-level 50 mb limit to accommodate 16+ base64-encoded screenshots per batch.
 */
router.post(
  "/sessions/:id/captures",
  express.json({ limit: "50mb" }),
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const {
      captures,
    }: {
      captures: Array<{
        sequenceNumber: number;
        captureTrigger: "periodic" | "focus_change" | "manual";
        capturedAt: number;
        windowId?: string;
        appName?: string;
        windowTitle?: string;
        screenshotPath?: string;
        screenshotHash?: string;
        imageData?: string;
        // Analysis metadata (from frame analysis)
        deltaChanged?: boolean;
        deltaChangeType?: string;
        deltaChangeDescription?: string;
        deltaUserAction?: string;
        onTask?: boolean;
        taskRelevance?: string;
        importanceScore?: number;
        importanceReason?: string;
      }>;
    } = req.body;

    if (!captures || captures.length === 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "No captures provided",
      });
      return;
    }

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to add captures to this session",
        });
        return;
      }

      // Insert captures with imageData and analysis metadata
      const insertedCaptures = await db
        .insert(schema.sessionCaptures)
        .values(
          captures.map((c) => ({
            sessionId: id,
            sequenceNumber: c.sequenceNumber,
            captureTrigger: c.captureTrigger,
            capturedAt: new Date(c.capturedAt),
            windowId: c.windowId || null,
            appName: c.appName || null,
            windowTitle: c.windowTitle || null,
            screenshotPath: c.screenshotPath || null,
            screenshotHash: c.screenshotHash || null,
            imageData: c.imageData || null,
            analysisStatus: c.deltaChanged !== undefined ? "analyzed" : "pending",
            // Analysis metadata
            deltaChanged: c.deltaChanged ?? false,
            deltaChangeType: c.deltaChangeType || null,
            deltaChangeDescription: c.deltaChangeDescription || null,
            deltaUserAction: c.deltaUserAction || null,
            onTask: c.onTask ?? true,
            taskRelevance: c.taskRelevance || null,
            importanceScore: c.importanceScore ?? 0,
            importanceReason: c.importanceReason || null,
            selectedForExport: true, // These are Top-K frames being uploaded
          }))
        )
        .returning({ id: schema.sessionCaptures.id });

      const log = createSessionLogger({ sessionId: id, userId });
      log.debug("Captures added", {
        insertedCount: insertedCaptures.length,
        hasAnalyzedFrames: captures.some((c: any) => c.deltaChanged !== undefined),
      });

      // Trigger intermediate summary check (non-blocking)
      intermediateSummaryService.checkAndTriggerIfNeeded(id);

      res.json({
        success: true,
        insertedCount: insertedCaptures.length,
      });
    } catch (error) {
      const log = createSessionLogger({ sessionId: id, userId });
      log.error("Error adding captures", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to add captures",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/analyze-frame
 * Analyze a frame using delta detection (Groq Vision)
 * Compares current frame with previous frame to detect meaningful changes
 */
router.post(
  "/sessions/:id/analyze-frame",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const {
      frameId,
      currentImage,
      previousImage,
      windowInfo,
      // Optional capture metadata for database record creation/update
      sequenceNumber,
      captureTrigger,
      capturedAt,
      // Optional activity metadata from Electron
      intervalEvidence,
      // Optional browser context from browser bridge
      browserContext,
    }: {
      frameId: string;
      currentImage: string; // Base64 image data
      previousImage: string | null; // Base64 image data (null for first frame)
      windowInfo: {
        windowSourceId: string;
        appName: string;
        windowTitle: string;
      };
      sequenceNumber?: number;
      captureTrigger?: "periodic" | "focus_change" | "manual";
      capturedAt?: number; // Unix timestamp in ms
      intervalEvidence?: {
        keyboardEventCount: number;
        copyCount: number;
        pasteCount: number;
        cutCount: number;
        mouseClickCount: number;
        mouseScrollCount: number;
      };
      browserContext?: {
        activeTabUrl: string;
        activeTabTitle: string;
        tabCount: number;
      };
    } = req.body;

    if (!frameId || !currentImage || !windowInfo) {
      res.status(400).json({
        error: "Bad Request",
        message: "frameId, currentImage, and windowInfo are required",
      });
      return;
    }

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this session",
        });
        return;
      }

      // Reject captures for sessions that are no longer active
      if (
        session.status !== "active" &&
        session.status !== "paused" &&
        session.status !== "summarizing"
      ) {
        res.status(409).json({
          error: "Conflict",
          message: `Session is already ${session.status}. Cannot accept new captures.`,
        });
        return;
      }

      // Create session logger for frame analysis
      const log = createSessionLogger({
        sessionId: id,
        userId,
        organizationId: session.organizationId,
      });

      // Check if frame analysis service is available
      if (!frameAnalysisService.isAvailable()) {
        log.warn("Frame analysis service not available (no GEMINI_API_KEY)", { frameId });
        // Return default analysis when service unavailable
        res.json({
          success: true,
          analysis: {
            frameId,
            progressionDetected: previousImage === null,
            summaryOfAction: previousImage === null ? "Session started" : "Analysis unavailable",
            deltaChanged: previousImage === null,
            changeType: "none",
            changeMagnitude: "trivial",
            changeDescription: previousImage === null ? "First frame" : "Service unavailable",
            onTask: true, // Default to on-task when unavailable
            taskRelevance: null,
            importanceScore: previousImage === null ? 0.5 : 0.3, // Default scores
            importanceReason: "Default scoring (analysis service unavailable)",
            confidence: 0.5,
          },
        });
        return;
      }

      // Log activity evidence if available
      if (intervalEvidence) {
        log.info("📊 Activity Evidence Received:", {
          frameId,
          evidence: {
            keyboard: intervalEvidence.keyboardEventCount,
            copy: intervalEvidence.copyCount,
            paste: intervalEvidence.pasteCount,
            cut: intervalEvidence.cutCount,
            clicks: intervalEvidence.mouseClickCount,
            scrolls: intervalEvidence.mouseScrollCount,
          },
        });
      } else {
        log.debug("No activity evidence provided for this frame", { frameId });
      }

      // Step 1: Analyze frame with Sensor (detect visual delta)
      const analysisResult = await frameAnalysisService.analyzeFrame({
        sessionId: id,
        frameId,
        currentFrame: currentImage,
        previousFrame: previousImage,
        windowInfo,
        timestamp: new Date().toISOString(),
        browserContext,
      });

      // Step 2: Classify activity using Classifier (interpret delta into meaningful activity)
      let activityDescription: string | null = null;
      let classifierConfidence: number = analysisResult.confidence;
      let classifierData: any = null;

      // Only call Classifier if there's a meaningful delta change
      if (analysisResult.deltaChanged && analysisResult.changeDescription) {
        try {
          const classifierResult = await classifierService.classifyActivity({
            userId,
            sessionId: id,
            deltaDescription: analysisResult.changeDescription,
            sceneContext: analysisResult.sceneContext,
            frameId,
            captureTimestamp: new Date(), // Current timestamp for audio context matching
            windowInfo: {
              appName: windowInfo.appName,
              windowTitle: windowInfo.windowTitle,
            },
            intervalEvidence,
          });

          if (classifierResult) {
            activityDescription = classifierResult.activity;
            classifierConfidence = classifierResult.confidence;

            // Store full structured output for Storyteller
            classifierData = {
              actionType: classifierResult.actionType,
              events: classifierResult.events || [],
              entities: classifierResult.entities || { people: [], systems: [] },
              metrics: classifierResult.metrics || {
                messages_composed: 0,
                links_opened: 0,
                pastes_performed: 0,
              },
              isContinuation: classifierResult.isContinuation,
            };

            log.debug("Activity classified", {
              frameId,
              activity: activityDescription,
              confidence: classifierConfidence,
              actionType: classifierResult.actionType,
              hasEvents: !!classifierResult.events,
              hasEntities: !!classifierResult.entities,
            });
          }
        } catch (error) {
          log.warn("Classifier failed, using sensor delta as fallback", {
            frameId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Fallback to sensor delta description
          activityDescription = analysisResult.changeDescription;
        }
      } else {
        // No delta change, use sensor description as fallback
        activityDescription = analysisResult.changeDescription || null;
      }

      // Step 3: Create or update database capture record if metadata provided
      let captureId: string | null = null;
      if (sequenceNumber !== undefined && captureTrigger && capturedAt !== undefined) {
        try {
          // Try to find existing capture by sequenceNumber and sessionId
          const [existingCapture] = await db
            .select({ id: schema.sessionCaptures.id })
            .from(schema.sessionCaptures)
            .where(
              and(
                eq(schema.sessionCaptures.sessionId, id),
                eq(schema.sessionCaptures.sequenceNumber, sequenceNumber)
              )
            )
            .limit(1);

          if (existingCapture) {
            // Update existing capture with analysis results
            captureId = existingCapture.id;
            await db
              .update(schema.sessionCaptures)
              .set({
                analysisStatus: "analyzed",
                activityDescription,
                confidence: String(classifierConfidence),
                classifierData: classifierData ? JSON.stringify(classifierData) : null,
                deltaChanged: analysisResult.deltaChanged,
                deltaChangeType: analysisResult.changeType || null,
                deltaChangeDescription: analysisResult.changeDescription || null,
                importanceScore: calculateImportanceScore(analysisResult),
              })
              .where(eq(schema.sessionCaptures.id, captureId));

            log.debug("Updated database capture record", { captureId, sequenceNumber });
          } else {
            // Create new capture record
            const [newCapture] = await db
              .insert(schema.sessionCaptures)
              .values({
                sessionId: id,
                sequenceNumber,
                captureTrigger,
                capturedAt: new Date(capturedAt),
                windowId: windowInfo.windowSourceId || null,
                appName: windowInfo.appName || null,
                windowTitle: windowInfo.windowTitle || null,
                analysisStatus: "analyzed",
                activityDescription,
                confidence: String(classifierConfidence),
                classifierData: classifierData ? JSON.stringify(classifierData) : null,
                deltaChanged: analysisResult.deltaChanged,
                deltaChangeType: analysisResult.changeType || null,
                deltaChangeDescription: analysisResult.changeDescription || null,
                importanceScore: calculateImportanceScore(analysisResult),
              })
              .returning({ id: schema.sessionCaptures.id });

            captureId = newCapture.id;
            log.debug("Created database capture record", { captureId, sequenceNumber });
          }

          // Trigger workstream RLM analysis check (non-blocking)
          if (captureId) {
            workstreamRLMService
              .onCaptureAdded(id, {
                id: captureId,
                capturedAt: new Date(capturedAt),
                appName: windowInfo.appName,
                windowTitle: windowInfo.windowTitle,
                activityDescription,
                workstreamId: null,
              })
              .catch((err) => {
                log.warn("Workstream RLM check failed (non-blocking)", {
                  captureId,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
          }
        } catch (error) {
          log.warn("Failed to create/update database capture record", {
            frameId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue even if DB update fails - analysis still succeeded
        }
      }

      // Calculate importance score based on analysis
      const importanceScore = calculateImportanceScore(analysisResult);

      // Note: Master story is now generated at session end, not during each frame capture

      log.debug("Frame analyzed", {
        frameId,
        captureId,
        progressionDetected: analysisResult.progressionDetected,
        changeType: analysisResult.changeType,
        changeMagnitude: analysisResult.changeMagnitude,
        activityDescription,
        importanceScore,
        latencyMs: analysisResult.analysisLatencyMs,
      });

      res.json({
        success: true,
        analysis: {
          frameId: analysisResult.frameId,
          captureId, // Return database capture ID if created/updated
          progressionDetected: analysisResult.progressionDetected,
          summaryOfAction: activityDescription || analysisResult.summaryOfAction, // Use classified activity
          activityDescription, // Include classified activity description
          deltaChanged: analysisResult.deltaChanged,
          changeType: analysisResult.changeType,
          changeMagnitude: analysisResult.changeMagnitude,
          changeDescription: analysisResult.changeDescription,
          // Enhanced analysis fields - now using real values from LLM
          artifacts: analysisResult.artifacts,
          signals: analysisResult.signals,
          onTask: analysisResult.onTask,
          taskRelevance: analysisResult.taskRelevance,
          offTaskReason: analysisResult.offTaskReason,
          importanceScore,
          importanceReason: getImportanceReason(analysisResult, importanceScore),
          confidence: classifierConfidence, // Use classifier confidence
          model: analysisResult.model,
          latencyMs: analysisResult.analysisLatencyMs,
        },
      });
    } catch (error) {
      const log = createSessionLogger({ sessionId: id, userId });
      log.error("Error analyzing frame", {
        frameId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to analyze frame",
      });
    }
  }
);

/**
 * Calculate importance score (0-1) based on frame analysis
 * Uses observable change types, magnitudes, and semantic signals
 */
function calculateImportanceScore(
  analysis: {
    progressionDetected: boolean;
    deltaChanged: boolean;
    changeType: string;
    changeMagnitude: string;
    // Enhanced fields
    artifacts?: Array<{ type: string; value: string }>;
    signals?: {
      has_blocker?: boolean;
      has_outcome?: boolean;
      blocker_type?: string | null;
      outcome_type?: string | null;
    };
    onTask?: boolean;
    taskRelevance?: number;
  },
  _sessionGoal?: string
): number {
  let score = 0.3; // Base score

  // Progression detected is a strong signal
  if (analysis.progressionDetected) {
    score += 0.15;
  }

  // Change magnitude affects score
  switch (analysis.changeMagnitude) {
    case "major":
      score += 0.2;
      break;
    case "minor":
      score += 0.1;
      break;
    case "trivial":
      score += 0.03;
      break;
  }

  // Change type affects score (observable outcomes only)
  if (analysis.deltaChanged) {
    switch (analysis.changeType) {
      case "content_addition":
        score += 0.15; // New content is high value
        break;
      case "content_modification":
        score += 0.12; // Edits are valuable
        break;
      case "content_deletion":
        score += 0.1; // Deletions matter
        break;
      case "navigation":
      case "file_switch":
        score += 0.1; // Context changes
        break;
      case "focus_change":
        score += 0.05; // Window switches
        break;
      case "ui_state_change":
        score += 0.05; // UI interactions
        break;
      case "scroll":
        score += 0.02; // Passive viewing
        break;
      case "none":
        score += 0.0; // No change
        break;
      default:
        score += 0.05;
    }
  }

  // === SEMANTIC SIGNAL BONUSES (high-value moments) ===

  // Blocker detected (error, failing test, exception) - important to capture!
  if (analysis.signals?.has_blocker) {
    score += 0.25;
  }

  // Outcome detected (success, merged, deployed, sent) - high-value completion
  if (analysis.signals?.has_outcome) {
    score += 0.25;
  }

  // Artifacts extracted (PR numbers, ticket IDs, etc.) - concrete references
  if (analysis.artifacts && analysis.artifacts.length > 0) {
    score += 0.1 + Math.min(0.1, analysis.artifacts.length * 0.03);
  }

  // Task relevance bonus (when goal is set and activity is on-task)
  if (analysis.onTask !== false && analysis.taskRelevance !== undefined) {
    score += analysis.taskRelevance * 0.15; // Up to +0.15 for highly relevant work
  }

  // Off-task penalty
  if (analysis.onTask === false) {
    score -= 0.2;
  }

  // Clamp to 0-1 range
  return Math.min(1, Math.max(0, score));
}

/**
 * Generate human-readable importance reason
 */
function getImportanceReason(
  analysis: {
    progressionDetected: boolean;
    deltaChanged: boolean;
    changeType: string;
    changeMagnitude: string;
    summaryOfAction: string;
    signals?: {
      has_blocker?: boolean;
      has_outcome?: boolean;
      blocker_type?: string | null;
      outcome_type?: string | null;
    };
    artifacts?: Array<{ type: string; value: string }>;
    onTask?: boolean;
  },
  score: number
): string {
  // Build reason based on what made it important
  const reasons: string[] = [];

  if (analysis.signals?.has_blocker) {
    reasons.push(`blocker detected (${analysis.signals.blocker_type || "error"})`);
  }
  if (analysis.signals?.has_outcome) {
    reasons.push(`outcome achieved (${analysis.signals.outcome_type || "success"})`);
  }
  if (analysis.artifacts && analysis.artifacts.length > 0) {
    const artifactTypes = [...new Set(analysis.artifacts.map((a) => a.type))];
    reasons.push(`artifacts: ${artifactTypes.join(", ")}`);
  }
  if (analysis.onTask === false) {
    reasons.push("off-task activity");
  }

  if (score >= 0.7) {
    const detail = reasons.length > 0 ? ` (${reasons.join("; ")})` : "";
    return `High importance: ${analysis.summaryOfAction}${detail}`;
  } else if (score >= 0.4) {
    const detail = reasons.length > 0 ? ` - ${reasons.join("; ")}` : "";
    return `Medium importance: ${analysis.changeType} (${analysis.changeMagnitude})${detail}`;
  } else {
    return `Low importance: ${analysis.deltaChanged ? "Minor change" : "No significant change"}`;
  }
}

/**
 * GET /api/monitoring/sessions/:id/captures
 * Get capture timeline for a session
 */
router.get(
  "/sessions/:id/captures",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this session",
        });
        return;
      }

      const captures = await db
        .select({
          id: schema.sessionCaptures.id,
          sequenceNumber: schema.sessionCaptures.sequenceNumber,
          captureTrigger: schema.sessionCaptures.captureTrigger,
          capturedAt: schema.sessionCaptures.capturedAt,
          appName: schema.sessionCaptures.appName,
          windowTitle: schema.sessionCaptures.windowTitle,
          analysisStatus: schema.sessionCaptures.analysisStatus,
          activityDescription: schema.sessionCaptures.activityDescription,
          deltaChangeDescription: schema.sessionCaptures.deltaChangeDescription,
          confidence: schema.sessionCaptures.confidence,
          imageData: schema.sessionCaptures.imageData,
        })
        .from(schema.sessionCaptures)
        .where(eq(schema.sessionCaptures.sessionId, id))
        .orderBy(schema.sessionCaptures.sequenceNumber);

      res.json({ captures });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error fetching captures"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch captures",
      });
    }
  }
);

/**
 * GET /api/monitoring/sessions/:id/workstreams
 * Get aggregated workstreams for a session with timeline visualization data
 *
 * Reads from session_workstreams table if RLM has analyzed the session,
 * otherwise falls back to heuristic aggregation.
 *
 * Returns:
 * - workstreams: Array of workstream objects with segments, apps used, and capture counts
 * - sessionStats: Session statistics (total time, deep work, interruptions, etc.)
 * - sessionStartTime: ISO timestamp of session start
 * - sessionEndTime: ISO timestamp of session end
 * - analysisSource: "rlm" or "heuristic" - indicates how workstreams were generated
 */
router.get(
  "/sessions/:id/workstreams",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this session",
        });
        return;
      }

      // Check if we have RLM-generated workstreams
      const rlmWorkstreams = await db
        .select()
        .from(schema.sessionWorkstreams)
        .where(
          and(
            eq(schema.sessionWorkstreams.sessionId, id),
            isNull(schema.sessionWorkstreams.isMergedInto)
          )
        );

      // Fetch captures for this session
      const captures = await db
        .select({
          id: schema.sessionCaptures.id,
          capturedAt: schema.sessionCaptures.capturedAt,
          appName: schema.sessionCaptures.appName,
          windowTitle: schema.sessionCaptures.windowTitle,
          activityDescription: schema.sessionCaptures.activityDescription,
          deltaChangeDescription: schema.sessionCaptures.deltaChangeDescription,
          workstreamId: schema.sessionCaptures.workstreamId,
        })
        .from(schema.sessionCaptures)
        .where(eq(schema.sessionCaptures.sessionId, id))
        .orderBy(schema.sessionCaptures.sequenceNumber);

      // Session time bounds
      const sorted = [...captures].sort(
        (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
      );
      const sessionStartTime = sorted[0]?.capturedAt
        ? new Date(sorted[0].capturedAt).toISOString()
        : new Date().toISOString();
      const sessionEndTime = sorted[sorted.length - 1]?.capturedAt
        ? new Date(sorted[sorted.length - 1].capturedAt).toISOString()
        : sessionStartTime;

      // If RLM workstreams exist, use them
      if (rlmWorkstreams.length > 0) {
        const workstreamsResult = workstreamAggregationService.aggregateFromRLMWorkstreams(
          rlmWorkstreams,
          captures,
          sessionStartTime,
          sessionEndTime
        );

        res.json({
          ...workstreamsResult,
          analysisSource: "rlm",
        });
        return;
      }

      // Fallback to heuristic aggregation
      const result = workstreamAggregationService.aggregateWorkstreams(captures, {
        linearIssueId: session.linearIssueId,
        linearIssueTitle: session.linearIssueTitle,
      });

      res.json({
        ...result,
        analysisSource: "heuristic",
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error fetching workstreams"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch workstreams",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/workstreams/analyze
 * Force immediate RLM analysis of workstreams
 *
 * Use this when opening the timeline view to ensure workstreams are up-to-date
 */
router.post(
  "/sessions/:id/workstreams/analyze",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to analyze this session",
        });
        return;
      }

      // Trigger force analysis (with force=true to clear existing and re-analyze all)
      await workstreamRLMService.forceAnalysis(id, { force: true });

      // Fetch updated workstreams
      const workstreams = await db
        .select()
        .from(schema.sessionWorkstreams)
        .where(
          and(
            eq(schema.sessionWorkstreams.sessionId, id),
            isNull(schema.sessionWorkstreams.isMergedInto)
          )
        );

      res.json({
        success: true,
        message: "Workstream analysis completed",
        workstreamCount: workstreams.length,
        workstreams: workstreams.map((w) => ({
          id: w.id,
          name: w.name,
          color: w.color,
          category: w.category,
          summary: w.summary,
          captureCount: w.captureCount,
          totalDurationMinutes: w.totalDurationMinutes,
          appsUsed: w.appsUsed,
          isProvisional: w.isProvisional,
        })),
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error analyzing workstreams"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to analyze workstreams",
      });
    }
  }
);

/**
 * GET /api/monitoring/sessions/:id/workstreams/analysis-log
 * Get history of RLM workstream analyses for debugging
 */
router.get(
  "/sessions/:id/workstreams/analysis-log",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this session",
        });
        return;
      }

      // Fetch analysis log
      const analysisLog = await db
        .select()
        .from(schema.workstreamAnalysisLog)
        .where(eq(schema.workstreamAnalysisLog.sessionId, id))
        .orderBy(desc(schema.workstreamAnalysisLog.createdAt));

      res.json({
        analysisLog: analysisLog.map((log) => ({
          id: log.id,
          analysisNumber: log.analysisNumber,
          triggerReason: log.triggerReason,
          capturesAnalyzed: log.capturesAnalyzed,
          modelUsed: log.modelUsed,
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
          executionTimeMs: log.executionTimeMs,
          workstreamsCreated: log.workstreamsCreated,
          workstreamsMerged: log.workstreamsMerged,
          capturesReassigned: log.capturesReassigned,
          success: log.success,
          error: log.error,
          createdAt: log.createdAt,
        })),
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error fetching analysis log"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch analysis log",
      });
    }
  }
);

/**
 * GET /api/monitoring/sessions/:id/summary
 * Get the current summary for a session
 */
router.get(
  "/sessions/:id/summary",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this session",
        });
        return;
      }

      // Get latest summary
      const [summary] = await db
        .select()
        .from(schema.sessionSummaries)
        .where(eq(schema.sessionSummaries.sessionId, id))
        .orderBy(desc(schema.sessionSummaries.version))
        .limit(1);

      res.json({
        summary: summary || null,
        rawSummary: session.rawActivitySummary,
        finalSummary: session.finalSummary,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error fetching summary"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch summary",
      });
    }
  }
);

/**
 * GET /api/monitoring/sessions/:id/story
 * Get the master story for a session
 * The master story is generated at session end based on the activity timeline
 */
router.get(
  "/sessions/:id/story",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this session",
        });
        return;
      }

      // Get current master story and metadata
      const story = await masterStoryService.getCurrentStory(id);
      const metadata = await masterStoryService.getStoryMetadata(id);

      // For active/paused sessions, return intermediate summary if available
      const isLiveSession = session.status === "active" || session.status === "paused";
      const intermediateSummary = isLiveSession ? session.intermediateSummary : null;
      const lastIntermediateSummaryAt = isLiveSession ? session.lastIntermediateSummaryAt : null;
      const intermediateSummaryStatus = isLiveSession ? session.intermediateSummaryStatus : null;

      res.json({
        story: story || intermediateSummary || "",
        metadata: metadata || {
          version: 0,
          length: intermediateSummary?.length || 0,
          lastUpdated: lastIntermediateSummaryAt || null,
          totalTokens: 0,
        },
        // Include intermediate summary specific fields for live sessions
        intermediateSummary: isLiveSession
          ? {
              content: intermediateSummary || null,
              lastUpdatedAt: lastIntermediateSummaryAt || null,
              status: intermediateSummaryStatus || null,
              intervalMs: session.intermediateSummaryIntervalMs,
              enabled: session.intermediateSummaryEnabled,
            }
          : null,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error fetching story"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch story",
      });
    }
  }
);

/**
 * PATCH /api/monitoring/sessions/:id/summary
 * Update the summary (user edits)
 */
router.patch(
  "/sessions/:id/summary",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const { finalSummary }: { finalSummary: string } = req.body;

    if (!finalSummary) {
      res.status(400).json({
        error: "Bad Request",
        message: "finalSummary is required",
      });
      return;
    }

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (!(await isOwnerOrOrgAdmin(userId, session))) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to modify this session",
        });
        return;
      }

      // Compute session duration for task breakdown re-parse
      const startMs = new Date(session.startedAt).getTime();
      const endMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
      const totalMinutes = Math.round(
        Math.max(0, endMs - startMs - (session.totalPausedMs || 0)) / 60000
      );

      // Re-parse task breakdown from edited summary (AI call)
      const taskBreakdown = await sessionSummarizationService.parseTaskBreakdownFromSummary(
        finalSummary,
        totalMinutes
      );

      // Update session with edited summary + re-parsed task breakdown
      await db
        .update(schema.monitoringSessions)
        .set({
          finalSummary,
          taskBreakdown,
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      // Create new summary version
      const [newSummary] = await db
        .insert(schema.sessionSummaries)
        .values({
          sessionId: id,
          version:
            (await db
              .select({ max: sql<number>`COALESCE(MAX(version), 0)` })
              .from(schema.sessionSummaries)
              .where(eq(schema.sessionSummaries.sessionId, id))
              .then((r) => r[0]?.max || 0)) + 1,
          summaryType: "user_edited",
          narrativeSummary: finalSummary,
          activities: [],
        })
        .returning();

      const log = createSessionLogger({ sessionId: id, userId });
      log.info("Summary updated by user", {
        version: newSummary.version,
        taskCount: taskBreakdown.length,
      });

      res.json({
        success: true,
        summary: newSummary,
        taskBreakdown,
      });
    } catch (error) {
      const log = createSessionLogger({ sessionId: id, userId });
      log.error("Error updating summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to update summary",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/summary/revise
 * AI-assisted summary revision
 */
router.post(
  "/sessions/:id/summary/revise",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const { instruction, currentSummary }: { instruction: string; currentSummary: string } =
      req.body;

    if (!instruction || !currentSummary) {
      res.status(400).json({
        error: "Bad Request",
        message: "instruction and currentSummary are required",
      });
      return;
    }

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (!(await isOwnerOrOrgAdmin(userId, session))) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to revise this session",
        });
        return;
      }

      // Generate revised summary using AI
      const suggestion = await sessionSummarizationService.reviseSummary(
        currentSummary,
        instruction
      );

      const log = createSessionLogger({ sessionId: id, userId });
      log.info("Summary revision generated", { instructionLength: instruction.length });

      res.json({ suggestion });
    } catch (error) {
      const log = createSessionLogger({ sessionId: id, userId });
      log.error("Error revising summary", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to revise summary",
      });
    }
  }
);

/**
 * PUT /api/monitoring/sessions/:id/summary/chat/save
 * Save chat messages without calling AI (e.g., after applying a suggestion)
 */
router.put(
  "/sessions/:id/summary/chat/save",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Bad Request", message: "messages array is required" });
      return;
    }

    try {
      await db
        .insert(schema.sessionRefinementChats)
        .values({ sessionId: id, userId, messages })
        .onConflictDoUpdate({
          target: [schema.sessionRefinementChats.sessionId, schema.sessionRefinementChats.userId],
          set: { messages, updatedAt: new Date() },
        });

      res.json({ saved: true });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error", message: "Failed to save chat" });
    }
  }
);

/**
 * GET /api/monitoring/sessions/:id/summary/chat
 * Load persisted refinement chat history for a session
 */
router.get(
  "/sessions/:id/summary/chat",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      const chat = await db.query.sessionRefinementChats.findFirst({
        where: and(
          eq(schema.sessionRefinementChats.sessionId, id),
          eq(schema.sessionRefinementChats.userId, userId)
        ),
      });

      res.json({
        messages: chat?.messages ?? [],
        updatedAt: chat?.updatedAt ?? null,
      });
    } catch (error) {
      const log = createSessionLogger({ sessionId: id, userId });
      log.error("Error loading refinement chat", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to load chat history",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/summary/chat
 * Conversational summary refinement with AI
 */
router.post(
  "/sessions/:id/summary/chat",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const organizationId = req.organizationId!;
    const { id } = req.params;
    const { messages, currentSummary } = req.body;

    if (!messages || !Array.isArray(messages) || !currentSummary) {
      res.status(400).json({
        error: "Bad Request",
        message: "messages (array) and currentSummary are required",
      });
      return;
    }

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "Not Found", message: "Session not found" });
        return;
      }

      if (!(await isOwnerOrOrgAdmin(userId, session))) {
        res.status(403).json({ error: "Forbidden", message: "Not your session" });
        return;
      }

      const result = await summaryRefinementService.refine({
        sessionId: id,
        userId,
        orgId: organizationId,
        messages,
        currentSummary,
      });

      // Build full conversation with timestamps for persistence
      const updatedMessages = [
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || new Date().toISOString(),
        })),
        {
          role: "assistant",
          content: result.suggestedEdit
            ? `${result.message}\n\n<summary>${result.suggestedEdit}</summary>`
            : result.message,
          timestamp: new Date().toISOString(),
        },
      ];

      // Upsert chat history (one chat per session per user)
      await db
        .insert(schema.sessionRefinementChats)
        .values({
          sessionId: id,
          userId,
          messages: updatedMessages,
        })
        .onConflictDoUpdate({
          target: [schema.sessionRefinementChats.sessionId, schema.sessionRefinementChats.userId],
          set: {
            messages: updatedMessages,
            updatedAt: new Date(),
          },
        });

      const log = createSessionLogger({ sessionId: id, userId });
      log.info("Summary refinement chat", {
        messageCount: messages.length,
        hasSuggestedEdit: !!result.suggestedEdit,
        toolCallCount: result.toolCallCount,
      });

      res.json(result);
    } catch (error) {
      const log = createSessionLogger({ sessionId: req.params.id, userId });
      log.error("Error in summary refinement chat", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to refine summary",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/deliver
 * Send summary to multiple Slack channels, DMs, or email addresses
 */
router.post(
  "/sessions/:id/deliver",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const {
      channel,
      targets,
    }: {
      channel: "slack" | "email";
      targets: MultiDeliveryTarget[];
    } = req.body;

    if (!channel || !targets) {
      res.status(400).json({
        error: "Bad Request",
        message: "channel and targets are required",
      });
      return;
    }

    if (channel !== "slack" && channel !== "email") {
      res.status(400).json({
        error: "Bad Request",
        message: "channel must be 'slack' or 'email'",
      });
      return;
    }

    if (!Array.isArray(targets) || targets.length === 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "At least one target is required",
      });
      return;
    }

    // Validate each target based on channel type
    for (const target of targets) {
      if (channel === "email") {
        // Email targets need an email address
        if (!target.email) {
          res.status(400).json({
            error: "Bad Request",
            message: "Each email target must have an email address",
          });
          return;
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(target.email)) {
          res.status(400).json({
            error: "Bad Request",
            message: `Invalid email address: ${target.email}`,
          });
          return;
        }
      } else {
        // Slack targets need id and type
        if (!target.id || !target.type) {
          res.status(400).json({
            error: "Bad Request",
            message: "Each Slack target must have an id and type",
          });
          return;
        }
        if (target.type !== "channel" && target.type !== "dm") {
          res.status(400).json({
            error: "Bad Request",
            message: "Slack target type must be 'channel' or 'dm'",
          });
          return;
        }
      }
    }

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({
          error: "Not Found",
          message: "Session not found",
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to deliver this session",
        });
        return;
      }

      if (!session.finalSummary && !session.rawActivitySummary) {
        res.status(400).json({
          error: "Bad Request",
          message: "Session has no summary to deliver",
        });
        return;
      }

      // Update delivery status to pending
      await db
        .update(schema.monitoringSessions)
        .set({
          deliveryStatus: "pending",
          deliveryChannel: channel,
          deliveryTarget: JSON.stringify(
            channel === "email" ? targets.map((t) => t.email) : targets.map((t) => t.id)
          ),
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      // Deliver to multiple targets using the session delivery service
      const result = await sessionDeliveryService.deliverToMultipleTargets({
        sessionId: id,
        targets,
      });

      // Determine overall status
      const allSucceeded = result.results.every((r) => r.status === "delivered");
      const anySucceeded = result.results.some((r) => r.status === "delivered");

      // Update session based on results
      await db
        .update(schema.monitoringSessions)
        .set({
          deliveryStatus: allSucceeded ? "delivered" : anySucceeded ? "partial" : "failed",
          deliveredAt: anySucceeded ? new Date() : null,
          deliveryError: allSucceeded
            ? null
            : result.results
                .filter((r) => r.status === "failed")
                .map((r) => `${r.email || r.name || r.id}: ${r.error}`)
                .join("; "),
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      const successCount = result.results.filter((r) => r.status === "delivered").length;
      const log = createSessionLogger({ sessionId: id, userId });
      log.info("Summary delivered", {
        successCount,
        totalCount: targets.length,
        failedCount: targets.length - successCount,
      });

      res.json({
        success: allSucceeded,
        results: result.results,
        deliveredAt: new Date().toISOString(),
      });
    } catch (error) {
      const log = createSessionLogger({ sessionId: id, userId });
      log.error("Error delivering summary", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Update as failed
      await db
        .update(schema.monitoringSessions)
        .set({
          deliveryStatus: "failed",
          deliveryError: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to deliver summary",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/mark-delivered
 * Mark a session as delivered (for Linear or other integrations)
 */
router.post(
  "/sessions/:id/mark-delivered",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "Not Found", message: "Session not found" });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: "Forbidden", message: "Not authorized" });
        return;
      }

      // Mark as delivered
      await db
        .update(schema.monitoringSessions)
        .set({
          deliveryStatus: "delivered",
          deliveredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      res.json({ success: true, deliveredAt: new Date().toISOString() });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error marking session as delivered"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to mark session as delivered",
      });
    }
  }
);

/**
 * DELETE /api/monitoring/sessions/:id
 * Delete a session
 */
router.delete("/sessions/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    // Verify ownership
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, id))
      .limit(1);

    if (!session) {
      res.status(404).json({
        error: "Not Found",
        message: "Session not found",
      });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to delete this session",
      });
      return;
    }

    // Cascading delete will remove captures and summaries
    await db.delete(schema.monitoringSessions).where(eq(schema.monitoringSessions.id, id));

    const log = createSessionLogger({ sessionId: id, userId });
    log.info("Session deleted");

    res.json({ success: true });
  } catch (error) {
    const log = createSessionLogger({ sessionId: id, userId });
    log.error("Error deleting session", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to delete session",
    });
  }
});

/**
 * POST /api/monitoring/sessions/:id/audio/start
 * Start audio recording tracking for a session
 */
router.post(
  "/sessions/:id/audio/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "Not Found", message: "Session not found" });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: "Forbidden", message: "Not authorized" });
        return;
      }

      // Start audio recording tracking
      await db
        .update(schema.monitoringSessions)
        .set({
          audioRecordingStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      logger.info({ sessionId: id }, "Audio recording started");

      res.json({ success: true, startedAt: new Date().toISOString() });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error starting audio recording"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to start audio recording",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/audio/stop
 * Stop audio recording tracking and accumulate duration
 */
router.post(
  "/sessions/:id/audio/stop",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "Not Found", message: "Session not found" });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: "Forbidden", message: "Not authorized" });
        return;
      }

      // Calculate duration if recording was active
      let newTotalMs = session.audioRecordingTotalMs || 0;
      if (session.audioRecordingStartedAt) {
        const duration = Date.now() - new Date(session.audioRecordingStartedAt).getTime();
        newTotalMs += duration;
      }

      // Stop audio recording tracking
      await db
        .update(schema.monitoringSessions)
        .set({
          audioRecordingStartedAt: null,
          audioRecordingTotalMs: newTotalMs,
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      logger.info({ sessionId: id, totalMs: newTotalMs }, "Audio recording stopped");

      res.json({ success: true, totalMs: newTotalMs });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error stopping audio recording"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to stop audio recording",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/intermediate-summary
 * Force trigger intermediate summary generation
 */
router.post(
  "/sessions/:id/intermediate-summary",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "Not Found", message: "Session not found" });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: "Forbidden", message: "Not authorized" });
        return;
      }

      // Only allow for active/paused sessions
      if (session.status !== "active" && session.status !== "paused") {
        res.status(400).json({
          error: "Bad Request",
          message: `Cannot generate intermediate summary for session with status: ${session.status}`,
        });
        return;
      }

      logger.info({ sessionId: id }, "Force triggering intermediate summary");

      const result = await intermediateSummaryService.generateIntermediateSummary(id, true);

      res.json({
        success: true,
        summary: result.summary,
        generatedAt: result.generatedAt.toISOString(),
        activityCount: result.activityCount,
        executionTimeMs: result.executionTimeMs,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error generating intermediate summary"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to generate intermediate summary",
      });
    }
  }
);

/**
 * PATCH /api/monitoring/sessions/:id/settings
 * Update session settings (including intermediate summary configuration)
 */
router.patch(
  "/sessions/:id/settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const {
      intermediateSummaryIntervalMs,
      intermediateSummaryEnabled,
    }: {
      intermediateSummaryIntervalMs?: number;
      intermediateSummaryEnabled?: boolean;
    } = req.body;

    try {
      // Verify ownership
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "Not Found", message: "Session not found" });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: "Forbidden", message: "Not authorized" });
        return;
      }

      // Validate interval if provided
      if (intermediateSummaryIntervalMs !== undefined) {
        const validIntervals = [900000, 1800000, 2700000, 3600000]; // 15, 30, 45, 60 minutes
        if (!validIntervals.includes(intermediateSummaryIntervalMs)) {
          res.status(400).json({
            error: "Bad Request",
            message: `Invalid interval. Must be one of: ${validIntervals.map((i) => i / 60000 + " minutes").join(", ")}`,
          });
          return;
        }
      }

      await intermediateSummaryService.updateSettings(id, {
        intermediateSummaryIntervalMs,
        intermediateSummaryEnabled,
      });

      // Fetch updated session
      const [updatedSession] = await db
        .select({
          intermediateSummaryIntervalMs: schema.monitoringSessions.intermediateSummaryIntervalMs,
          intermediateSummaryEnabled: schema.monitoringSessions.intermediateSummaryEnabled,
        })
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, id))
        .limit(1);

      res.json({
        success: true,
        settings: {
          intermediateSummaryIntervalMs: updatedSession.intermediateSummaryIntervalMs,
          intermediateSummaryEnabled: updatedSession.intermediateSummaryEnabled,
        },
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), sessionId: id },
        "[Monitoring] Error updating session settings"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to update session settings",
      });
    }
  }
);

/**
 * POST /api/monitoring/day-summary
 * Generate a day summary from block summaries using Groq.
 * Skips blocks that have no summary. Returns a cohesive narrative for the day.
 */
router.post("/day-summary", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { date, sessionIds }: { date?: string; sessionIds?: string[] } = req.body;

  if (!date && (!sessionIds || sessionIds.length === 0)) {
    res.status(400).json({
      error: "Bad Request",
      message: "Either date (YYYY-MM-DD) or sessionIds array is required",
    });
    return;
  }

  try {
    // Fetch sessions for the given day or session IDs
    let sessions;
    if (sessionIds && sessionIds.length > 0) {
      sessions = await db
        .select({
          id: schema.monitoringSessions.id,
          name: schema.monitoringSessions.name,
          finalSummary: schema.monitoringSessions.finalSummary,
          rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
          sessionGoal: schema.monitoringSessions.sessionGoal,
          startedAt: schema.monitoringSessions.startedAt,
          endedAt: schema.monitoringSessions.endedAt,
          totalPausedMs: schema.monitoringSessions.totalPausedMs,
        })
        .from(schema.monitoringSessions)
        .where(
          and(
            inArray(schema.monitoringSessions.id, sessionIds),
            eq(schema.monitoringSessions.userId, userId)
          )
        );
    } else {
      // Fetch by date range
      const dayStart = new Date(date + "T00:00:00.000Z");
      const dayEnd = new Date(date + "T23:59:59.999Z");
      sessions = await db
        .select({
          id: schema.monitoringSessions.id,
          name: schema.monitoringSessions.name,
          finalSummary: schema.monitoringSessions.finalSummary,
          rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
          sessionGoal: schema.monitoringSessions.sessionGoal,
          startedAt: schema.monitoringSessions.startedAt,
          endedAt: schema.monitoringSessions.endedAt,
          totalPausedMs: schema.monitoringSessions.totalPausedMs,
        })
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.userId, userId),
            sql`${schema.monitoringSessions.startedAt} >= ${dayStart.toISOString()}`,
            sql`${schema.monitoringSessions.startedAt} <= ${dayEnd.toISOString()}`
          )
        );
    }

    if (sessions.length === 0) {
      res.status(404).json({
        error: "Not Found",
        message: "No sessions found for the given date or IDs",
      });
      return;
    }

    // Build block summaries — skip blocks without a summary
    const blockSummaries = sessions
      .map((s) => {
        const summary = s.finalSummary || s.rawActivitySummary;
        if (!summary) return null;

        const startTime = new Date(s.startedAt).getTime();
        const endTime = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
        const pausedMs = s.totalPausedMs || 0;
        const activeMinutes = Math.round(Math.max(0, endTime - startTime - pausedMs) / 60000);

        return {
          name: s.name || "Work session",
          goal: s.sessionGoal,
          summary,
          durationMinutes: activeMinutes,
          startTime: new Date(s.startedAt).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
        };
      })
      .filter(Boolean) as Array<{
      name: string;
      goal: string | null;
      summary: string;
      durationMinutes: number;
      startTime: string;
    }>;

    if (blockSummaries.length === 0) {
      res.json({
        summary: null,
        message: "No blocks have summaries yet",
        skippedCount: sessions.length,
      });
      return;
    }

    // Build prompt
    const blockList = blockSummaries
      .map((b, i) => {
        const parts = [`${i + 1}. ${b.name} (${b.durationMinutes}m, started ${b.startTime})`];
        if (b.goal) parts.push(`   Goal: ${b.goal}`);
        parts.push(`   Summary: ${b.summary}`);
        return parts.join("\n");
      })
      .join("\n\n");

    const totalMinutes = blockSummaries.reduce((sum, b) => sum + b.durationMinutes, 0);
    const prompt = `Summarize the following work blocks into a single cohesive day summary.

<blocks>
${blockList}
</blocks>

<context>
Total blocks: ${blockSummaries.length} (${sessions.length - blockSummaries.length} skipped — no summary)
Total active time: ${totalMinutes} minutes
</context>

<instructions>
- Write 2-4 sentences max
- Write in third person ("The user worked on..." or use passive voice)
- Focus on what was accomplished, not individual sessions
- Combine related activities into themes
- Do not use markdown formatting — plain text only
- Be concise and factual
</instructions>

Write the day summary now:`;

    // Groq-only call
    const Groq = (await import("groq-sdk")).default;
    const groq = new Groq({ apiKey: config.groq.apiKey });
    const completion = await groq.chat.completions.create({
      model: config.groq.chatModel || "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    });

    const daySummary = completion.choices[0]?.message?.content?.trim() || null;

    res.json({
      summary: daySummary,
      blockCount: blockSummaries.length,
      skippedCount: sessions.length - blockSummaries.length,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error generating day summary"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to generate day summary",
    });
  }
});

/**
 * POST /api/monitoring/recaps/generate
 * Generate a recap from multiple session summaries using AI
 */
router.post("/recaps/generate", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const {
    sessionIds,
    tone = "professional",
    length = "standard",
  }: { sessionIds: string[]; tone?: string; length?: string } = req.body;

  if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    res.status(400).json({
      error: "Bad Request",
      message: "sessionIds array is required and must not be empty",
    });
    return;
  }

  try {
    // Verify sessions belong to this user
    const sessions = await db
      .select({ id: schema.monitoringSessions.id })
      .from(schema.monitoringSessions)
      .where(
        and(
          inArray(schema.monitoringSessions.id, sessionIds),
          eq(schema.monitoringSessions.userId, userId)
        )
      );

    if (sessions.length === 0) {
      res.status(404).json({
        error: "Not Found",
        message: "No sessions found for the provided IDs",
      });
      return;
    }

    const validSessionIds = sessions.map((s) => s.id);
    const recap = await recapRLMService.generateRecap(validSessionIds, userId, { tone, length });

    res.json({ recap });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error generating recap"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to generate recap",
    });
  }
});

/**
 * POST /api/monitoring/recaps/revise
 * Revise recap content using AI (no session ownership needed)
 */
router.post("/recaps/revise", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { instruction, currentContent }: { instruction: string; currentContent: string } = req.body;

  if (!instruction || !currentContent) {
    res.status(400).json({
      error: "Bad Request",
      message: "instruction and currentContent are required",
    });
    return;
  }

  try {
    const suggestion = await sessionSummarizationService.reviseSummary(currentContent, instruction);

    // Save the user's revision instruction as a recap style memory
    // so future auto-generated recaps match their preferred format
    const [user] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (user?.organizationId) {
      // Fire and forget — don't block the response
      sessionSummarizationService
        .saveRecapStyleMemory(userId, user.organizationId, instruction)
        .catch(() => {});
    }

    res.json({ suggestion });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "[Monitoring] Error revising recap"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to revise recap",
    });
  }
});

// ===========================
// Recap CRUD Routes
// ===========================

/**
 * GET /api/monitoring/recaps
 * List all recaps for the authenticated user (newest first)
 */
router.get("/recaps", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    const rows = await db
      .select()
      .from(schema.recaps)
      .where(eq(schema.recaps.userId, userId))
      .orderBy(desc(schema.recaps.createdAt));

    res.json({ recaps: rows });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error listing recaps"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to list recaps",
    });
  }
});

/**
 * GET /api/monitoring/recaps/:id
 * Get a single recap by ID (ownership enforced)
 */
router.get("/recaps/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    const [recap] = await db
      .select()
      .from(schema.recaps)
      .where(and(eq(schema.recaps.id, id), eq(schema.recaps.userId, userId)))
      .limit(1);

    if (!recap) {
      res.status(404).json({ error: "Not Found", message: "Recap not found" });
      return;
    }

    res.json({ recap });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error fetching recap"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch recap",
    });
  }
});

/**
 * POST /api/monitoring/recaps
 * Create a new recap
 */
router.post("/recaps", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { title, content, blocks, totalDuration, deliveries } = req.body;

  if (!title) {
    res.status(400).json({ error: "Bad Request", message: "title is required" });
    return;
  }

  // Get user's organizationId
  const [user] = await db
    .select({ organizationId: schema.users.organizationId })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user?.organizationId) {
    res.status(400).json({ error: "Bad Request", message: "User organization not found" });
    return;
  }

  try {
    const [recap] = await db
      .insert(schema.recaps)
      .values({
        userId,
        organizationId: user.organizationId,
        title,
        content: content ?? "",
        blocks: blocks ?? [],
        totalDuration: totalDuration ?? 0,
        deliveries: deliveries ?? [],
      })
      .returning();

    res.status(201).json({ recap });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error creating recap"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to create recap",
    });
  }
});

/**
 * PATCH /api/monitoring/recaps/:id
 * Update a recap (title, content, blocks, totalDuration)
 */
router.patch("/recaps/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;
  const { title, content, blocks, totalDuration } = req.body;

  try {
    // Ownership check
    const [existing] = await db
      .select({ id: schema.recaps.id })
      .from(schema.recaps)
      .where(and(eq(schema.recaps.id, id), eq(schema.recaps.userId, userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not Found", message: "Recap not found" });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (blocks !== undefined) updateData.blocks = blocks;
    if (totalDuration !== undefined) updateData.totalDuration = totalDuration;

    const [recap] = await db
      .update(schema.recaps)
      .set(updateData)
      .where(eq(schema.recaps.id, id))
      .returning();

    res.json({ recap });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error updating recap"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to update recap",
    });
  }
});

/**
 * POST /api/monitoring/recaps/:id/deliveries
 * Append a delivery entry to a recap
 */
router.post(
  "/recaps/:id/deliveries",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { id } = req.params;
    const { destination } = req.body;

    if (!destination) {
      res.status(400).json({ error: "Bad Request", message: "destination is required" });
      return;
    }

    try {
      // Fetch existing recap (ownership check)
      const [existing] = await db
        .select()
        .from(schema.recaps)
        .where(and(eq(schema.recaps.id, id), eq(schema.recaps.userId, userId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Not Found", message: "Recap not found" });
        return;
      }

      const currentDeliveries = Array.isArray(existing.deliveries) ? existing.deliveries : [];
      const newDelivery = { destination, sentAt: new Date().toISOString() };
      const updatedDeliveries = [...currentDeliveries, newDelivery];

      const [recap] = await db
        .update(schema.recaps)
        .set({ deliveries: updatedDeliveries, updatedAt: new Date() })
        .where(eq(schema.recaps.id, id))
        .returning();

      res.json({ recap });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), userId },
        "[Monitoring] Error adding delivery to recap"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to add delivery",
      });
    }
  }
);

/**
 * DELETE /api/monitoring/recaps/:id
 * Delete a recap (ownership enforced)
 */
router.delete("/recaps/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    const result = await db
      .delete(schema.recaps)
      .where(and(eq(schema.recaps.id, id), eq(schema.recaps.userId, userId)))
      .returning({ id: schema.recaps.id });

    if (result.length === 0) {
      res.status(404).json({ error: "Not Found", message: "Recap not found" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error deleting recap"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to delete recap",
    });
  }
});

/**
 * POST /api/monitoring/sessions/cleanup-stale
 * Client-triggered stale session cleanup.
 * Called on Electron app startup to catch sessions that weren't properly ended
 * (e.g., laptop closed, crash, network loss).
 * Only cleans up sessions for the requesting user.
 */
router.post(
  "/sessions/cleanup-stale",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;

    try {
      const result = await cleanupStaleSessions(userId, true);

      if (result.sessionsEnded > 0) {
        logger.info(
          { userId, ended: result.sessionsEnded },
          "Client-triggered stale session cleanup"
        );
      }

      res.json({
        success: true,
        sessionsEnded: result.sessionsEnded,
        details: result.details,
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), userId },
        "[Monitoring] Error in stale session cleanup"
      );
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to clean up stale sessions",
      });
    }
  }
);

export default router;
