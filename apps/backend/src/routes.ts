import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { optionalAuth } from "./middleware/auth.js";
import conversationsRouter from "./routes/conversations.js";
import adminRouter from "./routes/admin.js";
import adminDashboardRouter from "./routes/admin-dashboard.js";
import integrationsRouter from "./routes/integrations.js";
import piiRouter from "./routes/pii.js";
import monitoringRouter from "./routes/monitoring.js";
import documentsRouter from "./routes/documents.js";
import billingRouter from "./routes/billing.js";
import stripeRouter from "./routes/stripe.js";
import artifactsRouter from "./routes/artifacts.js";
import { authLimiter } from "./middleware/rateLimiter.js";

export const router = Router();

// Auth routes (public) with stricter rate limiting
router.use("/auth", authLimiter, authRouter);

// Mount route modules (these already have auth middleware built-in)
router.use("/conversations", conversationsRouter); // Screenshot limiter applied within conversations.ts
router.use("/admin", adminRouter);
router.use("/admin", adminDashboardRouter);
router.use("/integrations", integrationsRouter);
router.use("/pii", piiRouter);
router.use("/monitoring", monitoringRouter);
router.use("/documents", documentsRouter);
router.use("/billing", billingRouter);
router.use("/stripe", stripeRouter);
router.use("/artifacts", artifactsRouter);

// Optional auth route example - works for both authenticated and anonymous users
router.get("/public-data", optionalAuth, (req, res) => {
  res.json({
    data: "This endpoint works for both authenticated and anonymous users",
    isAuthenticated: !!req.user,
    userId: req.userId || null,
  });
});
