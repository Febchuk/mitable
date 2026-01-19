import { Router, Request, Response } from "express";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import {
  sessionDeliveryService,
  type MultiDeliveryTarget,
} from "../services/session-delivery.service.js";
import { sessionSummarizationService } from "../services/session-summarization.service.js";
import { frameAnalysisService } from "../services/frame-analysis.service.js";
import { classifierService } from "../services/classifier.service.js";
import { masterStoryService } from "../services/master-story.service.js";
import { searchService } from "../services/search.service.js";
import type { SelectedWindowInfo, MonitoringSessionState } from "@mitable/shared";
import { createSessionLogger, CHECKPOINTS, SESSION_EVENTS } from "../lib/sessionLogger";
import { logger } from "../lib/logger";

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
    logger.error(
      { error: error instanceof Error ? error.message : String(error), userId },
      "[Monitoring] Error starting session"
    );
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to start session",
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

  try {
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.userId, userId));

    const totalPages = Math.ceil(count / limit);

    // Get sessions with totalPausedMs for duration calculation
    const sessions = await db
      .select({
        id: schema.monitoringSessions.id,
        name: schema.monitoringSessions.name,
        status: schema.monitoringSessions.status,
        selectedWindows: schema.monitoringSessions.selectedWindows,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        totalPausedMs: schema.monitoringSessions.totalPausedMs,
        finalSummary: schema.monitoringSessions.finalSummary,
        deliveryStatus: schema.monitoringSessions.deliveryStatus,
        deliveryChannel: schema.monitoringSessions.deliveryChannel,
        createdAt: schema.monitoringSessions.createdAt,
      })
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.userId, userId))
      .orderBy(desc(schema.monitoringSessions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get capture counts for all sessions in a single query
    const sessionIds = sessions.map((s) => s.id);
    const captureCounts =
      sessionIds.length > 0
        ? await db
          .select({
            sessionId: schema.sessionCaptures.sessionId,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.sessionCaptures)
          .where(inArray(schema.sessionCaptures.sessionId, sessionIds))
          .groupBy(schema.sessionCaptures.sessionId)
        : [];

    // Build response with duration and captureCount
    const sessionsWithDuration = sessions.map((session) => {
      const now = Date.now();
      const startTime = new Date(session.startedAt).getTime();
      const endTime = session.endedAt ? new Date(session.endedAt).getTime() : now;
      const totalMs = endTime - startTime;
      const pausedMs = session.totalPausedMs || 0;
      const activeMs = Math.max(0, totalMs - pausedMs);

      const captureCount = captureCounts.find((c) => c.sessionId === session.id)?.count || 0;

      return {
        ...session,
        captureCount,
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
    const { preferences } = req.body as {
      preferences?: {
        detailLevel: 'concise' | 'verbose';
        format: 'bullets' | 'paragraphs';
        includeScreenshots: boolean;
      };
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

      if (session.status !== "active" && session.status !== "paused") {
        res.status(400).json({
          error: "Bad Request",
          message: `Cannot end session with status: ${session.status}`,
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
      const endTime = new Date();
      const startTime = new Date(session.startedAt).getTime();
      let totalPausedMs = session.totalPausedMs || 0;

      // If currently paused, add remaining pause time
      if (session.status === "paused" && session.pausedAt) {
        totalPausedMs += Date.now() - new Date(session.pausedAt).getTime();
      }

      const activeDurationMs = endTime.getTime() - startTime - totalPausedMs;

      // Update session status
      const [updated] = await db
        .update(schema.monitoringSessions)
        .set({
          status: "summarizing",
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

      // Trigger async story generation using the new 3-step pipeline (don't await - let it run in background)
      // Transform frontend preferences (detailLevel) to service format (style)
      const formatPreference = preferences
        ? {
          style: preferences.detailLevel,
          format: preferences.format,
          includeScreenshots: preferences.includeScreenshots,
        }
        : {
          style: 'concise' as const,
          format: 'bullets' as const,
          includeScreenshots: false,
        };

      // Generate AI title and story in parallel (async, don't block response)
      Promise.all([
        // Generate session title from activity timeline
        (async () => {
          try {
            const { sessionTitleService } = await import("../services/session-title.service.js");
            const aiTitle = await sessionTitleService.generateTitle(id);

            // Update session name if AI generated a valid title
            if (aiTitle && aiTitle !== "Work session") {
              await db
                .update(schema.monitoringSessions)
                .set({ name: aiTitle })
                .where(eq(schema.monitoringSessions.id, id));
              log.info("Session title generated", { sessionId: id, title: aiTitle });
            }
          } catch (error) {
            log.error("Session title generation failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })(),
        // Generate master story
        masterStoryService.generateStory({
          sessionId: id,
          userId,
          formatPreference,
        }),
      ])
        .then(() => {
          log.info("Session end processing completed", { sessionId: id });
        })
        .catch((error) => {
          log.error("Session end processing failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          // Update status to indicate completion (even without story)
          db.update(schema.monitoringSessions)
            .set({ status: "ready" })
            .where(eq(schema.monitoringSessions.id, id));
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
          status: "ready", // Updated after mock summary
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
 * POST /api/monitoring/sessions/:id/regenerate-summary
 * DEV ONLY: Regenerate the session summary without re-running the session
 */
router.post(
  "/sessions/:id/regenerate-summary",
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
        res.status(403).json({ error: "Forbidden", message: "Not your session" });
        return;
      }

      // Set status to summarizing
      await db
        .update(schema.monitoringSessions)
        .set({ status: "summarizing" })
        .where(eq(schema.monitoringSessions.id, id));

      // Trigger regeneration in background
      sessionSummarizationService.generateSessionSummary(id).catch((err) => {
        console.error("[DEV] Regenerate summary failed:", err);
      });

      res.json({ success: true, message: "Summary regeneration started" });
    } catch (error) {
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to regenerate",
      });
    }
  }
);

/**
 * POST /api/monitoring/sessions/:id/captures
 * Upload captures batch (from Electron)
 */
router.post(
  "/sessions/:id/captures",
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

      // Step 1: Analyze frame with Sensor (detect visual delta)
      const analysisResult = await frameAnalysisService.analyzeFrame({
        sessionId: id,
        frameId,
        currentFrame: currentImage,
        previousFrame: previousImage,
        windowInfo,
        timestamp: new Date().toISOString(),
      });

      // Step 2: Classify activity using Classifier (interpret delta into meaningful activity)
      let activityDescription: string | null = null;
      let classifierConfidence: number = analysisResult.confidence;

      // Only call Classifier if there's a meaningful delta change
      if (analysisResult.deltaChanged && analysisResult.changeDescription) {
        try {
          const classifierResult = await classifierService.classifyActivity({
            userId,
            sessionId: id,
            deltaDescription: analysisResult.changeDescription,
            frameId,
          });

          if (classifierResult) {
            activityDescription = classifierResult.activity;
            classifierConfidence = classifierResult.confidence;

            log.debug("Activity classified", {
              frameId,
              activity: activityDescription,
              confidence: classifierConfidence,
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
                deltaChanged: analysisResult.deltaChanged,
                deltaChangeType: analysisResult.changeType || null,
                deltaChangeDescription: analysisResult.changeDescription || null,
                importanceScore: calculateImportanceScore(analysisResult),
              })
              .returning({ id: schema.sessionCaptures.id });

            captureId = newCapture.id;
            log.debug("Created database capture record", { captureId, sequenceNumber });
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
 * Get the progressive master story for a session
 * This is the "living document" narrative built incrementally during captures
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

      res.json({
        story: story || "",
        metadata: metadata || {
          version: 0,
          length: 0,
          lastUpdated: null,
          totalTokens: 0,
        },
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

      if (session.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to modify this session",
        });
        return;
      }

      // Update session with edited summary
      await db
        .update(schema.monitoringSessions)
        .set({
          finalSummary,
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
      log.info("Summary updated by user", { version: newSummary.version });

      res.json({
        success: true,
        summary: newSummary,
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

      if (session.userId !== userId) {
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

export default router;

