import { powerMonitor } from "electron";
import { ctx } from "../context";
import { shutdownLogger } from "../loggers";
import {
  endAllActiveSessions,
  startSessionFromMain,
  endPassiveSessionFromMain,
} from "../session/session-lifecycle";
import { passiveMonitorService } from "../../services/passiveMonitorService";
import { preferencesService } from "../../services/preferencesService";
import { audioWebSocketService } from "../../services/audioWebSocketService";

/**
 * Register suspend / resume / shutdown handlers on Electron's powerMonitor.
 */
export function registerPowerMonitorHandlers(): void {
  // Suspend — laptop lid close / system sleep
  powerMonitor.on("suspend", async () => {
    shutdownLogger.info("System suspending (lid close / sleep)");
    if (ctx.isEndingSession) return;

    ctx.wasPassiveRunning = passiveMonitorService.wasEnabled();
    ctx.isEndingSession = true;

    await endAllActiveSessions(3000);

    ctx.isEndingSession = false;
  });

  // Resume — laptop lid open / system wake
  powerMonitor.on("resume", () => {
    shutdownLogger.info("System resumed from suspend");

    if (ctx.wasPassiveRunning) {
      const userId = ctx.currentUserContext?.userId;
      const prefEnabled = userId
        ? preferencesService.getUserPassiveMonitoringEnabled(userId)
        : false;

      if (prefEnabled) {
        shutdownLogger.info("Restarting passive monitoring after resume (5s delay)");
        setTimeout(() => {
          const stillEnabled = userId
            ? preferencesService.getUserPassiveMonitoringEnabled(userId)
            : false;
          if (stillEnabled && passiveMonitorService.getState().state === "disabled") {
            passiveMonitorService.enable({
              startSession: () => startSessionFromMain("passive"),
              endSession: (sessionId) => endPassiveSessionFromMain(sessionId),
              isAudioActive: () => audioWebSocketService.isConnected(),
            });
          }
        }, 5000);
      }
      ctx.wasPassiveRunning = false;
    }
  });

  // Shutdown — system shutdown / restart
  powerMonitor.on("shutdown", async () => {
    shutdownLogger.info("System shutting down");
    if (ctx.isEndingSession) return;
    ctx.isEndingSession = true;

    await endAllActiveSessions(3000);
  });
}
