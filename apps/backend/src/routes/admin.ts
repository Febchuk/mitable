import { Router, Request, Response } from "express";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, sql, count, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { encryptionService } from "../services/encryption.service.js";
import { config } from "../config.js";
import { sendWelcomeEmployeeEmail } from "../services/email/email.service.js";

const router = Router();

// Helper function to format timestamps
function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    return "Less than an hour ago";
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  } else if (diffDays === 1) {
    return "1 day ago";
  } else {
    return `${diffDays} days ago`;
  }
}

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags:
 *       - Admin - People Management
 *     summary: Get detailed user information
 *     description: Retrieve user profile including conversations and activity data. Admin access required.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user to retrieve
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [Active]
 *                     manager:
 *                       type: string
 *                       nullable: true
 *                     conversations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           timestamp:
 *                             type: string
 *                           question:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [resolved]
 *                     activityData:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           hours:
 *                             type: number
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
router.get("/users/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const targetUserId = req.params.id;

    // Verify user is admin
    const [currentUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!currentUser || currentUser.role !== "admin") {
      res.status(403).json({
        error: "Forbidden",
        message: "Admin access required",
      });
      return;
    }

    // Fetch target user
    const [user] = await db
      .select({
        id: schema.users.id,
        organizationId: schema.users.organizationId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        role: schema.users.role,
        startDate: schema.users.startDate,
        status: schema.users.status,
        avatarUrl: schema.users.avatarUrl,
        currentWeek: schema.users.currentWeek,
      })
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1);

    if (!user) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Verify user belongs to the same organization as the admin
    if (user.organizationId !== currentUser.organizationId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to view this user",
      });
      return;
    }

    // Get recent conversations (last 5)
    const recentConversations = await db
      .select({
        id: schema.conversations.id,
        title: schema.conversations.title,
        contextType: schema.conversations.contextType,
        createdAt: schema.conversations.createdAt,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, targetUserId))
      .orderBy(desc(schema.conversations.createdAt))
      .limit(5);

    // Map conversations to status format
    const conversationsWithStatus = recentConversations.map((conv) => ({
      id: conv.id,
      timestamp: formatTimestamp(conv.createdAt),
      question: conv.title || "Untitled conversation",
      status: "resolved" as const,
    }));

    // Activity data (simplified - can be enhanced with actual analytics later)
    const activityData = [
      { date: "Oct 13", hours: 0 },
      { date: "Yesterday", hours: 0 },
      { date: "Today", hours: 0 },
    ];

    // Format response
    const userDetail = {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      startDate: user.startDate || "N/A",
      status: "Active" as const,
      manager: null, // TODO: Add manager relationship to schema
      conversations: conversationsWithStatus,
      activityData,
    };

    res.json({ user: userDetail });
  } catch (error) {
    console.error("Error fetching user detail:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch user details",
    });
  }
});

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags:
 *       - Admin - People Management
 *     summary: Get all users in organization
 *     description: Retrieve list of all employees with status. Admin access required.
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                         example: John Doe
 *                       email:
 *                         type: string
 *                         format: email
 *                       role:
 *                         type: string
 *                       status:
 *                         type: string
 *                       avatarUrl:
 *                         type: string
 *                         nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.get("/users", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Verify user is admin
    const [currentUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!currentUser || currentUser.role !== "admin") {
      res.status(403).json({
        error: "Forbidden",
        message: "Admin access required",
      });
      return;
    }

    // Fetch ALL users in the org (including admins — they can have sessions too)
    const orgUsers = await db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        role: schema.users.role,
        jobTitle: schema.users.jobTitle,
        status: schema.users.status,
        avatarUrl: schema.users.avatarUrl,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.organizationId, currentUser.organizationId))
      .orderBy(schema.users.firstName, schema.users.lastName);

    const usersFormatted = orgUsers.map((user) => ({
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown",
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      status: user.status || "active",
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    }));

    res.json({ users: usersFormatted });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch users",
    });
  }
});

