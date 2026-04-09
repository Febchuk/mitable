import { Router } from "express";
import { authRouter } from "./domains/auth/routes/auth.js";
import { requireAuth, optionalAuth } from "./domains/auth/middleware/auth.js";
import agentRouter from "./routes/agent.js";
import adminRouter from "./domains/auth/routes/admin.js";
import adminDashboardRouter from "./domains/insights/routes/admin-dashboard.js";
import integrationsRouter from "./domains/integrations/routes/integrations.js";
import piiRouter from "./domains/auth/routes/pii.js";
import monitoringRouter from "./routes/monitoring.js";
import documentsRouter from "./routes/documents.js";
import billingRouter from "./domains/auth/routes/billing.js";
import stripeRouter from "./domains/auth/routes/stripe.js";
import apiKeysRouter from "./domains/auth/routes/api-keys.js";
import myActivityRouter from "./domains/insights/routes/my-activity.js";
import myBenchmarksRouter from "./domains/benchmarks/routes/my-benchmarks.js";
import myBragbookRouter from "./domains/updates/routes/my-bragbook.js";
import adminBenchmarksRouter from "./domains/benchmarks/routes/admin-benchmarks.js";
import feedbackRouter from "./domains/auth/routes/feedback.js";
import { authLimiter } from "./domains/auth/middleware/rateLimiter.js";

export const router = Router();

// Auth routes (public) with stricter rate limiting
router.use("/auth", authLimiter, authRouter);

// Mount route modules (these already have auth middleware built-in)
router.use("/admin", adminRouter);
router.use("/admin", adminDashboardRouter);
router.use("/admin/benchmarks", adminBenchmarksRouter);
router.use("/integrations", integrationsRouter);
router.use("/pii", piiRouter);
router.use("/monitoring", monitoringRouter);
router.use("/documents", documentsRouter);
router.use("/billing", billingRouter);
router.use("/stripe", stripeRouter);
router.use("/agent", agentRouter);
router.use("/api-keys", apiKeysRouter);
router.use("/my-activity", myActivityRouter);
router.use("/my/benchmarks", myBenchmarksRouter);
router.use("/my-bragbook", myBragbookRouter);
router.use("/feedback", feedbackRouter);

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
