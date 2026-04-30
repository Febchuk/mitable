import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";

import { db } from "../../../db/client.js";
import { users } from "../../../db/schema/index.js";
import { organizations } from "../../auth/schema/organizations.schema.js";
import { montessoriClassrooms } from "../schema/montessori.schema.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import { requireAuth } from "../../auth/middleware/auth.js";
import agentRouter from "./agent.js";
import readsRouter from "./reads.js";
import reportArtefactsRouter from "./report-artefacts.js";
import templatesRouter from "./templates.js";
import writesRouter from "./writes.js";

const logger = createLogger({ module: "MontessoriRoutes" });

const router = Router();

/**
 * Register /health and /me before sub-routers. Otherwise Express matches
 * `readsRouter` first; that router runs requireAuth then has no /me route,
 * and the request never reaches the handlers below — login breaks.
 */

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

/**
 * GET /api/montessori/me
 *
 * Returns the authed user's Montessori-relevant context:
 *   - user (id, email, name, role: 'admin' | 'teacher')
 *   - organization (id, name) — the user's school
 *   - assignedClassroom: the classroom this user teaches, if any
 *
 * Used by the web app immediately after sign-in to pick the landing
 * route (admin → /admin/dashboard, teacher → /teacher/grid) and to
 * scope reads/writes to the right classroom.
 */
router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.userId!;
        const organizationId = req.organizationId;

        if (!organizationId) {
            res.status(403).json({
                error: "no_organization",
                message: "Authed user is not associated with any organization.",
            });
            return;
        }

        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
                role: users.role,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (!user) {
            res.status(404).json({ error: "user_not_found" });
            return;
        }

        const [org] = await db
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(eq(organizations.id, organizationId))
            .limit(1);

        // A teacher is assigned to at most one classroom in this product.
        // For admins this query simply returns nothing, which is correct.
        const [assignedClassroom] = await db
            .select({
                id: montessoriClassrooms.id,
                name: montessoriClassrooms.name,
                level: montessoriClassrooms.level,
            })
            .from(montessoriClassrooms)
            .where(eq(montessoriClassrooms.teacherId, userId))
            .limit(1);

        // Map Mitable's existing 'admin' | 'employee' role onto the two
        // Montessori-facing roles. Anything that isn't an admin is treated
        // as a teacher in this product.
        const montessoriRole: "admin" | "teacher" = user.role === "admin" ? "admin" : "teacher";

        res.json({
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: montessoriRole,
            },
            organization: org ?? null,
            assignedClassroom: assignedClassroom ?? null,
        });
    } catch (error) {
        logger.error({ error }, "GET /me failed");
        res.status(500).json({ error: "internal_error" });
    }
});

// All read endpoints (classrooms, students, curriculum, grid, attendance,
// reports, agent threads/messages) live in ./reads.ts; mutations
// (observations, attendance upsert, report status) live in ./writes.ts.
// Both mount under the same /api/montessori prefix.
router.use(readsRouter);
router.use(writesRouter);
router.use(agentRouter);
router.use(templatesRouter);
router.use(reportArtefactsRouter);

export default router;