/**
 * @openapi
 * /admin/integrations:
 *   get:
 *     tags:
 *       - Admin - Integrations
 *     summary: Get all integrations
 *     description: Retrieve all third-party integrations configured for the organization. Admin access required.
 *     responses:
 *       200:
 *         description: Integrations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 integrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       provider:
 *                         type: string
 *                         enum: [slack, notion, github, google-drive]
 *                         example: slack
 *                       name:
 *                         type: string
 *                         example: Slack
 *                       description:
 *                         type: string
 *                         example: Get channel and DM message data. Updates four times a day.
 *                       status:
 *                         type: string
 *                         enum: [connected, disconnected, pending, error]
 *                         example: connected
 *                       updatesPerDay:
 *                         type: integer
 *                         example: 4
 *                       connectedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
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
router.get("/integrations", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Get user's organization
    const [currentUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!currentUser) {
      res.status(404).json({
        error: "Not Found",
        message: "User not found",
      });
      return;
    }

    // Verify user is admin
    if (currentUser.role !== "admin") {
      res.status(403).json({
        error: "Forbidden",
        message: "Admin access required",
      });
      return;
    }

    // Fetch integrations for the organization
    const dbIntegrations = await db
      .select({
        id: schema.integrations.id,
        provider: schema.integrations.provider,
        status: schema.integrations.status,
        lastSyncedAt: schema.integrations.lastSyncedAt,
        syncFrequency: schema.integrations.syncFrequency,
        createdAt: schema.integrations.createdAt,
      })
      .from(schema.integrations)
      .where(eq(schema.integrations.organizationId, currentUser.organizationId))
      .orderBy(desc(schema.integrations.createdAt));

    // Define all available integrations
    const integrationMap: Record<
      string,
      { name: string; description: string; updatesPerDay: number; isPerUser?: boolean }
    > = {
      slack: {
        name: "Slack",
        description: "Get channel and DM message data. Updates four times a day.",
        updatesPerDay: 4,
      },
      notion: {
        name: "Notion",
        description: "Get page and database data. Updates four times a day.",
        updatesPerDay: 4,
      },
      github: {
        name: "GitHub",
        description: "Connect your repositories and pull requests. Updates once a day.",
        updatesPerDay: 1,
      },
      "google-drive": {
        name: "Google Drive",
        description: "Access your files and documents. Updates once a day.",
        updatesPerDay: 1,
      },
      linear: {
        name: "Linear",
        description: "Send session updates to Linear tickets. Per-user connection.",
        updatesPerDay: 0,
        isPerUser: true,
      },
      gmail: {
        name: "Gmail",
        description: "Send session summaries from employees' Gmail. Per-user connection.",
        updatesPerDay: 0,
        isPerUser: true,
      },
    };

    // Create map of existing integrations
    const existingIntegrations = new Map(
      dbIntegrations.map((integration) => [integration.provider, integration])
    );

    // Count users with Linear connected (per-user integration)
    const [linearUsersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.organizationId, currentUser.organizationId),
          sql`${schema.users.linearAccessTokenEncrypted} IS NOT NULL`
        )
      );
    const linearConnectedUsers = linearUsersResult?.count || 0;

    // Count users with Gmail connected (per-user integration)
    const [gmailUsersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.organizationId, currentUser.organizationId),
          sql`${schema.users.gmailAccessTokenEncrypted} IS NOT NULL`
        )
      );
    const gmailConnectedUsers = gmailUsersResult?.count || 0;

    // Return all possible integrations, marking status based on DB presence
    const formattedIntegrations = Object.entries(integrationMap).map(([provider, providerInfo]) => {
      const existing = existingIntegrations.get(provider);

      // Special handling for per-user integrations like Linear and Gmail
      if (providerInfo.isPerUser) {
        let connectedCount = 0;
        if (provider === "linear") connectedCount = linearConnectedUsers;
        else if (provider === "gmail") connectedCount = gmailConnectedUsers;
        return {
          id: `${provider}-per-user`,
          provider: provider as "slack" | "notion" | "github" | "google-drive" | "linear" | "gmail",
          name: providerInfo.name,
          description: providerInfo.description,
          status: connectedCount > 0 ? "connected" : "disconnected",
          updatesPerDay: providerInfo.updatesPerDay,
          connectedAt: undefined,
          isPerUser: true,
          connectedUsersCount: connectedCount,
        };
      }

      return {
        id: existing?.id || `${provider}-placeholder`,
        provider: provider as "slack" | "notion" | "github" | "google-drive" | "linear" | "gmail",
        name: providerInfo.name,
        description: providerInfo.description,
        status: existing?.status || "disconnected",
        updatesPerDay: providerInfo.updatesPerDay,
        connectedAt: existing?.status === "connected" ? existing.createdAt : undefined,
      };
    });

    res.json({ integrations: formattedIntegrations });
  } catch (error) {
    console.error("Error fetching admin integrations:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch integrations",
    });
  }
});

/**
 * GET /admin/integrations/linear/users
 * Get list of users who have connected their Linear account
 */
