import { Router, Request, Response } from "express";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, sql, count, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/admin/users
 * Fetch all users with their onboarding progress
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
 * GET /api/admin/templates
 * Fetch all roadmap templates with usage statistics
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
 * GET /api/admin/integrations
 * Fetch all integrations for the user's organization
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
    const integrationMap: Record<string, { name: string; description: string; updatesPerDay: number }> = {
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
