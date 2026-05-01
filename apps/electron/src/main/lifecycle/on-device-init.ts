import { consoleLogger } from "../loggers";

/**
 * Initialize on-device AI module (SQLite + model manager only, no VRAM loading).
 * Ollama model is loaded into VRAM on-demand when a session ends, not at startup.
 */
export async function initOnDeviceAI(): Promise<void> {
  try {
    const { modelManager, localDb } = await import("../../services/on-device");
    await modelManager.initialize();
    await localDb.initialize();
    consoleLogger.info(
      `On-device AI module initialized (SQLite: ${localDb.isAvailable() ? "OK" : "UNAVAILABLE"})`
    );
    if (!localDb.isAvailable() && modelManager.isEnabled()) {
      consoleLogger.warn(
        "On-device AI is enabled but SQLite is unavailable — run `npm run rebuild-native` in apps/electron"
      );
    }
  } catch (err) {
    consoleLogger.warn("On-device AI init skipped:", String(err));
  }
}