router.get(
  "/integrations/linear/users",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Get user's organization
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Verify user is admin
      if (currentUser.role !== "admin") {
        res.status(403).json({
          error: "Forbidden",
          message: "Admin access required",
        });
        return;
      }

      // Fetch users with Linear connected
      const linearUsers = await db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
          avatarUrl: schema.users.avatarUrl,
          connectedAt: schema.users.updatedAt,
        })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.organizationId, currentUser.organizationId),
            sql`${schema.users.linearAccessTokenEncrypted} IS NOT NULL`
          )
        )
        .orderBy(schema.users.firstName);

      const formattedUsers = linearUsers.map((user) => ({
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        email: user.email,
        avatarUrl: user.avatarUrl,
        connectedAt: user.connectedAt,
      }));

      res.json({ users: formattedUsers });
    } catch (error) {
      console.error("Error fetching Linear users:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch Linear users",
      });
    }
  }
);

/**
 * GET /admin/integrations/gmail/users
 * Get list of users who have connected their Gmail account
 */
router.get(
  "/integrations/gmail/users",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Get user's organization
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Verify user is admin
      if (currentUser.role !== "admin") {
        res.status(403).json({
          error: "Forbidden",
          message: "Admin access required",
        });
        return;
      }

      // Fetch users with Gmail connected
      const gmailUsers = await db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
          gmailEmail: schema.users.gmailUserEmail,
          avatarUrl: schema.users.avatarUrl,
          connectedAt: schema.users.updatedAt,
        })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.organizationId, currentUser.organizationId),
            sql`${schema.users.gmailAccessTokenEncrypted} IS NOT NULL`
          )
        )
        .orderBy(schema.users.firstName);

      const formattedUsers = gmailUsers.map((user) => ({
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        email: user.email,
        gmailEmail: user.gmailEmail,
        avatarUrl: user.avatarUrl,
        connectedAt: user.connectedAt,
      }));

      res.json({ users: formattedUsers });
    } catch (error) {
      console.error("Error fetching Gmail users:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch Gmail users",
      });
    }
  }
);

/**
 * POST /admin/integrations/:id/sync
 * Trigger manual sync for an integration
 */
