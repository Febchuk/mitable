import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { contextService } from "../services/context.service.js";

const router = Router();

/**
 * POST /api/context/search
 * Semantic search across session_chunks (pgvector cosine similarity)
 * Used by agent MCP tools and bash/curl for non-SDK agents.
 */
router.post("/search", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const organizationId = req.organizationId!;
    const { query, days, topK } = req.body;

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "query is required and must be a string" });
      return;
    }

    const result = await contextService.search({
      query,
      userId,
      organizationId,
      days: days ? Number(days) : undefined,
      topK: topK ? Number(topK) : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error("[Context] Search error:", error);
    res.status(500).json({ error: "Failed to search context" });
  }
});

/**
 * GET /api/context/current
 * What the user is currently/recently working on
 */
router.get("/current", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    const result = await contextService.getCurrentActivity(userId, organizationId);
    res.json(result);
  } catch (error) {
    console.error("[Context] Current activity error:", error);
    res.status(500).json({ error: "Failed to get current activity" });
  }
});

/**
 * POST /api/context/knowledge
 * Search integrated sources (Slack, Notion, GitHub)
 */
router.post("/knowledge", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { query, sources } = req.body;

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "query is required and must be a string" });
      return;
    }

    const result = await contextService.searchKnowledge({
      query,
      organizationId,
      sources,
    });

    res.json(result);
  } catch (error) {
    console.error("[Context] Knowledge search error:", error);
    res.status(500).json({ error: "Failed to search knowledge" });
  }
});

export default router;
