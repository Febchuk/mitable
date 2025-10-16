import { Router, Request, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/nudges
 * Fetch all active nudges for the user
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    // Get nudges with expert information
    const nudgesData = await db
      .select({
        id: schema.nudges.id,
        context: schema.nudges.context,
        question: schema.nudges.question,
        status: schema.nudges.status,
        matchScore: schema.nudges.matchScore,
        matchReasons: schema.nudges.matchReasons,
        deliveryChannel: schema.nudges.deliveryChannel,
        acceptedAt: schema.nudges.acceptedAt,
        resolvedAt: schema.nudges.resolvedAt,
        createdAt: schema.nudges.createdAt,
        expertId: schema.nudges.expertId,
        expertFirstName: schema.users.firstName,
        expertLastName: schema.users.lastName,
        expertRole: schema.users.role,
        expertAvatar: schema.users.avatarUrl,
        expertStatus: schema.users.status,
      })
      .from(schema.nudges)
      .innerJoin(schema.users, eq(schema.nudges.expertId, schema.users.id))
      .where(eq(schema.nudges.userId, userId))
      .orderBy(sql`${schema.nudges.createdAt} DESC`);

    const nudges = nudgesData.map((nudge) => ({
      id: nudge.id,
      expertName: `${nudge.expertFirstName} ${nudge.expertLastName}`,
      expertRole: nudge.expertRole || "Team Member",
      expertAvatar: nudge.expertAvatar,
      description: nudge.question || "Can help with your question",
      context: nudge.context || "",
      timestamp: nudge.createdAt,
      status: nudge.status || "waiting",
      matchScore: nudge.matchScore ? parseFloat(nudge.matchScore) : undefined,
      matchReasons: (nudge.matchReasons as string[]) || [],
      deliveryChannel: nudge.deliveryChannel,
      acceptedAt: nudge.acceptedAt,
      resolvedAt: nudge.resolvedAt,
      online: nudge.expertStatus === "Active",
    }));

    res.json({ nudges });
  } catch (error) {
    console.error("Error fetching nudges:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch nudges",
    });
  }
});

/**
 * POST /api/nudges/:nudgeId/accept
 * Accept a nudge
 */
router.post("/:nudgeId/accept", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { nudgeId } = req.params;

  try {
    // Verify nudge belongs to user
    const [nudge] = await db
      .select()
      .from(schema.nudges)
      .where(eq(schema.nudges.id, nudgeId))
      .limit(1);

    if (!nudge) {
      res.status(404).json({
        error: "Not Found",
        message: "Nudge not found",
      });
      return;
    }

    if (nudge.userId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to modify this nudge",
      });
      return;
    }

    // Update nudge to accepted
    const acceptedAt = new Date();
    const [updatedNudge] = await db
      .update(schema.nudges)
      .set({
        status: "accepted",
        acceptedAt,
      })
      .where(eq(schema.nudges.id, nudgeId))
      .returning({
        id: schema.nudges.id,
        status: schema.nudges.status,
        acceptedAt: schema.nudges.acceptedAt,
      });

    res.json({
      success: true,
      nudge: updatedNudge,
    });
  } catch (error) {
    console.error("Error accepting nudge:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to accept nudge",
    });
  }
});

/**
 * POST /api/nudges/:nudgeId/dismiss
 * Dismiss a nudge
 */
router.post("/:nudgeId/dismiss", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { nudgeId } = req.params;

  try {
    // Verify nudge belongs to user
    const [nudge] = await db
      .select()
      .from(schema.nudges)
      .where(eq(schema.nudges.id, nudgeId))
      .limit(1);

    if (!nudge) {
      res.status(404).json({
        error: "Not Found",
        message: "Nudge not found",
      });
      return;
    }

    if (nudge.userId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to modify this nudge",
      });
      return;
    }

    // Update nudge to declined
    const [updatedNudge] = await db
      .update(schema.nudges)
      .set({
        status: "declined",
      })
      .where(eq(schema.nudges.id, nudgeId))
      .returning({
        id: schema.nudges.id,
        status: schema.nudges.status,
      });

    res.json({
      success: true,
      nudge: updatedNudge,
    });
  } catch (error) {
    console.error("Error dismissing nudge:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to dismiss nudge",
    });
  }
});

/**
 * POST /api/nudges/:nudgeId/resolve
 * Resolve a nudge
 */
router.post("/:nudgeId/resolve", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { nudgeId } = req.params;

  try {
    // Verify nudge belongs to user
    const [nudge] = await db
      .select()
      .from(schema.nudges)
      .where(eq(schema.nudges.id, nudgeId))
      .limit(1);

    if (!nudge) {
      res.status(404).json({
        error: "Not Found",
        message: "Nudge not found",
      });
      return;
    }

    if (nudge.userId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to modify this nudge",
      });
      return;
    }

    // Update nudge to resolved
    const resolvedAt = new Date();
    const [updatedNudge] = await db
      .update(schema.nudges)
      .set({
        status: "resolved",
        resolvedAt,
      })
      .where(eq(schema.nudges.id, nudgeId))
      .returning({
        id: schema.nudges.id,
        status: schema.nudges.status,
        resolvedAt: schema.nudges.resolvedAt,
      });

    res.json({
      success: true,
      nudge: updatedNudge,
    });
  } catch (error) {
    console.error("Error resolving nudge:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to resolve nudge",
    });
  }
});

export default router;