router.post(
  "/integrations/:id/sync",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const integrationId = req.params.id;

      // Get user's organization
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Verify user is admin
      if (currentUser.role !== "admin") {
        res.status(403).json({
          error: "Forbidden",
          message: "Admin access required",
        });
        return;
      }

      // Get integration details
      const [integration] = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, integrationId),
            eq(schema.integrations.organizationId, currentUser.organizationId)
          )
        )
        .limit(1);

      if (!integration) {
        res.status(404).json({
          error: "Not Found",
          message: "Integration not found",
        });
        return;
      }

      if (integration.status !== "connected") {
        res.status(400).json({
          error: "Bad Request",
          message: "Integration must be connected before syncing",
        });
        return;
      }

      console.log(
        `[Admin] Starting ${integration.provider} sync for org ${currentUser.organizationId}`
      );

      // Initialize vector service (required for Pinecone upserts)
      const { vectorService } = await import("../services/vector.service.js");
      vectorService.initialize();
      console.log("[Admin] Vector service initialized");

      // Route to appropriate sync service based on provider
      let syncResult: any;

      switch (integration.provider) {
        case "slack": {
          const { slackIngestionService } = await import("../services/slack-ingestion.service.js");
          syncResult = await slackIngestionService.syncMessages(currentUser.organizationId);
          break;
        }

        case "notion": {
          const { notionIngestionService } =
            await import("../services/notion-ingestion.service.js");
          syncResult = await notionIngestionService.syncPages(currentUser.organizationId);
          break;
        }

        case "github": {
          const { syncIntegration } = await import("../scripts/sync-github.js");
          const result = await syncIntegration(integration);
          syncResult = {
            success: true,
            channelsProcessed: result.reposProcessed,
            messagesEmbedded: result.chunksCreated,
            totalMessages: result.filesProcessed,
            errors: [],
            duration: 0,
          };
          break;
        }

        default:
          res.status(400).json({
            error: "Bad Request",
            message: `Sync not supported for provider: ${integration.provider}`,
          });
          return;
      }

      // Return sync results
      if (syncResult.success) {
        res.json({
          success: true,
          provider: integration.provider,
          itemsProcessed: syncResult.channelsProcessed || syncResult.filesProcessed || 0,
          itemsEmbedded: syncResult.messagesEmbedded || syncResult.chunksEmbedded || 0,
          duration: syncResult.duration,
          errors: syncResult.errors,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Sync Failed",
          provider: integration.provider,
          errors: syncResult.errors,
        });
      }
    } catch (error) {
      console.error("Error syncing integration:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to sync integration",
      });
    }
  }
);

