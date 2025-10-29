import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { config } from "../config.js";
import {
  piiRedactionService,
  type PIIRedactionRequest,
  type PIIRedactionResponse,
} from "../services/pii-redaction.service.js";

const router = Router();

/**
 * @openapi
 * /pii/redact:
 *   post:
 *     tags:
 *       - PII
 *     summary: Redact PII from screenshot
 *     description: Detect and redact Personally Identifiable Information (PII) from a screenshot using Google Cloud DLP. Returns a fully redacted image with black rectangles over detected PII.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - screenshot
 *             properties:
 *               screenshot:
 *                 type: string
 *                 description: Base64 encoded screenshot (data URL format - "data:image/png;base64,...")
 *                 example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
 *     responses:
 *       200:
 *         description: PII redaction completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether redaction was successful
 *                 redactedScreenshot:
 *                   type: string
 *                   description: Fully redacted screenshot as base64 data URL
 *                 detectionTime:
 *                   type: number
 *                   description: Time taken for detection + redaction in milliseconds
 *                 piiCount:
 *                   type: number
 *                   description: Number of PII regions redacted
 *                 cached:
 *                   type: boolean
 *                   description: Whether result was served from cache
 *                 error:
 *                   type: string
 *                   description: Error message if success is false
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/redact", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { screenshot } = req.body as PIIRedactionRequest;

    // Validate request
    if (!screenshot || typeof screenshot !== "string") {
      res.status(400).json({
        success: false,
        error: "Invalid request: screenshot is required and must be a string",
      });
      return;
    }

    // Validate screenshot format (should be base64 or data URL)
    if (!screenshot.startsWith("data:image/") && !screenshot.match(/^[A-Za-z0-9+/=]+$/)) {
      res.status(400).json({
        success: false,
        error: "Invalid screenshot format: must be base64 or data URL",
      });
      return;
    }

    // Guard #1: Check if PII redaction feature is enabled
    if (!config.features.piiRedaction) {
      console.log("[PII] Feature disabled, returning original screenshot");
      res.json({
        success: true,
        redactedScreenshot: screenshot, // Return original, unredacted
        detectionTime: 0,
        piiCount: 0,
        cached: false,
        disabled: true, // Signal that feature is disabled
      });
      return;
    }

    // Call PII redaction service
    const result: PIIRedactionResponse = await piiRedactionService.redactScreenshot({
      screenshot,
    });

    // Log metrics
    console.log(
      `[PII] Redaction ${result.cached ? "cached" : "processed"}: ` +
        `${result.detectionTime}ms, ${result.piiCount} regions, ` +
        `success: ${result.success}`
    );

    // Return result
    res.status(200).json(result);
  } catch (error) {
    console.error("[PII] Redaction endpoint error:", error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      redactedScreenshot: "",
      detectionTime: 0,
      piiCount: 0,
      cached: false,
    } as PIIRedactionResponse);
  }
});

/**
 * @openapi
 * /pii/cache/stats:
 *   get:
 *     tags:
 *       - PII
 *     summary: Get cache statistics
 *     description: Get cache hit/miss statistics for PII redaction service (admin only)
 *     responses:
 *       200:
 *         description: Cache statistics retrieved successfully
 */
router.get("/cache/stats", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = piiRedactionService.getCacheStats();
    res.status(200).json(stats);
  } catch (error) {
    console.error("[PII] Cache stats error:", error);
    res.status(500).json({ error: "Failed to get cache statistics" });
  }
});

/**
 * @openapi
 * /pii/cache/clear:
 *   post:
 *     tags:
 *       - PII
 *     summary: Clear PII redaction cache
 *     description: Clear all cached redaction results (admin only)
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 */
router.post("/cache/clear", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    piiRedactionService.clearCache();
    res.status(200).json({ success: true, message: "Cache cleared" });
  } catch (error) {
    console.error("[PII] Cache clear error:", error);
    res.status(500).json({ error: "Failed to clear cache" });
  }
});

export default router;
