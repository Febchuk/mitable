import { Router, Request, Response } from "express";
import { db } from "../db/client";
import { nudges } from "../db/schema/experts.schema";
import { users } from "../db/schema/users.schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/nudges
 * Fetch the authenticated user's active nudges with expert information
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Fetch nudges for the user with expert information
    const userNudges = await db
      .select({
        id: nudges.id,
        context: nudges.context,
        question: nudges.question,
        matchScore: nudges.matchScore,
        matchReasons: nudges.matchReasons,
        status: nudges.status,
        deliveryChannel: nudges.deliveryChannel,
        deliveredAt: nudges.deliveredAt,
        acceptedAt: nudges.acceptedAt,
        resolvedAt: nudges.resolvedAt,
        createdAt: nudges.createdAt,
        expertId: users.id,
        expertFirstName: users.firstName,
        expertLastName: users.lastName,
        expertEmail: users.email,
        expertRole: users.role,
        expertAvatar: users.avatarUrl,
      })
      .from(nudges)
      .innerJoin(users, eq(nudges.expertId, users.id))
      .where(eq(nudges.userId, userId))
      .orderBy(nudges.createdAt);

    // Format response to match frontend Nudge interface
    const formattedNudges = userNudges.map((nudge) => ({
      id: nudge.id,
      expertName: `${nudge.expertFirstName || ""} ${nudge.expertLastName || ""}`.trim() || "Expert",
      expertRole: nudge.expertRole || "Expert",
      expertAvatar: nudge.expertAvatar,
      description: nudge.question || "",
      context: nudge.context || "",
      timestamp: nudge.createdAt,
      status: nudge.status || "waiting",
      matchScore: nudge.matchScore ? parseFloat(nudge.matchScore) : undefined,
      matchReasons: nudge.matchReasons as string[] | undefined,
      deliveryChannel: nudge.deliveryChannel,
      acceptedAt: nudge.acceptedAt,
      resolvedAt: nudge.resolvedAt,
      // Note: We don't have real-time online status, so we'll default to false
      // This could be enhanced with presence tracking later
      online: false,
    }));

    res.json({ nudges: formattedNudges });
  } catch (error) {
    console.error("Error fetching nudges:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch nudges",
    });
  }
});

/**
 * POST /api/nudges/:id/accept
 * Accept a nudge (mark as accepted)
 */
router.post("/:id/accept", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Update the nudge status to 'accepted'
    const updatedNudges = await db
      .update(nudges)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
      })
      .where(and(eq(nudges.id, id), eq(nudges.userId, userId)))
      .returning();

    if (updatedNudges.length === 0) {
      res.status(404).json({
        error: "Not Found",
        message: "Nudge not found",
      });
      return;
    }

    res.json({
      success: true,
      nudge: {
        id: updatedNudges[0].id,
        status: updatedNudges[0].status,
        acceptedAt: updatedNudges[0].acceptedAt,
      },
    });
  } catch (error) {
    console.error("Error accepting nudge:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to accept nudge",
    });
  }
});

/**
 * POST /api/nudges/:id/dismiss
 * Dismiss a nudge (mark as declined)
 */
router.post("/:id/dismiss", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Update the nudge status to 'declined'
    const updatedNudges = await db
      .update(nudges)
      .set({
        status: "declined",
      })
      .where(and(eq(nudges.id, id), eq(nudges.userId, userId)))
      .returning();

    if (updatedNudges.length === 0) {
      res.status(404).json({
        error: "Not Found",
        message: "Nudge not found",
      });
      return;
    }

    res.json({
      success: true,
      nudge: {
        id: updatedNudges[0].id,
        status: updatedNudges[0].status,
      },
    });
  } catch (error) {
    console.error("Error dismissing nudge:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to dismiss nudge",
    });
  }
});

/**
 * POST /api/nudges/:id/resolve
 * Resolve a nudge (mark as resolved)
 */
router.post("/:id/resolve", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Update the nudge status to 'resolved'
    const updatedNudges = await db
      .update(nudges)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
      })
      .where(and(eq(nudges.id, id), eq(nudges.userId, userId)))
      .returning();

    if (updatedNudges.length === 0) {
      res.status(404).json({
        error: "Not Found",
        message: "Nudge not found",
      });
      return;
    }

    res.json({
      success: true,
      nudge: {
        id: updatedNudges[0].id,
        status: updatedNudges[0].status,
        resolvedAt: updatedNudges[0].resolvedAt,
      },
    });
  } catch (error) {
    console.error("Error resolving nudge:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to resolve nudge",
    });
  }
});

export default router;
