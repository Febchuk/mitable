/**
 * Keychain Service
 *
 * Securely stores the refresh token in the OS keychain using keytar.
 * - macOS: Keychain Access
 * - Windows: Credential Vault
 * - Linux: libsecret (Secret Service API)
 *
 * The access token is intentionally NOT stored here — it lives in memory only.
 * Only the long-lived refresh token is persisted so we can silently
 * re-authenticate on app restart without prompting the user.
 */

import { createLogger } from "../lib/logger";

const logger = createLogger("KeychainService");

const SERVICE_NAME = "Mitable";

// Lazy-load keytar to avoid blocking the main process at import time.
// keytar is a native module that may take time to initialize.
let _keytar: typeof import("keytar") | null = null;

async function getKeytar(): Promise<typeof import("keytar")> {
  if (!_keytar) {
    try {
      // Dynamic import in a CJS bundle wraps the module in a namespace object.
      // The real exports live on .default for native CJS modules like keytar.
      const mod: any = await import("keytar");
      _keytar = mod.default || mod;
    } catch (error) {
      logger.error("Failed to load keytar:", error);
      throw new Error("Keychain not available — keytar failed to load");
    }
  }
  return _keytar!;
}

/**
 * Build a deterministic account key from org + user IDs.
 * Format: `orgId:userId`
 */
function buildAccountKey(orgId: string, userId: string): string {
  return `${orgId}:${userId}`;
}

class KeychainService {
  /**
   * Persist a refresh token in the OS keychain.
   */
  async saveRefreshToken(orgId: string, userId: string, refreshToken: string): Promise<void> {
    const account = buildAccountKey(orgId, userId);
    try {
      const keytar = await getKeytar();
      await keytar.setPassword(SERVICE_NAME, account, refreshToken);
      logger.info("Refresh token saved to keychain", { account });
    } catch (error) {
      logger.error("Failed to save refresh token to keychain:", error);
    }
  }

  /**
   * Retrieve the refresh token for a given org + user.
   */
  async getRefreshToken(orgId: string, userId: string): Promise<string | null> {
    const account = buildAccountKey(orgId, userId);
    try {
      const keytar = await getKeytar();
      const token = await keytar.getPassword(SERVICE_NAME, account);
      logger.info("Refresh token retrieved from keychain", {
        account,
        found: !!token,
      });
      return token;
    } catch (error) {
      logger.error("Failed to get refresh token from keychain:", error);
      return null;
    }
  }

  /**
   * Remove the refresh token for a given org + user (logout).
   */
  async clearRefreshToken(orgId: string, userId: string): Promise<void> {
    const account = buildAccountKey(orgId, userId);
    try {
      const keytar = await getKeytar();
      await keytar.deletePassword(SERVICE_NAME, account);
      logger.info("Refresh token cleared from keychain", { account });
    } catch (error) {
      // deletePassword throws if credential doesn't exist — that's fine
      logger.warn("Failed to clear refresh token from keychain (may not exist):", error);
    }
  }

  /**
   * Find ALL stored refresh tokens for the Mitable service.
   * Returns account keys so we can clear them on full logout.
   */
  async findAllCredentials(): Promise<Array<{ account: string; password: string }>> {
    try {
      const keytar = await getKeytar();
      return await keytar.findCredentials(SERVICE_NAME);
    } catch (error) {
      logger.error("Failed to find credentials in keychain:", error);
      return [];
    }
  }

  /**
   * Clear ALL Mitable credentials from the keychain (full sign-out).
   */
  async clearAll(): Promise<void> {
    try {
      const credentials = await this.findAllCredentials();
      const keytar = await getKeytar();
      for (const cred of credentials) {
        await keytar.deletePassword(SERVICE_NAME, cred.account);
      }
      logger.info("All keychain credentials cleared", { count: credentials.length });
    } catch (error) {
      logger.error("Failed to clear all keychain credentials:", error);
    }
  }
}

export const keychainService = new KeychainService();
