import { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { consoleLogger } from "../loggers";
import { ctx } from "../context";

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

/**
 * Eagerly preload Ollama model and Whisper CLI in the background.
 * Non-blocking — the app continues startup while this runs.
 * Once complete, processes any sessions that ended before models were ready.
 */
export async function eagerPreloadModels(): Promise<void> {
  const broadcastReadiness = (ready: boolean, error?: string) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ON_DEVICE_READINESS_UPDATE, { ready, error });
      }
    });
  };

  try {
    consoleLogger.info("[EagerPreload] Starting background model preload...");

    // 1. Pull + warm Ollama model (hardware-aware)
    const { initialize } = await import("../../services/on-device/ollamaLifecycle");
    await initialize();
    consoleLogger.info("[EagerPreload] Ollama model pulled and warmed");

    // 2. Download whisper-cli + model if not already installed
    const { modelManager } = await import("../../services/on-device");
    await modelManager.ensureWhisperInstalled();
    consoleLogger.info("[EagerPreload] Whisper CLI ensured");

    // Mark ready
    ctx.onDeviceReady = true;
    ctx.onDeviceError = null;
    broadcastReadiness(true);
    consoleLogger.info("[EagerPreload] On-device AI ready");

    // Recover sessions stuck in "summarizing" from previous app runs
    try {
      const { localDb } = await import("../../services/on-device");
      const stuckSessions = localDb.getSessionsByStatus("summarizing");
      if (stuckSessions.length > 0) {
        consoleLogger.info(
          `[EagerPreload] Found ${stuckSessions.length} session(s) stuck in "summarizing" — adding to queue`
        );
        const { localFrameStorage } = await import("../../services/localFrameStorage");
        for (const session of stuckSessions) {
          const sessionDir = localFrameStorage.getSessionPath(session.id);
          ctx.pendingSessions.push({ sessionId: session.id, sessionDir });
        }
      }
    } catch (err) {
      consoleLogger.warn("[EagerPreload] Failed to check for stuck sessions:", String(err));
    }

    // Process any sessions that ended while models were downloading
    if (ctx.pendingSessions.length > 0) {
      consoleLogger.info(
        `[EagerPreload] Processing ${ctx.pendingSessions.length} queued session(s)...`
      );
      const pending = [...ctx.pendingSessions];
      ctx.pendingSessions = [];

      for (const { sessionId, sessionDir } of pending) {
        try {
          const { localInferenceService } = await import("../../services/on-device");

          const broadcastProgress = (progress: Record<string, unknown>) => {
            BrowserWindow.getAllWindows().forEach((win) => {
              if (!win.isDestroyed()) {
                win.webContents.send(IPC_CHANNELS.ON_DEVICE_PIPELINE_PROGRESS, progress);
              }
            });
          };

          consoleLogger.info(`[EagerPreload] Processing queued session: ${sessionId}`);
          const timeoutMs = 1_200_000;
          await Promise.race([
            localInferenceService.processAllAtEnd(sessionId, sessionDir, broadcastProgress),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`processAllAtEnd timed out after ${timeoutMs / 1000}s`)),
                timeoutMs
              )
            ),
          ]);

          // Mark session as ready in SQLite
          const { localDb } = await import("../../services/on-device");
          const story = localDb.getStoryForSession(sessionId);
          localDb.updateMonitoringSessionStatus(sessionId, "ready", {
            finalSummary: story?.narrative ?? null,
          });

          // Broadcast session update so UI refreshes
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.MONITORING_SESSION_UPDATE, null);
            }
          });

          consoleLogger.info(`[EagerPreload] Queued session processed: ${sessionId}`);
        } catch (err) {
          consoleLogger.error(
            `[EagerPreload] Failed to process queued session ${sessionId}:`,
            String(err)
          );
        }
      }
    }
  } catch (err) {
    ctx.onDeviceError = String(err);
    ctx.onDeviceReady = false;
    broadcastReadiness(false, String(err));
    consoleLogger.error("[EagerPreload] Failed:", String(err));
  }
}
