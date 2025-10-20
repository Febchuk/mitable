import { Router, Request, Response } from "express";
import { eq, sql, or, ilike, and, asc } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { requireAuth } from "../middleware/auth";
import { agentService } from "../services/agent.service";

const router = Router();

/**
 * @openapi
 * /nudges:
 *   get:
 *     tags:
 *       - Nudges
 *     summary: Get all expert nudges
 *     description: Retrieve all nudges for the authenticated user with expert information and match scores
 *     responses:
 *       200:
 *         description: Nudges retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nudges:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Nudge'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
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
 * @openapi
 * /nudges/{nudgeId}/accept:
 *   post:
 *     tags:
 *       - Nudges
 *     summary: Accept an expert nudge
 *     description: Accept a nudge recommendation to connect with an expert. Updates status to 'accepted' and sets timestamp.
 *     parameters:
 *       - in: path
 *         name: nudgeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the nudge to accept
 *     responses:
 *       200:
 *         description: Nudge accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 nudge:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       example: accepted
 *                     acceptedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
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
 * @openapi
 * /nudges/{nudgeId}/dismiss:
 *   post:
 *     tags:
 *       - Nudges
 *     summary: Dismiss an expert nudge
 *     description: Decline a nudge recommendation. Updates status to 'declined'.
 *     parameters:
 *       - in: path
 *         name: nudgeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the nudge to dismiss
 *     responses:
 *       200:
 *         description: Nudge dismissed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 nudge:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       example: declined
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/:nudgeId/dismiss",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
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
  }
);

/**
 * @openapi
 * /nudges/{nudgeId}/resolve:
 *   post:
 *     tags:
 *       - Nudges
 *     summary: Resolve an expert nudge
 *     description: Mark a nudge as resolved after the help is complete. Updates status to 'resolved' and sets resolution timestamp.
 *     parameters:
 *       - in: path
 *         name: nudgeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the nudge to resolve
 *     responses:
 *       200:
 *         description: Nudge resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 nudge:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       example: resolved
 *                     resolvedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/:nudgeId/resolve",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
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
  }
);

/**
 * @openapi
 * /nudges/create:
 *   post:
 *     tags:
 *       - Nudges
 *     summary: Create a new nudge
 *     description: Create a new nudge to request help from experts. Can create as draft or send immediately.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientIds
 *               - context
 *             properties:
 *               recipientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Array of expert/user IDs to send the nudge to
 *               context:
 *                 type: string
 *                 description: Context or question for the nudge
 *               question:
 *                 type: string
 *                 description: Optional specific question
 *               isDraft:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to save as draft or send immediately
 *               resources:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [file, link, screenshot]
 *                     url:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     filesize:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Nudge(s) created successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.post("/create", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { recipientIds, context, question, isDraft = false, resources = [] } = req.body;

  try {
    // Validate required fields
    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      res.status(400).json({
        error: "Bad Request",
        message: "At least one recipient is required",
      });
      return;
    }

    if (!context || !context.trim()) {
      res.status(400).json({
        error: "Bad Request",
        message: "Context is required",
      });
      return;
    }

    // Create a nudge for each recipient
    const createdNudges = [];
    for (const recipientId of recipientIds) {
      // Create the nudge
      const [nudge] = await db
        .insert(schema.nudges)
        .values({
          userId, // Current user is the recipient
          expertId: recipientId, // The person being nudged
          creatorId: userId, // User who created the nudge
          context: context.trim(),
          question: question?.trim() || null,
          isDraft: isDraft ? "true" : "false",
          status: isDraft ? "waiting" : "waiting",
          deliveryChannel: "in_app",
          deliveredAt: isDraft ? null : new Date(),
        })
        .returning();

      // If there are resources, add them
      if (resources.length > 0 && nudge) {
        const resourceValues = resources.map((resource: any) => ({
          nudgeId: nudge.id,
          type: resource.type,
          url: resource.url,
          filename: resource.filename || null,
          filesize: resource.filesize || null,
        }));

        await db.insert(schema.nudgeResources).values(resourceValues);
      }

      createdNudges.push(nudge);
    }

    res.status(201).json({
      success: true,
      nudges: createdNudges,
      message: isDraft
        ? `Draft saved with ${createdNudges.length} recipient(s)`
        : `Nudge sent to ${createdNudges.length} recipient(s)`,
    });
  } catch (error) {
    console.error("Error creating nudge:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to create nudge",
    });
  }
});

/**
 * @openapi
 * /experts/search:
 *   get:
 *     tags:
 *       - Experts
 *     summary: Search for experts
 *     description: Search for expert profiles by name, role, or expertise
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search query string
 *     responses:
 *       200:
 *         description: Experts found successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.get("/experts/search", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { query = "" } = req.query;
  const searchTerm = `%${query}%`;

  try {
    const experts = await db
      .select({
        userId: schema.expertProfiles.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        role: schema.users.role,
        avatar: schema.users.avatarUrl,
        status: schema.users.status,
        responseRate: schema.expertProfiles.responseRate,
        helpfulnessScore: schema.expertProfiles.helpfulnessScore,
        expertiseSummary: schema.expertProfiles.expertiseSummary,
      })
      .from(schema.expertProfiles)
      .innerJoin(schema.users, eq(schema.expertProfiles.userId, schema.users.id))
      .where(
        or(
          ilike(schema.users.firstName, searchTerm),
          ilike(schema.users.lastName, searchTerm),
          ilike(schema.users.email, searchTerm),
          ilike(schema.users.role, searchTerm)
        )
      )
      .limit(20);

    const formattedExperts = experts.map((expert) => ({
      id: expert.userId,
      name: `${expert.firstName} ${expert.lastName}`,
      email: expert.email,
      role: expert.role || "Team Member",
      avatar: expert.avatar,
      status: expert.status || "active",
      responseRate: expert.responseRate ? parseFloat(expert.responseRate) : 0,
      helpfulnessScore: expert.helpfulnessScore ? parseFloat(expert.helpfulnessScore) : 0,
      expertiseSummary: expert.expertiseSummary,
    }));

    res.json({ experts: formattedExperts });
  } catch (error) {
    console.error("Error searching experts:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to search experts",
    });
  }
});

/**
 * @openapi
 * /users/search:
 *   get:
 *     tags:
 *       - Users
 *     summary: Search for users
 *     description: Search for users in the organization by name, email, or role
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search query string
 *     responses:
 *       200:
 *         description: Users found successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.get("/users/search", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { query = "" } = req.query;
  const searchTerm = `%${query}%`;

  try {
    // Get current user to filter by same organization
    const [currentUser] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, req.userId!))
      .limit(1);

    if (!currentUser) {
      res.status(404).json({
        error: "Not Found",
        message: "Current user not found",
      });
      return;
    }

    const users = await db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        role: schema.users.role,
        avatar: schema.users.avatarUrl,
        status: schema.users.status,
      })
      .from(schema.users)
      .where(
        sql`${schema.users.organizationId} = ${currentUser.organizationId}
        AND (
          ${schema.users.firstName} ILIKE ${searchTerm}
          OR ${schema.users.lastName} ILIKE ${searchTerm}
          OR ${schema.users.email} ILIKE ${searchTerm}
          OR ${schema.users.role} ILIKE ${searchTerm}
        )`
      )
      .limit(20);

    const formattedUsers = users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role || "Team Member",
      avatar: user.avatar,
      status: user.status || "active",
    }));

    res.json({ users: formattedUsers });
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to search users",
    });
  }
});

/**
 * @openapi
 * /nudges/generate-context:
 *   post:
 *     tags:
 *       - Nudges
 *     summary: Generate nudge context from conversation
 *     description: Use AI to generate a context summary from a conversation that can be used when creating a nudge
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Context generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 context:
 *                   type: string
 *       404:
 *         description: Conversation not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post("/generate-context", requireAuth, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user!.id;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    // Fetch conversation with messages
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.userId, userId)
      ),
      with: {
        messages: {
          orderBy: asc(schema.messages.createdAt),
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Generate context using AI
    const context = await agentService.generateNudgeContext(conversation.messages);

    res.json({ success: true, context });
  } catch (error) {
    console.error("Error generating context:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to generate context",
    });
  }
});

/**
 * @openapi
 * /nudges/generate-question:
 *   post:
 *     tags:
 *       - Nudges
 *     summary: Generate nudge question from conversation
 *     description: Use AI to extract or formulate a specific question from a conversation that can be used when creating a nudge
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Question generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 question:
 *                   type: string
 *       404:
 *         description: Conversation not found
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post("/generate-question", requireAuth, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user!.id;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    // Fetch conversation with messages
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.userId, userId)
      ),
      with: {
        messages: {
          orderBy: asc(schema.messages.createdAt),
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Generate question using AI
    const question = await agentService.generateNudgeQuestion(conversation.messages);

    res.json({ success: true, question });
  } catch (error) {
    console.error("Error generating question:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to generate question",
    });
  }
});

export default router;
