import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { apiKeyService } from "../services/api-key.service.js";

const router = Router();

// All routes require authentication (but not admin)
router.use(requireAuth);

async function getUserContext(
  req: any,
  res: any
): Promise<{ organizationId: string; userId: string; isAdmin: boolean } | null> {
  const [user] = await db
    .select({ organizationId: users.organizationId, role: users.role })
    .from(users)
    .where(eq(users.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(403).json({ error: "User not found" });
    return null;
  }
  return { organizationId: user.organizationId, userId: req.userId!, isAdmin: user.role === "admin" };
}

/** POST /api/api-keys — Create a new API key (returns full key once) */
router.post("/", async (req, res) => {
  try {
    const ctx = await getUserContext(req, res);
    if (!ctx) return;

    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const result = await apiKeyService.createKey(ctx.organizationId, ctx.userId, name);
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating API key:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

/** GET /api/api-keys — List keys. Admins see all org keys; non-admins see only their own. */
router.get("/", async (req, res) => {
  try {
    const ctx = await getUserContext(req, res);
    if (!ctx) return;

    const keys = ctx.isAdmin
      ? await apiKeyService.listKeys(ctx.organizationId)
      : await apiKeyService.listKeysForUser(ctx.organizationId, ctx.userId);
    res.json({ keys });
  } catch (error) {
    console.error("Error listing API keys:", error);
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

/** DELETE /api/api-keys/:id — Revoke a key. Admins can revoke any org key; non-admins only their own. */
router.delete("/:id", async (req, res) => {
  try {
    const ctx = await getUserContext(req, res);
    if (!ctx) return;

    const revoked = ctx.isAdmin
      ? await apiKeyService.revokeKey(req.params.id, ctx.organizationId)
      : await apiKeyService.revokeOwnKey(req.params.id, ctx.organizationId, ctx.userId);

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
