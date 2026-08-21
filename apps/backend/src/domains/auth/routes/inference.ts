/**
 * Inference Configuration Routes
 *
 * Provides org inference config (BYOK provider + API key) to authenticated
 * org members. The admin sets this up via PATCH /admin/organization/settings;
 * this route distributes the decrypted key so Electron clients can call
 * the provider directly.
 */

import { Router, Request, Response } from "express";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { encryptionService } from "../services/encryption.service.js";

const router = Router();

const DEFAULT_MODELS: Record<string, string> = {
  google: "gemini-2.5-flash-lite-preview-06-2025",
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-4-5-20241022",
};

router.get("/config", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [user] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ configured: false, error: "User not found" });
      return;
    }

    const [org] = await db
      .select({ settings: schema.organizations.settings })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    if (!org) {
      res.status(404).json({ configured: false, error: "Organization not found" });
      return;
    }

    const settings = (org.settings as Record<string, unknown>) || {};
    const provider = settings.inferenceProvider as string | undefined;
    const encryptedKey = settings.inferenceApiKey as string | undefined;

    if (!provider || !encryptedKey) {
      res.json({ configured: false });
      return;
    }

    let apiKey: string;
    try {
      apiKey = encryptionService.decrypt(encryptedKey);
    } catch {
      res.status(500).json({ configured: false, error: "Failed to decrypt API key" });
      return;
    }

    res.json({
      configured: true,
      provider,
      apiKey,
      model: DEFAULT_MODELS[provider] || undefined,
    });
  } catch (error) {
    console.error("Error fetching inference config:", error);
    res.status(500).json({ configured: false, error: "Internal error" });
  }
});

export default router;
