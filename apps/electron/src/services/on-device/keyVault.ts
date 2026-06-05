/**
 * Key Vault — Secure credential storage via OS keychain (keytar).
 *
 * Stores BYOK inference provider config and optional Resend API key.
 * All credentials stay on-device — no backend round-trip needed.
 */

import { createLogger } from "../../lib/logger";
import { KEYCHAIN_SERVICE } from "../../lib/env";
import type { ProviderConfig, ProviderName } from "./providers/types";

const logger = createLogger("KeyVault");

const SERVICE_NAME = KEYCHAIN_SERVICE;
const ACCOUNT_PROVIDER = "inference:provider";
const ACCOUNT_KEY = "inference:apiKey";
const ACCOUNT_MODEL = "inference:model";
const ACCOUNT_RESEND = "resend:apiKey";

let _keytar: typeof import("keytar") | null = null;

async function getKeytar(): Promise<typeof import("keytar")> {
  if (!_keytar) {
    const mod: any = await import("keytar");
    _keytar = mod.default || mod;
  }
  return _keytar!;
}

class KeyVault {
  private cachedConfig: ProviderConfig | null = null;

  async store(config: ProviderConfig): Promise<void> {
    try {
      const keytar = await getKeytar();
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_PROVIDER, config.provider);
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_KEY, config.apiKey);
      if (config.model) {
        await keytar.setPassword(SERVICE_NAME, ACCOUNT_MODEL, config.model);
      }
      this.cachedConfig = config;
      logger.info(`Inference config stored for provider: ${config.provider}`);
    } catch (err) {
      logger.error("Failed to store inference config:", String(err));
      throw err;
    }
  }

  async load(): Promise<ProviderConfig | null> {
    if (this.cachedConfig) return this.cachedConfig;

    try {
      const keytar = await getKeytar();
      const provider = await keytar.getPassword(SERVICE_NAME, ACCOUNT_PROVIDER);
      const apiKey = await keytar.getPassword(SERVICE_NAME, ACCOUNT_KEY);

      if (!provider || !apiKey) {
        logger.info("No inference config found in keychain");
        return null;
      }

      const model = await keytar.getPassword(SERVICE_NAME, ACCOUNT_MODEL);

      this.cachedConfig = {
        provider: provider as ProviderName,
        apiKey,
        model: model || undefined,
      };

      logger.info(`Loaded inference config: provider=${provider}`);
      return this.cachedConfig;
    } catch (err) {
      logger.error("Failed to load inference config:", String(err));
      return null;
    }
  }

  /**
   * Load config and return a safe summary for the renderer (masked key).
   */
  async loadSafe(): Promise<{ provider: string; maskedKey: string } | null> {
    const config = await this.load();
    if (!config) return null;
    const masked =
      config.apiKey.length > 8
        ? config.apiKey.slice(0, 4) + "..." + config.apiKey.slice(-4)
        : "****";
    return { provider: config.provider, maskedKey: masked };
  }

  async clear(): Promise<void> {
    try {
      const keytar = await getKeytar();
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_PROVIDER).catch(() => {});
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_KEY).catch(() => {});
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_MODEL).catch(() => {});
      this.cachedConfig = null;
      logger.info("Inference config cleared from keychain");
    } catch (err) {
      logger.warn("Failed to clear inference config:", String(err));
    }
  }

  isConfigured(): boolean {
    return this.cachedConfig !== null;
  }

  getCached(): ProviderConfig | null {
    return this.cachedConfig;
  }

  // ── Resend key ──

  async storeResendKey(apiKey: string): Promise<void> {
    try {
      const keytar = await getKeytar();
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_RESEND, apiKey);
      logger.info("Resend API key stored");
    } catch (err) {
      logger.error("Failed to store Resend key:", String(err));
      throw err;
    }
  }

  async loadResendKey(): Promise<string | null> {
    try {
      const keytar = await getKeytar();
      return await keytar.getPassword(SERVICE_NAME, ACCOUNT_RESEND);
    } catch (err) {
      logger.error("Failed to load Resend key:", String(err));
      return null;
    }
  }

  async clearResendKey(): Promise<void> {
    try {
      const keytar = await getKeytar();
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_RESEND).catch(() => {});
      logger.info("Resend API key cleared");
    } catch (err) {
      logger.warn("Failed to clear Resend key:", String(err));
    }
  }

  async hasResendKey(): Promise<boolean> {
    const key = await this.loadResendKey();
    return !!key;
  }
}

export const keyVault = new KeyVault();
