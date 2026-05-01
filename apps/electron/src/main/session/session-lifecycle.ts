import { SESSION_DEFAULTS } from "@mitable/shared";
import { ctx } from "../context";
import { shutdownLogger } from "../loggers";
import { createLogger } from "../../lib/logger";
import { monitoringSessionService } from "../../services/monitoringSessionService";
import { passiveMonitorService } from "../../services/passiveMonitorService";
import { preferencesService } from "../../services/preferencesService";
import {
  createWatchingPillWindow,
  showPillReliably,
  startPillCursorTracking,
} from "../windows/watching-pill-window";
import { cleanupAudioRecording } from "./audio-cleanup";

/**
 * Start a session from main process (used by shortcuts, pill, and passive monitoring).
 */
export async function startSessionFromMain(
  sessionType: "focused" | "passive" = "focused"
): Promise<{
  success: boolean;
  error?: string;
  sessionId?: string;
}> {
  const shortcutLogger = createLogger("SessionShortcut");

  if (!ctx.currentUserContext) {
    shortcutLogger.warn(" Start session failed: User not logged in");
    if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
      ctx.consoleWindow.show();
      ctx.consoleWindow.focus();
    }
    return { success: false, error: "Please log in through the Console first" };
  }

  const existingSession = monitoringSessionService.getSessionState();
  if (existingSession) {
    shortcutLogger.warn(" Start session failed: Session already active");
    return { success: false, error: "A session is already active" };
  }

  try {
    if (sessionType === "focused") {
      await passiveMonitorService.onManualSessionStart();
    }

    const captureIntervalMs = SESSION_DEFAULTS.CAPTURE_INTERVAL_MS;

    const { randomUUID } = await import("crypto");
    const sessionId = randomUUID();
    shortcutLogger.info(`Creating local session: ${sessionId} (type: ${sessionType})`);

    const startResult = await monitoringSessionService.startSession({
      sessionId,
      selectedWindows: [],
      captureIntervalMs,
      userId: ctx.currentUserContext.userId,
      organizationId: ctx.currentUserContext.organizationId,
    });

    if (!startResult.error) {
      shortcutLogger.info("Session started successfully");

      const shouldShowPill = preferencesService.getShowPillOnSessionStart();
      if (shouldShowPill) {
        if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) {
          createWatchingPillWindow();
        }
        if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
          showPillReliably(ctx.watchingPillWindow);
          startPillCursorTracking();
        }
      }

      return { success: true, sessionId: startResult.sessionId };
    }

    return { success: false, error: startResult.error };
  } catch (error) {
    shortcutLogger.error(" Start session error:", error);
    return { success: false, error: "Failed to start session" };
  }
}

/**
 * End a passive session from main process.
 */
export async function endPassiveSessionFromMain(sessionId: string): Promise<void> {
  const passiveLogger = createLogger("PassiveSession");
  passiveLogger.info(`Ending passive session: ${sessionId}`);

  try {
    const endResult = await monitoringSessionService.endSession();

    if (endResult.success) {
      passiveLogger.info(`Passive session ended, ${endResult.captureCount} captures`);
    }

    if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
      ctx.watchingPillWindow.hide();
    }
  } catch (error) {
    passiveLogger.error("Error ending passive session:", error);
  }
}

/**
 * End all active sessions (focused or passive) with a timeout.
 * Used by before-quit, suspend, and shutdown handlers.
 * Best-effort: if backend call fails, stale cleanup catches it on next startup.
 */
export async function endAllActiveSessions(timeoutMs: number): Promise<void> {
  const passiveState = passiveMonitorService.getState();
  const sessionState = monitoringSessionService.getSessionState();

  const sessionId = sessionState?.id ?? passiveState.sessionId;

  if (!sessionId) {
    shutdownLogger.info("No active session to end");
    return;
  }

  shutdownLogger.info(
    `Ending active session ${sessionId} (timeout: ${timeoutMs}ms, ` +
      `focused: ${sessionState?.status ?? "none"}, passive: ${passiveState.state})`
  );

  await cleanupAudioRecording(sessionId);

  try {
    const result = await monitoringSessionService.endSession();
    if (result.success) {
      shutdownLogger.info(`Local session ended, ${result.captureCount} captures`);
    }
  } catch (error) {
    shutdownLogger.error("Error ending local session:", error);
  }

  passiveMonitorService.forceReset();

  if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
    ctx.watchingPillWindow.hide();
  }
}
