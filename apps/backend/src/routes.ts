import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { requireAuth, optionalAuth } from "./middleware/auth.js";
import roadmapsRouter from "./routes/roadmaps.js";
import nudgesRouter from "./routes/nudges.js";
import conversationsRouter from "./routes/conversations.js";
import adminRouter from "./routes/admin.js";
import integrationsRouter from "./routes/integrations.js";
import piiRouter from "./routes/pii.js";
import { authLimiter, screenshotLimiter } from "./middleware/rateLimiter.js";
// DEPRECATED: Guide routes replaced by WorkflowOptions metadata system
// import guidesRouter from "./routes/guides.routes.js";

export const router = Router();

// Auth routes (public) with stricter rate limiting
router.use("/auth", authLimiter, authRouter);

// Public route example
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    message: "Mitable Backend API is running",
  });
});

// Mount route modules (these already have auth middleware built-in)
router.use("/roadmaps", roadmapsRouter);
router.use("/nudges", nudgesRouter);
router.use("/conversations", conversationsRouter); // Screenshot limiter applied within conversations.ts
router.use("/admin", adminRouter);
router.use("/integrations", integrationsRouter);
router.use("/pii", piiRouter);

/**
 * DEPRECATED: /guides routes
 *
 * Previously used for:
 * - POST /guides/progress - Progress to next workflow step (guide window → backend → guide window)
 * - GET /guides/:conversationId - Retrieve current workflow state
 *
 * Replaced by WorkflowOptions metadata system where all workflow progression happens through:
 * - User clicks button in WorkflowOptions component
 * - Metadata sent with message to /conversations/:id/messages/stream
 * - Agent service receives metadata hints and selects appropriate tool:
 *   * guide_next_step (progress_step action)
 *   * analyze_workflow_screen (custom_question with visual issue)
 *   * respond_with_text_in_workflow (custom_question conceptual)
 *   * search_knowledge_in_workflow (custom_question needing docs)
 * - Tool returns workflow message back to conversation window (no separate guide window)
 *
 * The guide window no longer exists - all workflow UI is now in the conversation window.
 */
// router.use("/guides", guidesRouter);

// Protected routes - require authentication
router.post("/help", requireAuth, (req, res) => {
  res.json({
    message: "Help endpoint - to be implemented",
    userId: req.userId,
  });
});

// Optional auth route example - works for both authenticated and anonymous users
router.get("/public-data", optionalAuth, (req, res) => {
  res.json({
    data: "This endpoint works for both authenticated and anonymous users",
    isAuthenticated: !!req.user,
    userId: req.userId || null,
  });
});
