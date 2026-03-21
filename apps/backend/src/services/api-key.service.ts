import crypto from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apiKeys } from "../db/schema/index.js";

const KEY_PREFIX = "mk_live_";

function generateRawKey(): string {
  return KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
}

function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export const apiKeyService = {
  /**
   * Create a new API key. Returns the full key once — it cannot be retrieved later.
   */
  async createKey(
    organizationId: string,
    userId: string,
    name: string
  ): Promise<{ id: string; key: string; keyPrefix: string }> {
    const rawKey = generateRawKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12); // "mk_live_xxxx"

    const [row] = await db
      .insert(apiKeys)
      .values({ organizationId, createdBy: userId, name, keyHash, keyPrefix })
      .returning({ id: apiKeys.id });

    return { id: row.id, key: rawKey, keyPrefix };
  },

  /**
   * Validate a raw API key. Returns org context or null.
   */
  async validateKey(
    rawKey: string
  ): Promise<{ id: string; organizationId: string; scopes: unknown } | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;

    const keyHash = hashKey(rawKey);

    const [row] = await db
      .select({
        id: apiKeys.id,
        organizationId: apiKeys.organizationId,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
      .limit(1);

    if (!row) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;

    // Fire-and-forget: update lastUsedAt
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id))
      .then(() => {})
      .catch(() => {});

    return { id: row.id, organizationId: row.organizationId, scopes: row.scopes };
  },

  /**
   * List keys for an org (prefix only, never the full key).
   */
  async listKeys(organizationId: string) {
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId))
      .orderBy(apiKeys.createdAt);
  },

  /**
   * Soft-revoke a key.
   */
  async revokeKey(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId)));

    return (result.rowCount ?? 0) > 0;
  },
};
