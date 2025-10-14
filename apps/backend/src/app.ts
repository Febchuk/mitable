import express from "express";
import cors from "cors";
import { router } from "./routes.js";

export const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", router);
