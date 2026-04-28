import { Router, Request, Response } from "express";

import { createLogger } from "../../shared-infra/lib/logger.js";
import { requireAuth } from "../../auth/middleware/auth.js";

const logger = createLogger({ module: "MontessoriRoutes" });

const router = Router();

/**
 * GET /api/montessori/health
 * Lightweight liveness check the Montessori web app can hit after auth to
 * confirm the backend domain is mounted and the user's JWT is valid.
 */
router.get("/health", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        res.json({
            ok: true,
            userId: req.userId,
            organizationId: req.organizationId ?? null,
        });
    } catch (error) {
        logger.error({ error }, "Health check failed");
        res.status(500).json({ error: "internal_error" });
    }
});

export default router;
