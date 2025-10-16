import { Router, Request, Response } from "express";
import { db } from "../db/client";
import { roadmaps, roadmapTasks } from "../db/schema/roadmaps.schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/roadmaps
 * Fetch the authenticated user's roadmap with all tasks grouped by week
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Fetch user's roadmap
    const userRoadmaps = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.userId, userId));

    if (userRoadmaps.length === 0) {
      res.json({ weeks: [], currentWeek: 1, totalWeeks: 12 });
      return;
    }

    const roadmap = userRoadmaps[0];

    // Fetch all tasks for this roadmap
    const tasks = await db
      .select()
      .from(roadmapTasks)
      .where(eq(roadmapTasks.roadmapId, roadmap.id))
      .orderBy(roadmapTasks.weekNumber, roadmapTasks.orderIndex);

    // Group tasks by week
    const weekMap = new Map<number, any[]>();

    for (const task of tasks) {
      if (!weekMap.has(task.weekNumber)) {
        weekMap.set(task.weekNumber, []);
      }

      weekMap.get(task.weekNumber)!.push({
        id: task.id,
        title: task.title,
        description: task.description,
        timeEstimate: task.timeEstimate || undefined,
        completed: task.completed || false,
        completedAt: task.completedAt,
        week: task.weekNumber,
        orderIndex: task.orderIndex,
      });
    }

    // Calculate completion percentage for each week
    const weeks = [];
    for (let weekNum = 1; weekNum <= roadmap.totalWeeks; weekNum++) {
      const weekTasks = weekMap.get(weekNum) || [];
      const completedCount = weekTasks.filter((t) => t.completed).length;
      const percentage = weekTasks.length > 0
        ? Math.round((completedCount / weekTasks.length) * 100)
        : 0;

      weeks.push({
        number: weekNum,
        percentage,
        tasks: weekTasks,
      });
    }

    res.json({
      weeks,
      currentWeek: roadmap.currentWeek,
      totalWeeks: roadmap.totalWeeks,
      status: roadmap.status,
    });
  } catch (error) {
    console.error("Error fetching roadmap:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch roadmap",
    });
  }
});

/**
 * PATCH /api/roadmaps/tasks/:taskId
 * Toggle task completion status
 */
router.patch("/tasks/:taskId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
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

    // Verify the task belongs to the user's roadmap
    const userRoadmaps = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.userId, userId));

    if (userRoadmaps.length === 0) {
      res.status(404).json({
        error: "Not Found",
        message: "Roadmap not found",
      });
      return;
    }

    const roadmap = userRoadmaps[0];

    // Update the task
    const updatedTasks = await db
      .update(roadmapTasks)
      .set({
        completed,
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(roadmapTasks.id, taskId),
          eq(roadmapTasks.roadmapId, roadmap.id)
        )
      )
      .returning();

    if (updatedTasks.length === 0) {
      res.status(404).json({
        error: "Not Found",
        message: "Task not found",
      });
      return;
    }

    res.json({
      success: true,
      task: {
        id: updatedTasks[0].id,
        completed: updatedTasks[0].completed,
        completedAt: updatedTasks[0].completedAt,
      },
    });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to update task",
    });
  }
});

export default router;
