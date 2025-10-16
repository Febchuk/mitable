import { Router, Request, Response } from "express";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, sql, count, desc, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

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
 *     description: Retrieve comprehensive user profile including roadmaps, conversations, nudges, and activity data. Admin access required.
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
 *                       enum: [Active, Onboarding]
 *                     progress:
 *                       type: integer
 *                       description: Overall completion percentage
 *                     manager:
 *                       type: string
 *                       nullable: true
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         totalTasks:
 *                           type: integer
 *                         completedTasks:
 *                           type: integer
 *                         overdueTasks:
 *                           type: integer
 *                     assignedRoadmaps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           tasks:
 *                             type: integer
 *                           completion:
 *                             type: integer
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
 *                             enum: [resolved, nudge]
 *                     nudgeThemes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           theme:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           nudges:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 name:
 *                                   type: string
 *                                 count:
 *                                   type: integer
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

    // Get assigned roadmap templates with completion stats
    const assignedRoadmaps = await db
      .select({
        templateId: schema.userTemplateAssignments.templateId,
        templateTitle: schema.roadmapTemplates.title,
        templateDescription: schema.roadmapTemplates.description,
        assignedAt: schema.userTemplateAssignments.assignedAt,
      })
      .from(schema.userTemplateAssignments)
      .innerJoin(
        schema.roadmapTemplates,
        eq(schema.userTemplateAssignments.templateId, schema.roadmapTemplates.id)
      )
      .where(eq(schema.userTemplateAssignments.userId, targetUserId));

    // For each roadmap, calculate completion
    const roadmapsWithStats = await Promise.all(
      assignedRoadmaps.map(async (roadmap) => {
        const [taskStats] = await db
          .select({
            total: count(),
            completed: sql<number>`count(*) filter (where ${schema.userRoadmapTasks.completed} = true)`,
          })
          .from(schema.userRoadmapTasks)
          .where(
            and(
              eq(schema.userRoadmapTasks.userId, targetUserId),
              eq(schema.userRoadmapTasks.templateId, roadmap.templateId)
            )
          );

        const totalTasks = Number(taskStats?.total || 0);
        const completedTasks = Number(taskStats?.completed || 0);
        const completion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return {
          id: roadmap.templateId,
          title: roadmap.templateTitle,
          description: roadmap.templateDescription || "",
          tasks: totalTasks,
          completion,
        };
      })
    );

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

    // For each conversation, check if it resulted in a nudge
    const conversationsWithStatus = await Promise.all(
      recentConversations.map(async (conv) => {
        // Check if this conversation led to a nudge (within 1 hour)
        const oneHourLater = new Date(conv.createdAt.getTime() + 60 * 60 * 1000);
        const [nudgeCount] = await db
          .select({ count: count() })
          .from(schema.nudges)
          .where(
            and(
              eq(schema.nudges.userId, targetUserId),
              gte(schema.nudges.createdAt, conv.createdAt),
              lte(schema.nudges.createdAt, oneHourLater)
            )
          );

        const hasNudge = Number(nudgeCount?.count || 0) > 0;

        return {
          id: conv.id,
          timestamp: formatTimestamp(conv.createdAt),
          question: conv.title || "Untitled conversation",
          status: hasNudge ? ("nudge" as const) : ("resolved" as const),
        };
      })
    );

    // Get common nudge themes (group by question topics)
    const userNudges = await db
      .select({
        question: schema.nudges.question,
        expertId: schema.nudges.expertId,
        expertFirstName: schema.users.firstName,
        expertLastName: schema.users.lastName,
        createdAt: schema.nudges.createdAt,
      })
      .from(schema.nudges)
      .leftJoin(schema.users, eq(schema.nudges.expertId, schema.users.id))
      .where(eq(schema.nudges.userId, targetUserId))
      .orderBy(desc(schema.nudges.createdAt));

    // Group nudges by theme (simplified - just use question as theme for now)
    const nudgeThemeMap = new Map<
      string,
      { count: number; nudges: Map<string, { name: string; count: number }> }
    >();

    userNudges.forEach((nudge) => {
      const theme = nudge.question || "General question";
      const expertName = nudge.expertFirstName && nudge.expertLastName
        ? `${nudge.expertFirstName} ${nudge.expertLastName}`
        : "Unknown Expert";

      if (!nudgeThemeMap.has(theme)) {
        nudgeThemeMap.set(theme, {
          count: 0,
          nudges: new Map(),
        });
      }

      const themeData = nudgeThemeMap.get(theme)!;
      themeData.count++;

      if (!themeData.nudges.has(expertName)) {
        themeData.nudges.set(expertName, { name: expertName, count: 0 });
      }
      themeData.nudges.get(expertName)!.count++;
    });

    // Convert to array format
    const nudgeThemes = Array.from(nudgeThemeMap.entries())
      .map(([theme, data]) => ({
        theme,
        count: data.count,
        nudges: Array.from(data.nudges.values()),
      }))
      .slice(0, 5); // Top 5 themes

    // Calculate task metrics
    const [taskMetrics] = await db
      .select({
        totalTasks: count(),
        completedTasks: sql<number>`count(*) filter (where ${schema.userRoadmapTasks.completed} = true)`,
        overdueTasks: sql<number>`count(*) filter (where ${schema.userRoadmapTasks.completed} = false)`,
      })
      .from(schema.userRoadmapTasks)
      .where(eq(schema.userRoadmapTasks.userId, targetUserId));

    const totalTasks = Number(taskMetrics?.totalTasks || 0);
    const completedTasks = Number(taskMetrics?.completedTasks || 0);
    const overdueTasks = Number(taskMetrics?.overdueTasks || 0);
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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
      status: progress === 100 ? "Active" : "Onboarding",
      progress,
      manager: null, // TODO: Add manager relationship to schema
      metrics: {
        totalTasks,
        completedTasks,
        overdueTasks,
      },
      assignedRoadmaps: roadmapsWithStats,
      conversations: conversationsWithStatus,
      nudgeThemes,
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
 *     description: Retrieve list of all employees with onboarding progress and status. Admin access required.
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
 *                       startDate:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [Active, Onboarding]
 *                         description: Calculated based on completion (100% = Active)
 *                       progress:
 *                         type: integer
 *                         description: Overall completion percentage (0-100)
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

    // Fetch all users with their task completion stats
    const users = await db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        role: schema.users.role,
        startDate: schema.users.startDate,
        currentWeek: schema.users.currentWeek,
        status: schema.users.status,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.users)
      .where(eq(schema.users.role, "employee"))
      .orderBy(desc(schema.users.createdAt));

    // Calculate progress for each user
    const usersWithProgress = await Promise.all(
      users.map(async (user) => {
        // Get total tasks and completed tasks
        const [taskStats] = await db
          .select({
            total: count(),
            completed: sql<number>`count(*) filter (where ${schema.userRoadmapTasks.completed} = true)`,
          })
          .from(schema.userRoadmapTasks)
          .where(eq(schema.userRoadmapTasks.userId, user.id));

        const progress =
          taskStats && taskStats.total > 0
            ? Math.round((Number(taskStats.completed) / Number(taskStats.total)) * 100)
            : 0;

        // Determine status based on completion
        const status = progress === 100 ? "Active" : "Onboarding";

        return {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          startDate: user.startDate || "N/A",
          status,
          progress,
          avatarUrl: user.avatarUrl,
        };
      })
    );

    res.json({ users: usersWithProgress });
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
 * /admin/templates:
 *   get:
 *     tags:
 *       - Admin - Templates
 *     summary: Get all roadmap templates
 *     description: Retrieve all onboarding roadmap templates with usage statistics and task counts. Admin access required.
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 templates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Template'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.get("/templates", requireAuth, async (req: Request, res: Response): Promise<void> => {
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

    // Fetch all templates
    const templates = await db
      .select({
        id: schema.roadmapTemplates.id,
        organizationId: schema.roadmapTemplates.organizationId,
        title: schema.roadmapTemplates.title,
        description: schema.roadmapTemplates.description,
        icon: schema.roadmapTemplates.icon,
        color: schema.roadmapTemplates.color,
        roleTags: schema.roadmapTemplates.roleTags,
        totalWeeks: schema.roadmapTemplates.totalWeeks,
      })
      .from(schema.roadmapTemplates)
      .orderBy(desc(schema.roadmapTemplates.createdAt));

    // Get usage stats and task count for each template
    const templatesWithStats = await Promise.all(
      templates.map(async (template) => {
        // Count how many users are assigned this template
        const [usageStats] = await db
          .select({
            usedCount: count(),
          })
          .from(schema.userTemplateAssignments)
          .where(eq(schema.userTemplateAssignments.templateId, template.id));

        // Count total tasks in this template
        const [taskCount] = await db
          .select({
            tasks: count(),
          })
          .from(schema.roadmapTemplateTasks)
          .where(eq(schema.roadmapTemplateTasks.templateId, template.id));

        return {
          id: template.id,
          organizationId: template.organizationId,
          title: template.title,
          description: template.description || "",
          icon: template.icon,
          color: template.color,
          roleTags: template.roleTags || [],
          totalWeeks: template.totalWeeks,
          tasks: Number(taskCount?.tasks || 0),
          usedCount: Number(usageStats?.usedCount || 0),
        };
      })
    );

    res.json({ templates: templatesWithStats });
  } catch (error) {
    console.error("Error fetching admin templates:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch templates",
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
    const integrations = await db
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

    // Transform to frontend format with display names and descriptions
    const integrationMap: Record<
      string,
      { name: string; description: string; updatesPerDay: number }
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
    };

    const formattedIntegrations = integrations.map((integration) => {
      const providerInfo = integrationMap[integration.provider] || {
        name: integration.provider,
        description: `Integration for ${integration.provider}`,
        updatesPerDay: 1,
      };

      return {
        id: integration.id,
        provider: integration.provider,
        name: providerInfo.name,
        description: providerInfo.description,
        status: integration.status,
        updatesPerDay: providerInfo.updatesPerDay,
        connectedAt: integration.status === "connected" ? integration.createdAt : undefined,
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

export default router;