/**
 * @openapi
 * /admin/users:
 *   post:
 *     tags:
 *       - Admin - People Management
 *     summary: Create a new employee account
 *     description: Create a new user with Supabase Auth account and database profile. Generates temporary password and optionally sends welcome email with credentials. Admin access required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - role
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Jane
 *               lastName:
 *                 type: string
 *                 example: Smith
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane.smith@company.com
 *               role:
 *                 type: string
 *                 description: Job title
 *                 example: Software Engineer
 *               sendWelcomeEmail:
 *                 type: boolean
 *                 description: Whether to send welcome email with credentials
 *                 default: true
 *               makeAdmin:
 *                 type: boolean
 *                 description: If true, create this user as an org admin
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                       format: email
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     role:
 *                       type: string
 *                 initialPassword:
 *                   type: string
 *                   description: Generated temporary password
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.post("/users", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { firstName, lastName, email, role, sendWelcomeEmail, makeAdmin } = req.body;

    // Verify requester is admin
    const [currentUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!currentUser || currentUser.role !== "admin") {
      res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Admin access required",
        },
      });
      return;
    }

    // Validate required fields
    if (!firstName || !lastName) {
      console.log("[admin/users] 400: missing name", { firstName, lastName });
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "First name and last name are required",
        },
      });
      return;
    }

    if (!email) {
      console.log("[admin/users] 400: missing email");
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Email is required",
        },
      });
      return;
    }

    if (!role) {
      console.log("[admin/users] 400: missing role", { body: req.body });
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Role is required",
        },
      });
      return;
    }

    // Check if email already exists in database
    const [existingUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existingUser) {
      console.log("[admin/users] 400: email already exists", { email });
      res.status(400).json({
        success: false,
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "A user with this email already exists",
        },
      });
      return;
    }

    // Generate a temporary password (user can reset via email)
    const tempPassword = Math.random().toString(36).slice(-12) + "A1!";

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        organization_id: currentUser.organizationId,
      },
    });

    if (authError || !authData.user) {
      console.error("Error creating user in Supabase Auth:", authError);
      res.status(400).json({
        success: false,
        error: {
          code: "USER_CREATION_FAILED",
          message: authError?.message || "Failed to create user",
        },
      });
      return;
    }

    // Update user profile in database (trigger auto-creates it with defaults, we update with full data)
    try {
      // The Supabase trigger auto-creates the user record, so we update it with our custom values
      await db
        .update(schema.users)
        .set({
          role: makeAdmin ? "admin" : role,
          jobTitle: role,
        })
        .where(eq(schema.users.id, authData.user.id));
    } catch (dbError) {
      console.error("Error updating user profile:", dbError);
      // Cleanup: Delete auth user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);

      res.status(500).json({
        success: false,
        error: {
          code: "PROFILE_CREATION_FAILED",
          message: "Failed to create user profile",
        },
      });
      return;
    }

    // Send branded welcome email with credentials via Resend
    if (sendWelcomeEmail !== false) {
      try {
        const [org] = await db
          .select({ name: schema.organizations.name })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, currentUser.organizationId))
          .limit(1);

        await sendWelcomeEmployeeEmail({
          to: email,
          firstName,
          organizationName: org?.name || "your organization",
          temporaryPassword: tempPassword,
          loginUrl: `${config.backendUrl}/api/auth/login`,
        });
      } catch (emailError) {
        console.error("Error sending welcome email:", emailError);
        // Don't fail the entire request if email fails - user is already created
      }
    }

    res.status(201).json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email || email,
        firstName,
        lastName,
        role,
      },
      initialPassword: tempPassword,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to create user",
      },
    });
  }
});

/**
 * @openapi
 * /admin/integrations/{id}/connect:
 *   post:
 *     tags:
 *       - Admin - Integrations
 *     summary: Connect an integration
 *     description: Activate an integration connection with optional credentials. Admin access required.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Integration ID to connect
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accessToken:
 *                 type: string
 *                 description: OAuth access token
 *               refreshToken:
 *                 type: string
 *                 description: OAuth refresh token
 *               metadata:
 *                 type: object
 *                 description: Provider-specific configuration
 *     responses:
 *       200:
 *         description: Integration connected successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/integrations/:id/connect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const integrationId = req.params.id;
      const { accessToken, refreshToken, metadata } = req.body;

      // Verify user is admin
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser || currentUser.role !== "admin") {
        res.status(403).json({
          error: "Forbidden",
          message: "Admin access required",
        });
        return;
      }

      // Check if integration exists and belongs to user's organization
      const [integration] = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, integrationId),
            eq(schema.integrations.organizationId, currentUser.organizationId)
          )
        )
        .limit(1);

      if (!integration) {
        res.status(404).json({
          error: "Not Found",
          message: "Integration not found",
        });
        return;
      }

      // Validate that accessToken is provided (required for connection)
      if (!accessToken) {
        res.status(400).json({
          error: "Bad Request",
          message: "Access token is required to connect integration",
        });
        return;
      }

      // Encrypt tokens before storing
      const accessTokenEncrypted = encryptionService.encrypt(accessToken);
      const refreshTokenEncrypted = refreshToken
        ? encryptionService.encrypt(refreshToken)
        : undefined;

      // Update integration status to connected
      const updateData: any = {
        status: "connected",
        accessTokenEncrypted: accessTokenEncrypted,
        metadata: metadata || integration.metadata,
        updatedAt: new Date(),
      };

      // Only update refreshToken if provided (Slack doesn't have refresh tokens)
      if (refreshTokenEncrypted) {
        updateData.refreshTokenEncrypted = refreshTokenEncrypted;
      }

      const [updatedIntegration] = await db
        .update(schema.integrations)
        .set(updateData)
        .where(eq(schema.integrations.id, integrationId))
        .returning();

      res.json({
        success: true,
        integration: updatedIntegration,
      });
    } catch (error) {
      console.error("Error connecting integration:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to connect integration",
      });
    }
  }
);

/**
 * @openapi
 * /admin/integrations/{id}/disconnect:
 *   post:
 *     tags:
 *       - Admin - Integrations
 *     summary: Disconnect an integration
 *     description: Deactivate an integration connection and clear credentials. Admin access required.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Integration disconnected successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/integrations/:id/disconnect",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const integrationId = req.params.id;

      // Verify user is admin
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser || currentUser.role !== "admin") {
        res.status(403).json({
          error: "Forbidden",
          message: "Admin access required",
        });
        return;
      }

      // Check if integration exists and belongs to user's organization
      const [integration] = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, integrationId),
            eq(schema.integrations.organizationId, currentUser.organizationId)
          )
        )
        .limit(1);

      if (!integration) {
        res.status(404).json({
          error: "Not Found",
          message: "Integration not found",
        });
        return;
      }

      // Update integration status to disconnected
      // Note: Encrypted tokens are kept for audit trail (can't be null per schema)
      const [updatedIntegration] = await db
        .update(schema.integrations)
        .set({
          status: "disconnected",
          tokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integrationId))
        .returning();

      res.json({
        success: true,
        integration: updatedIntegration,
      });
    } catch (error) {
      console.error("Error disconnecting integration:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to disconnect integration",
      });
    }
  }
);

/**
 * @openapi
 * /admin/integrations/{id}/sync:
 *   post:
 *     tags:
 *       - Admin - Integrations
 *     summary: Trigger manual sync
 *     description: Manually trigger a sync for a connected integration. Admin access required.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sync triggered successfully
 *       400:
 *         description: Integration not connected
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/integrations/:id/sync",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const integrationId = req.params.id;

      // Verify user is admin
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser || currentUser.role !== "admin") {
        res.status(403).json({
          error: "Forbidden",
          message: "Admin access required",
        });
        return;
      }

      // Check if integration exists and belongs to user's organization
      const [integration] = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, integrationId),
            eq(schema.integrations.organizationId, currentUser.organizationId)
          )
        )
        .limit(1);

      if (!integration) {
        res.status(404).json({
          error: "Not Found",
          message: "Integration not found",
        });
        return;
      }

      if (integration.status !== "connected") {
        res.status(400).json({
          error: "Bad Request",
          message: "Integration must be connected before syncing",
        });
        return;
      }

      // Create a sync log entry
      const [syncLog] = await db
        .insert(schema.syncLogs)
        .values({
          integrationId: integrationId,
          status: "in_progress",
          startedAt: new Date(),
        })
        .returning();

      // Update lastSyncedAt timestamp
      await db
        .update(schema.integrations)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integrationId));

      // Trigger actual sync based on provider
      let itemsSynced = 0;
      let syncResult: any = {};

      try {
        if (integration.provider === "slack") {
          const { slackIngestionService } = await import("../services/slack-ingestion.service.js");
          const result = await slackIngestionService.syncMessages(currentUser.organizationId);
          itemsSynced = result.messagesEmbedded || 0;
          syncResult = result;
        } else if (integration.provider === "notion") {
          const { notionIngestionService } =
            await import("../services/notion-ingestion.service.js");
          const result = await notionIngestionService.syncPages(currentUser.organizationId);
          itemsSynced = result.messagesEmbedded || 0;
          syncResult = result;
        } else if (integration.provider === "github") {
          const { syncIntegration } = await import("../scripts/sync-github.js");
          const result = await syncIntegration(integration);
          itemsSynced = result.chunksCreated || 0;
          syncResult = result;
        }

        // Mark sync as success
        await db
          .update(schema.syncLogs)
          .set({
            status: "success",
            itemsSynced,
            completedAt: new Date(),
          })
          .where(eq(schema.syncLogs.id, syncLog.id));

        res.json({
          success: true,
          provider: integration.provider,
          result: syncResult,
          syncLog: {
            ...syncLog,
            status: "success",
            itemsSynced,
            completedAt: new Date(),
          },
        });
      } catch (syncError) {
        console.error(`Error syncing ${integration.provider}:`, syncError);

        // Mark sync as failed
        await db
          .update(schema.syncLogs)
          .set({
            status: "failed",
            errorMessage: syncError instanceof Error ? syncError.message : "Unknown error",
            completedAt: new Date(),
          })
          .where(eq(schema.syncLogs.id, syncLog.id));

        res.status(500).json({
          success: false,
          error: "Sync Failed",
          message: syncError instanceof Error ? syncError.message : "Failed to sync integration",
        });
      }
    } catch (error) {
      console.error("Error syncing integration:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to trigger sync",
      });
    }
  }
);

/**
 * @openapi
 * /admin/integrations/{id}:
 *   patch:
 *     tags:
 *       - Admin - Integrations
 *     summary: Update integration settings
 *     description: Update configuration and metadata for an integration. Admin access required.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: object
 *                 description: Provider-specific configuration
 *     responses:
 *       200:
 *         description: Integration updated successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     security:
 *       - BearerAuth: []
 */
