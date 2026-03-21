import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { apiKeyService } from "../services/api-key.service.js";

const router = Router();

// All routes require admin auth
router.use(requireAuth);

async function verifyAdmin(req: any, res: any): Promise<{ organizationId: string } | null> {
  const [user] = await db
    .select({ organizationId: users.organizationId, role: users.role })
    .from(users)
    .where(eq(users.id, req.userId!))
    .limit(1);

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return { organizationId: user.organizationId };
}

/** POST /api/api-keys — Create a new API key (returns full key once) */
router.post("/", async (req, res) => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const result = await apiKeyService.createKey(admin.organizationId, req.userId!, name);
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating API key:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

/** GET /api/api-keys — List all keys (prefix only) */
router.get("/", async (req, res) => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const keys = await apiKeyService.listKeys(admin.organizationId);
    res.json({ keys });
  } catch (error) {
    console.error("Error listing API keys:", error);
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

/** DELETE /api/api-keys/:id — Revoke a key */
router.delete("/:id", async (req, res) => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const revoked = await apiKeyService.revokeKey(req.params.id, admin.organizationId);
    if (!revoked) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error revoking API key:", error);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

export default router;
