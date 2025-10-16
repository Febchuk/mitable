import { Router } from "express";
import { authRouter } from "./routes/auth.js";
import { requireAuth, optionalAuth } from "./middleware/auth.js";

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

// Protected routes - require authentication
router.get("/conversations", requireAuth, (req, res) => {
  res.json({
    conversations: [],
    userId: req.userId,
    message: "This is a protected route - user must be authenticated",
  });
});

router.post("/help", requireAuth, (req, res) => {
  res.json({
    message: "Help endpoint - to be implemented",
    userId: req.userId,
  });
});

router.get("/roadmaps", requireAuth, (req, res) => {
  res.json({
    roadmaps: [],
    userId: req.userId,
    message: "Fetch user-specific roadmaps",
  });
});

router.get("/nudges", requireAuth, (req, res) => {
  res.json({
    nudges: [],
    userId: req.userId,
    message: "Fetch user-specific nudges",
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
