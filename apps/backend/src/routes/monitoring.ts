import { Router, Request, Response } from "express";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { sessionDeliveryService } from "../services/session-delivery.service.js";
import { sessionSummarizationService } from "../services/session-summarization.service.js";
import type { SelectedWindowInfo, MonitoringSessionState } from "@mitable/shared";

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
 */
router.post("/sessions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  const {
    selectedWindows,
    captureIntervalMs = 30000,
    name,
  }: {
    selectedWindows: SelectedWindowInfo[];
    captureIntervalMs?: number;
    name?: string;
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

  if (!selectedWindows || selectedWindows.length === 0) {
    res.status(400).json({
      error: "Bad Request",
      message: "At least one window must be selected",
    });
    return;
  }

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

    // Create new session
    const [session] = await db
      .insert(schema.monitoringSessions)
      .values({
        organizationId,
        userId,
        name: name || null,
        status: "active",
        captureIntervalMs,
        selectedWindows: selectedWindows as any,
        startedAt: new Date(),
      })
      .returning();

    console.log(`[Monitoring] Session started: ${session.id}`);

    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        name: session.name,
        selectedWindows: session.selectedWindows,
        captureIntervalMs: session.captureIntervalMs,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    console.error("[Monitoring] Error starting session:", error);
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
    console.error("[Monitoring] Error fetching sessions:", error);
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
    console.error("[Monitoring] Error fetching active session:", error);
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

    res.json({
      session: {
        ...session,
        captureCount,
      },
    });
  } catch (error) {
    console.error("[Monitoring] Error fetching session:", error);
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

    console.log(`[Monitoring] Session updated: ${id}`, { action, name });

    res.json({
      success: true,
      session: updated,
    });
  } catch (error) {
    console.error("[Monitoring] Error updating session:", error);
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

      console.log(`[Monitoring] Session ended: ${id}`, {
        captureCount,
        activeDurationMs,
      });

      // Trigger async summary generation (don't await - let it run in background)
      sessionSummarizationService
        .generateSessionSummary(id)
        .then(() => {
          console.log(`[Monitoring] Summary generated for session ${id}`);
        })
        .catch((error) => {
          console.error(`[Monitoring] Summary generation failed for session ${id}:`, error);
          // Update status to indicate completion (even without summary)
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
            console.log(`[Monitoring] Cleared imageData for session ${id} (1 hour cleanup)`);
          } catch (cleanupError) {
            console.error(
              `[Monitoring] Failed to clear imageData for session ${id}:`,
              cleanupError
            );
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
      console.error("[Monitoring] Error ending session:", error);
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

      // Insert captures with imageData for AI analysis
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
            analysisStatus: "pending",
          }))
        )
        .returning({ id: schema.sessionCaptures.id });

      console.log(`[Monitoring] ${insertedCaptures.length} captures added to session ${id}`);

      res.json({
        success: true,
        insertedCount: insertedCaptures.length,
      });
    } catch (error) {
      console.error("[Monitoring] Error adding captures:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to add captures",
      });
    }
  }
);

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
          confidence: schema.sessionCaptures.confidence,
          imageData: schema.sessionCaptures.imageData,
        })
        .from(schema.sessionCaptures)
        .where(eq(schema.sessionCaptures.sessionId, id))
        .orderBy(schema.sessionCaptures.sequenceNumber);

      res.json({ captures });
    } catch (error) {
      console.error("[Monitoring] Error fetching captures:", error);
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
      console.error("[Monitoring] Error fetching summary:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch summary",
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

      console.log(`[Monitoring] Summary updated for session ${id}`);

      res.json({
        success: true,
        summary: newSummary,
      });
    } catch (error) {
      console.error("[Monitoring] Error updating summary:", error);
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

      console.log(`[Monitoring] Summary revision generated for session ${id}`);

      res.json({ suggestion });
    } catch (error) {
      console.error("[Monitoring] Error revising summary:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to revise summary",
      });
    }
  }
);

interface DeliveryTarget {
  type: "channel" | "dm";
  id: string;
  name?: string;
}

/**
 * POST /api/monitoring/sessions/:id/deliver
 * Send summary to multiple Slack channels and/or DMs
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
      channel: "slack";
      targets: DeliveryTarget[];
    } = req.body;

    if (!channel || !targets) {
      res.status(400).json({
        error: "Bad Request",
        message: "channel and targets are required",
      });
      return;
    }

    if (channel !== "slack") {
      res.status(400).json({
        error: "Bad Request",
        message: "Only slack channel is currently supported",
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

    // Validate each target
    for (const target of targets) {
      if (!target.id || !target.type) {
        res.status(400).json({
          error: "Bad Request",
          message: "Each target must have an id and type",
        });
        return;
      }
      if (target.type !== "channel" && target.type !== "dm") {
        res.status(400).json({
          error: "Bad Request",
          message: "Target type must be 'channel' or 'dm'",
        });
        return;
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
          deliveryTarget: JSON.stringify(targets.map((t) => t.id)),
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
                .map((r) => `${r.name || r.id}: ${r.error}`)
                .join("; "),
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, id));

      const successCount = result.results.filter((r) => r.status === "delivered").length;
      console.log(`[Monitoring] Summary delivered to ${successCount}/${targets.length} targets`);

      res.json({
        success: allSucceeded,
        results: result.results,
        deliveredAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Monitoring] Error delivering summary:", error);

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

    console.log(`[Monitoring] Session deleted: ${id}`);

    res.json({ success: true });
  } catch (error) {
    console.error("[Monitoring] Error deleting session:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to delete session",
    });
  }
});

export default router;
