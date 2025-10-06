import { Router } from "express";

export const router = Router();

// Placeholder routes - will be implemented in later phases
router.get("/conversations", (_req, res) => {
  res.json({ conversations: [] });
});

router.post("/help", (_req, res) => {
  res.json({ message: "Help endpoint - to be implemented" });
});

router.get("/roadmaps", (_req, res) => {
  res.json({ roadmaps: [] });
});

router.get("/nudges", (_req, res) => {
  res.json({ nudges: [] });
});
