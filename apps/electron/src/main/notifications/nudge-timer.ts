import { ctx } from "../context";
import { notificationLogger } from "../loggers";
import { preferencesService } from "../../services/preferencesService";
import { monitoringSessionService } from "../../services/monitoringSessionService";
import { showNotification } from "../windows/notification-window";

export function startNotificationTimer() {
  let notificationFrequencyMinutes = 30;
  if (ctx.currentUserContext?.userId) {
    notificationFrequencyMinutes = preferencesService.getUserNotificationFrequency(
      ctx.currentUserContext.userId
    );
  }
  const NOTIFICATION_INTERVAL = notificationFrequencyMinutes * 60 * 1000;

  if (ctx.notificationTimer) {
    clearInterval(ctx.notificationTimer);
  }

  ctx.notificationTimer = setInterval(() => {
    const sessionState = monitoringSessionService.getSessionState();
    const isMonitoringActive =
      sessionState?.status === "active" || sessionState?.status === "paused";
    const isLoggedIn = ctx.authTokens.accessToken !== null;

    if (!isMonitoringActive && isLoggedIn) {
      notificationLogger.info(" Triggering periodic notification (monitoring is off)");
      showNotification({
        title: "Ready to track your work?",
        message: "Turn on Mitable to log your activity and get better insights.",
        actions: [
          { id: "turn-on", label: "Turn On", primary: true },
          { id: "dismiss", label: "Later" },
        ],
        timeout: 10000,
      });
    }
  }, NOTIFICATION_INTERVAL);

  notificationLogger.info(
    ` Notification timer started (${notificationFrequencyMinutes} min interval)`
  );
}

export function stopNotificationTimer() {
  if (ctx.notificationTimer) {
    clearInterval(ctx.notificationTimer);
    ctx.notificationTimer = null;
    notificationLogger.info(" Notification timer stopped");
  }
}
