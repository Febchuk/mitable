import { app } from "electron";
import { ctx } from "../context";
import { shutdownLogger } from "../loggers";
import { endAllActiveSessions } from "../session/session-lifecycle";
import { stopNotificationTimer } from "../notifications/nudge-timer";
import { monitoringSessionService } from "../../services/monitoringSessionService";
import { passiveMonitorService } from "../../services/passiveMonitorService";
import { focusWindowTracker } from "../../services/focusWindowTracker";
import { updateService } from "../../services/updateService";
import { browserBridgeService } from "../../services/browserBridgeService";
import { shutdownAnalytics, trackMainEvent } from "../../services/analyticsService";

/**
 * Register both `before-quit` handlers:
 * 1. Session-aware handler — ends active sessions before allowing quit.
 * 2. Cleanup handler — stops services, flushes analytics.
 */
export function registerBeforeQuitHandlers(): void {
  // End active sessions before quit
  app.on("before-quit", async (event) => {
    if (ctx.isEndingSession) return;

    const sessionState = monitoringSessionService.getSessionState();
    const passiveState = passiveMonitorService.getState();
    const hasActiveSession =
      (sessionState && (sessionState.status === "active" || sessionState.status === "paused")) ||
      passiveState.sessionId !== null;

    if (hasActiveSession) {
      event.preventDefault();
      ctx.isEndingSession = true;

      shutdownLogger.info("Ending active session before quit...");
      await endAllActiveSessions(5000);

      app.quit();
    }
  });

  // Service cleanup + analytics flush
  app.on("before-quit", async () => {
    updateService.stopPeriodicChecks();
    stopNotificationTimer();
    focusWindowTracker.stop();
    passiveMonitorService.forceReset();
    browserBridgeService.stop();

    try {
      const { whisperCliService, sherpaWhisperService } = await import("../../services/on-device");
      whisperCliService.shutdown();
      sherpaWhisperService.shutdown();
    } catch {
      /* ignore */
    }

    if (ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_app_quit");
    }
    shutdownAnalytics();
  });
}
