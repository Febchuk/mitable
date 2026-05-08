import { BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { consoleLogger } from "../loggers";
import { ctx } from "../context";

/**
 * Initialize on-device module (PGlite database).
 * Whisper setup is handled separately by whisperSetupService in ready.ts.
 */
export async function initOnDeviceAI(): Promise<void> {
  try {
    const { pgDb } = await import("../../services/on-device");
    await pgDb.initialize();
    consoleLogger.info(
      `On-device module initialized (PGlite: ${pgDb.isAvailable() ? "OK" : "UNAVAILABLE"})`
    );
    if (!pgDb.isAvailable()) {
      consoleLogger.warn("PGlite unavailable — database functionality will be limited.");
      return;
    }
  } catch (err) {
    consoleLogger.error("On-device init failed:", String(err));
  }
}

/**
 * Eagerly preload Whisper CLI in the background.
 * Non-blocking — the app continues startup while this runs.
 * Once complete, processes any sessions that ended before models were ready.
 * @deprecated Ollama preload removed — BYOK cloud inference is the only LLM path.
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
    consoleLogger.info("[EagerPreload] Starting background preload...");

    // whisperSetupService.ensure() already runs at startup in ready.ts,
    // but call again here as a safety net (no-ops if already complete)
    const { whisperSetupService } = await import("../../services/on-device");
    await whisperSetupService.ensure();
    consoleLogger.info("[EagerPreload] Whisper CLI ensured");

    // Mark ready
    ctx.onDeviceReady = true;
    ctx.onDeviceError = null;
    broadcastReadiness(true);
    consoleLogger.info("[EagerPreload] On-device AI ready");

    // Recover sessions stuck in "summarizing" from previous app runs
    try {
      const { pgDb } = await import("../../services/on-device");
      const stuckSessions = await pgDb.getSessionsByStatus("summarizing");
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

          // Mark session as ready in PGlite
          const { pgDb } = await import("../../services/on-device");
          const story = await pgDb.getStoryForSession(sessionId);
          await pgDb.updateMonitoringSessionStatus(
            sessionId,
            "ended",
            story?.narrative ? Date.now() : undefined
          );

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
