import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { requireAuth, optionalAuth } from "./middleware/auth.js";
import roadmapsRouter from "./routes/roadmaps.js";
import nudgesRouter from "./routes/nudges.js";
import conversationsRouter from "./routes/conversations.js";
import adminRouter from "./routes/admin.js";
import integrationsRouter from "./routes/integrations.js";
import piiRouter from "./routes/pii.js";

export const router = Router();

// Auth routes (public)
router.use("/auth", authRouter);

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
router.use("/conversations", conversationsRouter);
router.use("/admin", adminRouter);
router.use("/integrations", integrationsRouter);
router.use("/pii", piiRouter);

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
