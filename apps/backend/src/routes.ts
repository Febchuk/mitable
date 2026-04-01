import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { requireAuth, optionalAuth } from "./middleware/auth.js";
import agentRouter from "./routes/agent.js";
import roadmapsRouter from "./routes/roadmaps.js";
// DEPRECATED: Old multi-agent chat system (OrchestratorService → KnowledgeAgent/Groq)
// Admin Ask now uses /admin/ask/chat (Claude). Employees have no chat UI.
// import conversationsRouter from "./routes/conversations.js";
import adminRouter from "./routes/admin.js";
import adminDashboardRouter from "./routes/admin-dashboard.js";
import integrationsRouter from "./routes/integrations.js";
import piiRouter from "./routes/pii.js";
import monitoringRouter from "./routes/monitoring.js";
import documentsRouter from "./routes/documents.js";
import billingRouter from "./routes/billing.js";
import stripeRouter from "./routes/stripe.js";
import artifactsRouter from "./routes/artifacts.js";
import apiKeysRouter from "./routes/api-keys.js";
import myActivityRouter from "./routes/my-activity.js";
import myBenchmarksRouter from "./routes/my-benchmarks.js";
import myBragbookRouter from "./routes/my-bragbook.js";
import adminBenchmarksRouter from "./routes/admin-benchmarks.js";
import { authLimiter } from "./middleware/rateLimiter.js";
// DEPRECATED: Guide routes replaced by WorkflowOptions metadata system
// import guidesRouter from "./routes/guides.routes.js";

export const router = Router();

// Auth routes (public) with stricter rate limiting
router.use("/auth", authLimiter, authRouter);

// Mount route modules (these already have auth middleware built-in)
router.use("/roadmaps", roadmapsRouter);
// DEPRECATED: Unmounted — no UI calls this. Was causing ghost Groq tool_use_failed errors.
// router.use("/conversations", conversationsRouter);
router.use("/admin", adminRouter);
router.use("/admin", adminDashboardRouter);
router.use("/admin/benchmarks", adminBenchmarksRouter);
router.use("/integrations", integrationsRouter);
router.use("/pii", piiRouter);
router.use("/monitoring", monitoringRouter);
router.use("/documents", documentsRouter);
router.use("/billing", billingRouter);
router.use("/stripe", stripeRouter);
router.use("/artifacts", artifactsRouter);
router.use("/agent", agentRouter);
router.use("/api-keys", apiKeysRouter);
router.use("/my-activity", myActivityRouter);
router.use("/my/benchmarks", myBenchmarksRouter);
router.use("/my-bragbook", myBragbookRouter);

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
