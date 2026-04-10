/**
 * My Benchmarks API Routes
 *
 * Employee-scoped benchmark endpoints. All routes are protected by requireAuth
 * and operate exclusively on the currently authenticated user's assignments —
 * req.userId is the only subject; employees cannot access other users' data.
 *
 *   - GET /my/benchmarks           → All benchmark assignments for the current user
 *   - GET /my/benchmarks/:id       → Detailed view of one benchmark assignment
 *   - GET /my/benchmarks/:id/history → Snapshot history for one benchmark assignment
 */

import { Router } from "express";
import { requireAuth } from "../../auth/middleware/auth.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import { benchmarkService } from "../services/benchmark.service.js";

const logger = createLogger({ context: "my-benchmarks-routes" });
const router = Router();

router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET / — list all benchmark assignments for the current user
// ---------------------------------------------------------------------------

router.get("/", async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized", message: "User context required" });
      return;
    }
    const benchmarks = await benchmarkService.getMyBenchmarks(req.userId);
    res.json({ benchmarks });
  } catch (error) {
    logger.error({ err: error }, "Error fetching my benchmarks");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch benchmarks" });
  }
});

// ---------------------------------------------------------------------------
// GET /:id — detail for a single benchmark assignment
// ---------------------------------------------------------------------------

router.get("/:id", async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized", message: "User context required" });
      return;
    }
    const benchmark = await benchmarkService.getMyBenchmarkDetail(req.userId, req.params.id);
    if (!benchmark) {
      res.status(404).json({ error: "Not Found", message: "Benchmark assignment not found" });
      return;
    }
    res.json({ benchmark });
  } catch (error) {
    logger.error({ err: error }, "Error fetching my benchmark detail");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to fetch benchmark detail" });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/history — snapshot history for a single benchmark assignment
// ---------------------------------------------------------------------------

router.get("/:id/history", async (req, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized", message: "User context required" });
      return;
    }
    const history = await benchmarkService.getMyBenchmarkHistory(req.userId, req.params.id);
    res.json({ history });
  } catch (error) {
    logger.error({ err: error }, "Error fetching benchmark history");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to fetch benchmark history" });
  }
});

export default router;
