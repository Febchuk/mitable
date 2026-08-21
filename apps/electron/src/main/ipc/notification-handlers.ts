import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ipcLogger, notificationLogger } from "../loggers";
import { notificationService } from "../../services/notificationService";
import { showNotification, hideNotification, handleNotificationAction } from "../windows";
import type { NotificationConfig } from "../windows";

export function registerNotificationHandlers() {
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SHOW, async (_, config: NotificationConfig) => {
    showNotification(config);
    return { success: true };
  });

  ipcMain.on(IPC_CHANNELS.NOTIFICATION_HIDE, () => {
    hideNotification();
  });

  ipcMain.on(IPC_CHANNELS.NOTIFICATION_ACTION, async (_, actionId: string) => {
    notificationLogger.info("Notification action (IPC):", actionId);
    hideNotification();
    handleNotificationAction(actionId);
  });

  ipcMain.handle(
    IPC_CHANNELS.SHOW_RECAP_NOTIFICATION,
    async (_, config: { title: string; message: string }) => {
      notificationService.notifyRecapReady(config.title);
      return { success: true };
    }
  );

  ipcLogger.info(" Notification handlers registered successfully");
}
