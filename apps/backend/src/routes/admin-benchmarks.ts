/**
 * Admin Benchmarks API Routes
 *
 * Endpoints for managing benchmarks at the organization/admin level:
 *   - POST /admin/benchmarks/generate-parameters  → AI-generate axes for a new benchmark
 *   - POST /admin/benchmarks/                     → Create a benchmark
 *   - GET  /admin/benchmarks/                     → List all benchmarks for the org
 *   - GET  /admin/benchmarks/:id                  → Benchmark detail with assignments
 *   - PATCH /admin/benchmarks/:id                 → Update benchmark fields
 *   - POST /admin/benchmarks/:id/compute          → Trigger score recomputation
 *   - POST /admin/benchmarks/:id/assign           → Assign users to a benchmark
 *   - POST /admin/benchmarks/:id/unassign         → Remove a user from a benchmark
 *   - PATCH /admin/benchmarks/:id/assignments/:userId → Update per-user assignment
 *   - GET  /admin/benchmarks/:benchmarkId/person/:userId → Person-level benchmark detail
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getScopedVisibleUserIds } from "../middleware/authorization.js";
import { createLogger } from "../lib/logger.js";
import { benchmarkService } from "../services/benchmark.service.js";
import { benchmarkComputeService } from "../services/benchmark-compute.service.js";
import { benchmarkAIService } from "../services/benchmark-ai.service.js";

const logger = createLogger({ context: "admin-benchmarks" });
const router = Router();

router.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /generate-parameters
// Must be registered BEFORE /:id to avoid the static segment being shadowed.
// ---------------------------------------------------------------------------

router.post("/generate-parameters", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { description } = req.body as { description?: string };

    if (!description || typeof description !== "string" || description.trim().length === 0) {
      res.status(400).json({ error: "Bad Request", message: "description is required" });
      return;
    }

    logger.info({ organizationId: req.organizationId }, "Generating benchmark parameters");

    const parameters = await benchmarkAIService.generateParameters(description.trim());

    res.status(200).json({ parameters });
  } catch (error) {
    logger.error({ err: error }, "Error generating benchmark parameters");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to generate benchmark parameters" });
  }
});

// ---------------------------------------------------------------------------
// POST / — create benchmark
// Also registered before /:id routes.
// ---------------------------------------------------------------------------

router.post("/", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const payload = req.body as {
      name?: string;
      description?: string;
      frequency?: string;
      parameters?: unknown[];
    };

    if (!payload.name || typeof payload.name !== "string") {
      res.status(400).json({ error: "Bad Request", message: "name is required" });
      return;
    }

    logger.info({ organizationId: req.organizationId, name: payload.name }, "Creating benchmark");

    const benchmark = await benchmarkService.create(req.organizationId, {
      name: payload.name,
      description: payload.description ?? "",
      frequency: payload.frequency ?? "monthly",
      parameters: (payload.parameters ?? []) as {
        id: string;
        name: string;
        description: string;
        importance: number;
      }[],
    });

    res.status(201).json({ benchmark });
  } catch (error) {
    logger.error({ err: error }, "Error creating benchmark");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create benchmark" });
  }
});

// ---------------------------------------------------------------------------
// GET / — list benchmarks
// ---------------------------------------------------------------------------

router.get("/", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    // Get scoped user IDs for filtering benchmark assignments
    const scopedUserIds = await getScopedVisibleUserIds(req);

    logger.info(
      {
        organizationId: req.organizationId,
        scope: req.query.scope,
        scopedUsers: scopedUserIds.length,
      },
      "Listing benchmarks"
    );

    const benchmarks = await benchmarkService.listByOrg(req.organizationId, scopedUserIds);

    res.status(200).json({ benchmarks });
  } catch (error) {
    logger.error({ err: error }, "Error listing benchmarks");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list benchmarks" });
  }
});

// ---------------------------------------------------------------------------
// GET /:id — benchmark detail
// ---------------------------------------------------------------------------

router.get("/:id", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id } = req.params;

    logger.info(
      { organizationId: req.organizationId, benchmarkId: id },
      "Getting benchmark detail"
    );

    const benchmark = await benchmarkService.getDetail(id, req.organizationId);

    if (!benchmark) {
      res.status(404).json({ error: "Not Found", message: "Benchmark not found" });
      return;
    }

    res.status(200).json({ benchmark });
  } catch (error) {
    logger.error({ err: error }, "Error getting benchmark detail");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to get benchmark detail" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id — update benchmark
// ---------------------------------------------------------------------------

router.patch("/:id", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id } = req.params;
    const payload = req.body as {
      name?: string;
      description?: string;
      targetValue?: number;
      frequency?: string;
      isActive?: boolean;
    };

    logger.info({ organizationId: req.organizationId, benchmarkId: id }, "Updating benchmark");

    const benchmark = await benchmarkService.update(id, req.organizationId, payload);

    if (!benchmark) {
      res.status(404).json({ error: "Not Found", message: "Benchmark not found" });
      return;
    }

    res.status(200).json({ benchmark });
  } catch (error) {
    logger.error({ err: error }, "Error updating benchmark");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update benchmark" });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/compute — trigger recomputation
// ---------------------------------------------------------------------------

router.post("/:id/compute", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id } = req.params;

    logger.info(
      { organizationId: req.organizationId, benchmarkId: id },
      "Triggering benchmark score computation"
    );

    await benchmarkComputeService.computeScores(id, req.organizationId);

    res.status(200).json({ message: "Computation triggered" });
  } catch (error) {
    logger.error({ err: error }, "Error triggering benchmark computation");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to trigger computation" });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/assign — assign users to benchmark
// ---------------------------------------------------------------------------

router.post("/:id/assign", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id } = req.params;
    const { userIds, targetOverride } = req.body as {
      userIds?: string[];
      targetOverride?: number;
    };

    if (!Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "userIds must be a non-empty array" });
      return;
    }

    logger.info(
      { organizationId: req.organizationId, benchmarkId: id, userCount: userIds.length },
      "Assigning users to benchmark"
    );

    await benchmarkService.assign(id, req.organizationId, userIds, targetOverride);

    res.status(200).json({ message: "Users assigned" });
  } catch (error) {
    logger.error({ err: error }, "Error assigning users to benchmark");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to assign users" });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/unassign — remove a user from benchmark
// ---------------------------------------------------------------------------

router.post("/:id/unassign", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id } = req.params;
    const { userId } = req.body as { userId?: string };

    if (!userId || typeof userId !== "string") {
      res.status(400).json({ error: "Bad Request", message: "userId is required" });
      return;
    }

    logger.info(
      { organizationId: req.organizationId, benchmarkId: id, userId },
      "Unassigning user from benchmark"
    );

    await benchmarkService.unassign(id, userId);

    res.status(200).json({ message: "User unassigned" });
  } catch (error) {
    logger.error({ err: error }, "Error unassigning user from benchmark");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to unassign user" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id/assignments/:userId — update per-user assignment
// ---------------------------------------------------------------------------

router.patch("/:id/assignments/:userId", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id, userId } = req.params;
    const payload = req.body as { targetValue?: number };

    logger.info(
      { organizationId: req.organizationId, benchmarkId: id, userId },
      "Updating benchmark assignment"
    );

    await benchmarkService.updateAssignment(id, userId, payload);

    res.status(200).json({ message: "Assignment updated" });
  } catch (error) {
    logger.error({ err: error }, "Error updating benchmark assignment");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to update assignment" });
  }
});

// ---------------------------------------------------------------------------
// GET /:benchmarkId/person/:userId — person-level benchmark detail
// ---------------------------------------------------------------------------

router.get("/:benchmarkId/person/:userId", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { benchmarkId, userId } = req.params;

    logger.info(
      { organizationId: req.organizationId, benchmarkId, userId },
      "Getting person benchmark detail"
    );

    const detail = await benchmarkService.getPersonDetail(benchmarkId, userId, req.organizationId);

    if (!detail) {
      res.status(404).json({ error: "Not Found", message: "Benchmark assignment not found" });
      return;
    }

    res.status(200).json({ detail });
  } catch (error) {
    logger.error({ err: error }, "Error getting person benchmark detail");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to get person benchmark detail" });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/parameters — fetch benchmark parameters
// ---------------------------------------------------------------------------

router.get("/:id/parameters", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id } = req.params;

    logger.info(
      { organizationId: req.organizationId, benchmarkId: id },
      "Getting benchmark parameters"
    );

    const parameters = await benchmarkService.getParameters(id);

    res.status(200).json({ parameters });
  } catch (error) {
    logger.error({ err: error }, "Error getting benchmark parameters");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to get benchmark parameters" });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/parameters — replace benchmark parameters
// ---------------------------------------------------------------------------

router.put("/:id/parameters", async (req, res) => {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden", message: "Organization context required" });
    return;
  }

  try {
    const { id } = req.params;
    const { parameters } = req.body as {
      parameters?: { name: string; description: string; importance: number }[];
    };

    if (!Array.isArray(parameters)) {
      res.status(400).json({ error: "Bad Request", message: "parameters must be an array" });
      return;
    }

    logger.info(
      { organizationId: req.organizationId, benchmarkId: id, count: parameters.length },
      "Updating benchmark parameters"
    );

    await benchmarkService.updateParameters(id, req.organizationId, parameters);

    res.status(200).json({ message: "Parameters updated" });
  } catch (error) {
    logger.error({ err: error }, "Error updating benchmark parameters");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to update benchmark parameters" });
  }
});

// ── DELETE /benchmarks/:id ─ Delete a benchmark ─────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    if (!req.organizationId) {
      res.status(403).json({ error: "Forbidden", message: "Organization context required" });
      return;
    }

    await benchmarkService.deleteBenchmark(req.params.id, req.organizationId);
    res.status(200).json({ message: "Benchmark deleted" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting benchmark");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete benchmark" });
  }
});

export default router;
