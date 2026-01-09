import { Router, Request, Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/artifacts
 * List all artifacts for user's organization
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    // Get user's organization
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

    // Get all artifacts for the organization (active only)
    const artifacts = await db
      .select()
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.organizationId, user.organizationId),
          eq(schema.artifacts.status, "active")
        )
      )
      .orderBy(desc(schema.artifacts.createdAt));

    res.json({
      artifacts,
      total: artifacts.length,
    });
  } catch (error) {
    console.error("[Artifacts] Error fetching artifacts:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch artifacts",
    });
  }
});

/**
 * POST /api/artifacts
 * Create a new artifact (file or text)
 */
router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { title, type, url, fileType, size, content } = req.body;

  // Validate required fields
  if (!title || !type) {
    res.status(400).json({
      error: "Bad Request",
      message: "title and type are required",
    });
    return;
  }

  // Validate type
  if (type !== "file" && type !== "text") {
    res.status(400).json({
      error: "Bad Request",
      message: "type must be 'file' or 'text'",
    });
    return;
  }

  // Validate type-specific fields
  if (type === "file" && !url) {
    res.status(400).json({
      error: "Bad Request",
      message: "url is required for file artifacts",
    });
    return;
  }

  if (type === "text" && !content) {
    res.status(400).json({
      error: "Bad Request",
      message: "content is required for text artifacts",
    });
    return;
  }

  try {
    // Get user's organization
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

    // Create artifact
    const [artifact] = await db
      .insert(schema.artifacts)
      .values({
        organizationId: user.organizationId,
        userId,
        title,
        type,
        url: type === "file" ? url : null,
        fileType: type === "file" ? fileType : null,
        size: type === "file" && size ? BigInt(size) : null,
        content: type === "text" ? content : null,
        status: "active",
      })
      .returning();

    console.log(`[Artifacts] Created ${type} artifact: ${artifact.id}`);

    res.status(201).json(artifact);
  } catch (error) {
    console.error("[Artifacts] Error creating artifact:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to create artifact",
    });
  }
});

/**
 * DELETE /api/artifacts/:id
 * Delete (archive) an artifact
 */
router.delete("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { id } = req.params;

  try {
    // Get user's organization
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

    // Verify artifact belongs to user's organization
    const [artifact] = await db
      .select()
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.id, id),
          eq(schema.artifacts.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!artifact) {
      res.status(404).json({
        error: "Not Found",
        message: "Artifact not found",
      });
      return;
    }

    // Archive the artifact (soft delete)
    await db
      .update(schema.artifacts)
      .set({ 
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(schema.artifacts.id, id));

    console.log(`[Artifacts] Archived artifact: ${id}`);

    res.json({
      success: true,
      message: "Artifact archived successfully",
    });
  } catch (error) {
    console.error("[Artifacts] Error deleting artifact:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to delete artifact",
    });
  }
});

export default router;

