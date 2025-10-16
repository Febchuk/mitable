import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/roadmaps
 * Fetch the user's roadmap with all weeks and tasks
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    // Get all tasks for the user
    const tasks = await db
      .select({
        id: schema.userRoadmapTasks.id,
        weekNumber: schema.userRoadmapTasks.weekNumber,
        title: schema.userRoadmapTasks.title,
        description: schema.userRoadmapTasks.description,
        timeEstimate: schema.userRoadmapTasks.timeEstimate,
        orderIndex: schema.userRoadmapTasks.orderIndex,
        completed: schema.userRoadmapTasks.completed,
        completedAt: schema.userRoadmapTasks.completedAt,
      })
      .from(schema.userRoadmapTasks)
      .where(eq(schema.userRoadmapTasks.userId, userId))
      .orderBy(schema.userRoadmapTasks.weekNumber, schema.userRoadmapTasks.orderIndex);

    if (tasks.length === 0) {
      res.json({
        weeks: [],
        currentWeek: 1,
        totalWeeks: 0,
        status: "no_roadmap",
      });
      return;
    }

    // Group tasks by week and calculate progress
    const weekMap = new Map<number, any[]>();
    let maxWeek = 0;

    tasks.forEach((task) => {
      const weekNum = task.weekNumber;
      maxWeek = Math.max(maxWeek, weekNum);

      if (!weekMap.has(weekNum)) {
        weekMap.set(weekNum, []);
      }

      weekMap.get(weekNum)!.push({
        id: task.id,
        title: task.title,
        description: task.description || undefined,
        timeEstimate: task.timeEstimate || undefined,
        completed: task.completed || false,
        completedAt: task.completedAt || null,
        week: task.weekNumber,
        orderIndex: task.orderIndex || 0,
      });
    });

    // Build weeks array with completion percentages
    const weeks = Array.from({ length: maxWeek }, (_, i) => {
      const weekNum = i + 1;
      const weekTasks = weekMap.get(weekNum) || [];
      const completedCount = weekTasks.filter((t) => t.completed).length;
      const totalCount = weekTasks.length;
      const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      return {
        number: weekNum,
        percentage,
        tasks: weekTasks,
      };
    });

    // Determine current week (first incomplete week, or last week if all complete)
    let currentWeek = weeks.findIndex((w) => w.percentage < 100) + 1;
    if (currentWeek === 0) currentWeek = maxWeek; // All complete, show last week

    res.json({
      weeks,
      currentWeek,
      totalWeeks: maxWeek,
      status: "active",
    });
  } catch (error) {
    console.error("Error fetching roadmap:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch roadmap",
    });
  }
});

/**
 * PATCH /api/roadmaps/tasks/:taskId
 * Toggle a task's completion status
 */
router.patch("/tasks/:taskId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { taskId } = req.params;
  const { completed } = req.body;

  if (typeof completed !== "boolean") {
    res.status(400).json({
      error: "Bad Request",
      message: "completed field must be a boolean",
    });
    return;
  }

  try {
    // Verify task belongs to user
    const [task] = await db
      .select()
      .from(schema.userRoadmapTasks)
      .where(eq(schema.userRoadmapTasks.id, taskId))
      .limit(1);

    if (!task) {
      res.status(404).json({
        error: "Not Found",
        message: "Task not found",
      });
      return;
    }

    if (task.userId !== userId) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to modify this task",
      });
      return;
    }

    // Update task completion status
    const [updatedTask] = await db
      .update(schema.userRoadmapTasks)
      .set({
        completed,
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.userRoadmapTasks.id, taskId))
      .returning({
        id: schema.userRoadmapTasks.id,
        completed: schema.userRoadmapTasks.completed,
        completedAt: schema.userRoadmapTasks.completedAt,
      });

    res.json({
      success: true,
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error toggling task completion:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to update task",
    });
  }
});

export default router;
