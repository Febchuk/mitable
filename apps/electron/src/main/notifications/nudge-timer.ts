import { ctx } from "../context";
import { notificationLogger } from "../loggers";
// @deprecated — imports below unused after nudge timer was disabled
// import { preferencesService } from "../../services/preferencesService";
// import { monitoringSessionService } from "../../services/monitoringSessionService";
// import { showNotification } from "../windows/notification-window";

/**
 * @deprecated Nudge timer is being removed — users found it disruptive.
 * Kept as a no-op so existing call-sites don't break.
 */
export function startNotificationTimer() {
  notificationLogger.info("Nudge timer disabled (deprecated)");
  return;
}

export function stopNotificationTimer() {
  if (ctx.notificationTimer) {
    clearInterval(ctx.notificationTimer);
    ctx.notificationTimer = null;
    notificationLogger.info(" Notification timer stopped");
  }
}
