import { Router, Request, Response } from "express";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, sql, count, desc, and, ne, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";
import { extractNotionPageId } from "../utils/notion-url-parser.js";
import { notionService } from "../services/notion.service.js";
import { llmService } from "../services/llm.service.js";
import { encryptionService } from "../services/encryption.service.js";

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

    // Map conversations to status format
    const conversationsWithStatus = recentConversations.map((conv) => ({
      id: conv.id,
      timestamp: formatTimestamp(conv.createdAt),
      question: conv.title || "Untitled conversation",
      status: "resolved" as const,
    }));

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

    // Fetch all users with their task completion stats (exclude admins, filter by organization)
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
      .where(
        and(
          ne(schema.users.role, "admin"),
          eq(schema.users.organizationId, currentUser.organizationId)
        )
      )
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

    // Fetch all templates for the organization
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
      .where(eq(schema.roadmapTemplates.organizationId, currentUser.organizationId))
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
 * /admin/templates/{id}:
 *   get:
 *     tags:
 *       - Admin - Templates
 *     summary: Get template details
 *     description: Retrieve detailed information about a specific template including tasks, usage stats, and assigned users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 template:
 *                   type: object
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     security:
 *       - BearerAuth: []
 */
router.get("/templates/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id: templateId } = req.params;

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

    // Fetch template
    const [template] = await db
      .select()
      .from(schema.roadmapTemplates)
      .where(
        and(
          eq(schema.roadmapTemplates.id, templateId),
          eq(schema.roadmapTemplates.organizationId, currentUser.organizationId)
        )
      )
      .limit(1);

    if (!template) {
      res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Template not found",
        },
      });
      return;
    }

    // Fetch all tasks for this template
    const tasks = await db
      .select()
      .from(schema.roadmapTemplateTasks)
      .where(eq(schema.roadmapTemplateTasks.templateId, templateId))
      .orderBy(
        asc(schema.roadmapTemplateTasks.weekNumber),
        asc(schema.roadmapTemplateTasks.orderIndex)
      );

    // Group tasks by week
    const tasksByWeek: Record<number, any[]> = {};
    for (const task of tasks) {
      if (!tasksByWeek[task.weekNumber]) {
        tasksByWeek[task.weekNumber] = [];
      }
      tasksByWeek[task.weekNumber].push({
        id: task.id,
        title: task.title,
        description: task.description,
        timeEstimate: task.timeEstimate,
        orderIndex: task.orderIndex,
        sources: [], // TODO: Fetch source materials when schema is ready
      });
    }

    // Convert to array format sorted by week
    const tasksByWeekArray = Object.entries(tasksByWeek)
      .sort(([weekA], [weekB]) => Number(weekA) - Number(weekB))
      .map(([weekNumber, weekTasks]) => ({
        weekNumber: Number(weekNumber),
        tasks: weekTasks,
      }));

    // Get usage statistics
    const assignments = await db
      .select({
        userId: schema.userTemplateAssignments.userId,
        assignedAt: schema.userTemplateAssignments.assignedAt,
      })
      .from(schema.userTemplateAssignments)
      .where(eq(schema.userTemplateAssignments.templateId, templateId));

    // Fetch assigned user details
    const assignedUsers = await Promise.all(
      assignments.map(async (assignment) => {
        const [user] = await db
          .select({
            id: schema.users.id,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
            email: schema.users.email,
            role: schema.users.role,
          })
          .from(schema.users)
          .where(eq(schema.users.id, assignment.userId))
          .limit(1);

        if (!user) return null;

        // Calculate progress (count completed tasks)
        const [completedCount] = await db
          .select({
            count: count(),
          })
          .from(schema.userRoadmapTasks)
          .where(
            and(
              eq(schema.userRoadmapTasks.userId, user.id),
              eq(schema.userRoadmapTasks.completed, true)
            )
          );

        const totalTasks = tasks.length;
        const progress =
          totalTasks > 0 ? Math.round((Number(completedCount?.count || 0) / totalTasks) * 100) : 0;

        return {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          progress,
          assignedAt: assignment.assignedAt,
        };
      })
    );

    // Filter out null values
    const validAssignedUsers = assignedUsers.filter((user) => user !== null);

    res.json({
      success: true,
      template: {
        id: template.id,
        organizationId: template.organizationId,
        title: template.title,
        description: template.description,
        icon: template.icon,
        color: template.color,
        roleTags: template.roleTags || [],
        totalWeeks: template.totalWeeks,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        tasksByWeek: tasksByWeekArray,
        usageStats: {
          assignedCount: validAssignedUsers.length,
          assignedUsers: validAssignedUsers,
        },
        taskCount: tasks.length,
      },
    });
  } catch (error) {
    console.error("Error fetching template details:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch template details",
      },
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
 *     description: Create a new employee with Supabase Auth account, database profile, and assigned roadmap templates. Generates temporary password and optionally sends welcome email with credentials. Admin access required.
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
 *               - startDate
 *               - templateIds
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
 *                 description: Employee role/title
 *                 example: Software Engineer
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Employee start date
 *                 example: 2025-01-15
 *               templateIds:
 *                 type: array
 *                 description: Optional array of roadmap template IDs to assign
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: ["123e4567-e89b-12d3-a456-426614174000"]
 *               sendWelcomeEmail:
 *                 type: boolean
 *                 description: Whether to send welcome email with credentials
 *                 default: true
 *               makeAdmin:
 *                 type: boolean
 *                 description: If true, create this user as an org admin
 *     responses:
 *       201:
 *         description: Employee created successfully
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
 *                 templatesAssigned:
 *                   type: integer
 *                   description: Number of templates assigned
 *                   example: 2
 *                 tasksCreated:
 *                   type: integer
 *                   description: Total tasks created from templates
 *                   example: 45
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
    const {
      firstName,
      lastName,
      email,
      role,
      startDate,
      templateIds,
      sendWelcomeEmail,
      makeAdmin,
    } = req.body;

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
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Role is required",
        },
      });
      return;
    }

    if (!startDate) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Start date is required",
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
          startDate: startDate,
          currentWeek: 1,
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

    // Assign templates and copy tasks (optional)
    let totalTasksCreated = 0;

    if (Array.isArray(templateIds) && templateIds.length > 0) {
      for (const templateId of templateIds) {
        // Create template assignment
        await db.insert(schema.userTemplateAssignments).values({
          userId: authData.user.id,
          templateId,
          status: "active",
          assignedAt: new Date(),
        });

        // Get all tasks from this template
        const templateTasks = await db
          .select()
          .from(schema.roadmapTemplateTasks)
          .where(eq(schema.roadmapTemplateTasks.templateId, templateId))
          .orderBy(schema.roadmapTemplateTasks.weekNumber, schema.roadmapTemplateTasks.orderIndex);

        // Copy tasks to user's roadmap
        for (const task of templateTasks) {
          await db.insert(schema.userRoadmapTasks).values({
            userId: authData.user.id,
            templateId: templateId,
            templateTaskId: task.id,
            weekNumber: task.weekNumber,
            title: task.title,
            description: task.description,
            timeEstimate: task.timeEstimate,
            orderIndex: task.orderIndex,
            completed: false,
          });
          totalTasksCreated++;
        }
      }
    }

    // Send welcome email with password reset link if requested
    if (sendWelcomeEmail !== false) {
      try {
        // Use Supabase's password reset flow to send a secure password setup email
        const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password`,
        });

        if (resetError) {
          console.error("Failed to send welcome email:", resetError);
          // Don't fail the entire request if email fails - user is already created
        }
      } catch (emailError) {
        console.error("Error sending welcome email:", emailError);
        // Don't fail the entire request if email fails
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
      templatesAssigned: Array.isArray(templateIds) ? templateIds.length : 0,
      tasksCreated: totalTasksCreated,
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
 * /admin/templates:
 *   post:
 *     tags:
 *       - Admin - Templates
 *     summary: Create a new roadmap template
 *     description: Create a reusable onboarding template with optional tasks or import from Notion. When a Notion URL is provided, AI automatically extracts tasks from the page content. Admin access required.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Engineering Onboarding
 *               description:
 *                 type: string
 *                 example: Complete onboarding path for software engineers
 *               icon:
 *                 type: string
 *                 example: Bot
 *                 default: Settings
 *               color:
 *                 type: string
 *                 example: "#3b82f6"
 *                 default: "#3b82f6"
 *               roleTags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Software Engineer", "Frontend"]
 *               totalWeeks:
 *                 type: integer
 *                 example: 4
 *                 default: 4
 *               notionUrl:
 *                 type: string
 *                 description: Optional Notion page URL to import tasks from. When provided, AI extracts tasks from the page content. Requires Notion integration to be connected.
 *                 example: "https://notion.so/Engineering-Onboarding-abc123def456"
 *               tasks:
 *                 type: array
 *                 description: Optional tasks to create with template
 *                 items:
 *                   type: object
 *                   required:
 *                     - weekNumber
 *                     - title
 *                   properties:
 *                     weekNumber:
 *                       type: integer
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     timeEstimate:
 *                       type: string
 *                     orderIndex:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Template created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 template:
 *                   $ref: '#/components/schemas/Template'
 *                 tasksCreated:
 *                   type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *     security:
 *       - BearerAuth: []
 */
router.post("/templates", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { title, description, icon, color, roleTags, totalWeeks, notionUrl } = req.body;

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
    if (!title) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Template title is required",
        },
      });
      return;
    }

    // Handle Notion URL if provided
    // This will be used to automatically extract tasks from a Notion page
    let notionPageId: string | null = null;

    if (notionUrl && notionUrl.trim()) {
      try {
        // Step 1: Extract page ID from the Notion URL
        // Supports various formats: https://notion.so/Page-abc123, direct IDs, etc.
        notionPageId = extractNotionPageId(notionUrl);
        console.log(`✓ Extracted Notion page ID: ${notionPageId}`);

        // Step 2: Validate that organization has a connected Notion integration
        // This is required because we need OAuth tokens to fetch page content
        const [integration] = await db
          .select()
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.organizationId, currentUser.organizationId),
              eq(schema.integrations.provider, "notion"),
              eq(schema.integrations.status, "connected")
            )
          )
          .limit(1);

        if (!integration) {
          // User hasn't connected Notion yet - provide helpful error
          res.status(400).json({
            success: false,
            error: {
              code: "NOTION_NOT_CONNECTED",
              message:
                "Notion integration required. Please connect Notion in your integrations settings before importing templates.",
            },
          });
          return;
        }

        console.log(`✓ Notion integration found for organization: ${currentUser.organizationId}`);

        // Step 3: Fetch all blocks from the Notion page
        // This uses the existing notionService which handles:
        // - OAuth token management and refresh
        // - Rate limiting (350ms between requests)
        // - Recursive fetching of nested blocks
        // - Text extraction from various block types
        const blocks = await notionService.getPageBlocks(currentUser.organizationId, notionPageId);

        // Filter out blocks with no meaningful text content
        // Empty blocks or blocks with only whitespace won't help the AI
        const validBlocks = blocks.filter((block) => block.text && block.text.trim().length > 0);

        console.log(
          `✓ Fetched ${blocks.length} total blocks, ${validBlocks.length} with content from Notion page`
        );

        // Handle case where page has no extractable content
        if (validBlocks.length === 0) {
          console.warn(`⚠ No content found in Notion page: ${notionPageId}`);
          // Continue with template creation but no tasks
          // This allows users to create the template structure even if the page is empty
        } else {
          // Step 4: Extract tasks from Notion blocks using AI
          // The LLM analyzes block structure (headings, paragraphs, lists) to:
          // - Identify week numbers from headings (e.g., "Week 1: Onboarding")
          // - Extract task titles from action items
          // - Parse time estimates (e.g., "2 hours", "by Friday")
          // - Generate descriptions from supporting text
          // - Determine proper ordering within each week
          const extractedTasks = await llmService.extractTasksFromNotionBlocks(validBlocks);

          console.log(`✓ AI extracted ${extractedTasks.length} tasks from Notion content`);

          // Override the tasks array with AI-extracted tasks
          // This replaces any manually provided tasks in the request
          // The extracted tasks are already in the correct format for our database schema
          req.body.tasks = extractedTasks;
        }
      } catch (error) {
        // Handle URL parsing errors
        if (error instanceof Error && error.message.includes("Invalid Notion URL")) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_NOTION_URL",
              message: error.message,
            },
          });
          return;
        }

        // Handle Notion API errors (page not found, not shared, etc.)
        if (error instanceof Error && error.message.includes("Could not find page")) {
          res.status(403).json({
            success: false,
            error: {
              code: "NOTION_PAGE_NOT_ACCESSIBLE",
              message:
                "Unable to access this Notion page. Please ensure the page is shared with your Notion integration. " +
                "You can share pages during the OAuth connection or update sharing settings in Notion.",
            },
          });
          return;
        }

        // Handle AI extraction errors
        if (
          error instanceof Error &&
          (error.message.includes("AI returned invalid JSON") ||
            error.message.includes("Failed to process Notion content"))
        ) {
          res.status(500).json({
            success: false,
            error: {
              code: "AI_EXTRACTION_FAILED",
              message:
                "Failed to extract tasks from Notion page using AI. " +
                "This may be due to complex page formatting. You can try simplifying the page or create tasks manually.",
            },
          });
          return;
        }

        // Re-throw other errors to be caught by outer try/catch
        throw error;
      }
    }

    // Create the template
    const [template] = await db
      .insert(schema.roadmapTemplates)
      .values({
        organizationId: currentUser.organizationId,
        title,
        description: description || null,
        icon: icon || "Settings",
        color: color || "#3b82f6",
        roleTags: roleTags || [],
        totalWeeks: totalWeeks || 4,
      })
      .returning();

    // Create tasks if provided
    let tasksCreated = 0;
    if (req.body.tasks && Array.isArray(req.body.tasks) && req.body.tasks.length > 0) {
      for (const task of req.body.tasks) {
        if (!task.weekNumber || !task.title) {
          continue; // Skip invalid tasks
        }

        await db.insert(schema.roadmapTemplateTasks).values({
          templateId: template.id,
          weekNumber: task.weekNumber,
          title: task.title,
          description: task.description || null,
          timeEstimate: task.timeEstimate || null,
          orderIndex: task.orderIndex || 0,
        });
        tasksCreated++;
      }
    }

    // Build response with template info and task count
    const response: any = {
      success: true,
      template: {
        id: template.id,
        organizationId: template.organizationId,
        title: template.title,
        description: template.description,
        icon: template.icon,
        color: template.color,
        roleTags: template.roleTags,
        totalWeeks: template.totalWeeks,
      },
      tasksCreated,
    };

    // Add metadata if tasks were imported from Notion
    // This helps the frontend show a success message with details
    if (notionPageId) {
      response.importedFromNotion = true;
      response.notionPageId = notionPageId;
      console.log(
        `✅ Template "${title}" created successfully with ${tasksCreated} tasks imported from Notion page ${notionPageId}`
      );
    } else {
      console.log(`✅ Template "${title}" created successfully with ${tasksCreated} tasks`);
    }

    res.status(201).json(response);
  } catch (error) {
    // Log the full error for debugging
    console.error("Error creating template:", error);

    // Provide detailed error response
    // If error has already been handled (responded to client), don't send again
    if (res.headersSent) {
      return;
    }

    // Handle any unexpected errors with helpful message
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          "Failed to create template. " +
          (error instanceof Error ? error.message : "An unexpected error occurred."),
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

export default router;