router.patch(
  "/integrations/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const integrationId = req.params.id;
      const { metadata } = req.body;

      // Verify user is admin
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser || currentUser.role !== "admin") {
        res.status(403).json({
          error: "Forbidden",
          message: "Admin access required",
        });
        return;
      }

      // Check if integration exists and belongs to user's organization
      const [integration] = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, integrationId),
            eq(schema.integrations.organizationId, currentUser.organizationId)
          )
        )
        .limit(1);

      if (!integration) {
        res.status(404).json({
          error: "Not Found",
          message: "Integration not found",
        });
        return;
      }

      // Update integration metadata
      const [updatedIntegration] = await db
        .update(schema.integrations)
        .set({
          metadata: metadata || integration.metadata,
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integrationId))
        .returning();

      res.json({
        success: true,
        integration: updatedIntegration,
      });
    } catch (error) {
      console.error("Error updating integration:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update integration",
      });
    }
  }
);

/**
 * @openapi
 * /admin/organization/settings:
 *   get:
 *     tags:
 *       - Admin - Organization
 *     summary: Get organization settings
 *     description: Retrieve organization settings including variant. Admin access required.
 *     responses:
 *       200:
 *         description: Organization settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 organization:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     settings:
 *                       type: object
 *                       properties:
 *                         variant:
 *                           type: string
 *                           enum: [global, nigeria]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.get(
  "/organization/settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;

      // Verify user is admin
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser || currentUser.role !== "admin") {
        res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
        return;
      }

      // Fetch organization
      const [organization] = await db
        .select({
          id: schema.organizations.id,
          name: schema.organizations.name,
          domain: schema.organizations.domain,
          settings: schema.organizations.settings,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, currentUser.organizationId))
        .limit(1);

      if (!organization) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Organization not found",
          },
        });
        return;
      }

      res.json({
        success: true,
        organization: {
          id: organization.id,
          name: organization.name,
          domain: organization.domain,
          settings: organization.settings || {},
        },
      });
    } catch (error) {
      console.error("Error fetching organization settings:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch organization settings",
        },
      });
    }
  }
);

/**
 * @openapi
 * /admin/organization/settings:
 *   patch:
 *     tags:
 *       - Admin - Organization
 *     summary: Update organization settings
 *     description: Update organization settings including variant. Admin access required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variant:
 *                 type: string
 *                 enum: [global, nigeria]
 *                 description: Organization UI variant for regional terminology
 *     responses:
 *       200:
 *         description: Organization settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 organization:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     settings:
 *                       type: object
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.patch(
  "/organization/settings",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const { variant } = req.body;

      // Verify user is admin
      const [currentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!currentUser || currentUser.role !== "admin") {
        res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Admin access required",
          },
        });
        return;
      }

      // Validate variant if provided
      const validVariants = ["global", "nigeria"];
      if (variant !== undefined && !validVariants.includes(variant)) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid variant. Must be one of: ${validVariants.join(", ")}`,
          },
        });
        return;
      }

      // Fetch current organization settings
      const [organization] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, currentUser.organizationId))
        .limit(1);

      if (!organization) {
        res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Organization not found",
          },
        });
        return;
      }

      // Merge new settings with existing
      const currentSettings = (organization.settings as Record<string, unknown>) || {};
      const updatedSettings = {
        ...currentSettings,
        ...(variant !== undefined && { variant }),
      };

      // Update organization settings
      const [updatedOrg] = await db
        .update(schema.organizations)
        .set({
          settings: updatedSettings,
          updatedAt: new Date(),
        })
        .where(eq(schema.organizations.id, currentUser.organizationId))
        .returning({
          id: schema.organizations.id,
          name: schema.organizations.name,
          domain: schema.organizations.domain,
          settings: schema.organizations.settings,
        });

      res.json({
        success: true,
        organization: {
          id: updatedOrg.id,
          name: updatedOrg.name,
          domain: updatedOrg.domain,
          settings: updatedOrg.settings,
        },
      });
    } catch (error) {
      console.error("Error updating organization settings:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update organization settings",
        },
      });
    }
  }
);

export default router;
