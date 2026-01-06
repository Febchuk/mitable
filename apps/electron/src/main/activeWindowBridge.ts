/**
 * Active Window Bridge - IPC handler for getting focused window info
 *
 * Uses active-win to detect which window is currently active.
 * This runs in the main process and exposes data to renderer via IPC.
 */

import { ipcMain } from "electron";
import { createLogger } from "../lib/logger";

const logger = createLogger("ActiveWindowBridge");
// Dynamic import for active-win (ESM-only package) - used in IPC handler

export type ActiveWindowInfo = {
  title: string;
  appName: string;
  processId?: number;
};

const IPC_CHANNEL = "mitable:get-active-window";

/**
 * Register IPC handler for getting active window info
 */
export function registerActiveWindowIPC(): void {
  ipcMain.handle(IPC_CHANNEL, async () => {
    try {
      // Dynamic import for ESM-only package (required for CJS main process)
      const activeWin = (await import("active-win")).default;
      const activeWindow = await activeWin();

      if (!activeWindow) {
        return {
          title: "",
          appName: "",
        } as ActiveWindowInfo;
      }

      return {
        title: activeWindow.title ?? "",
        appName: activeWindow.owner?.name ?? "",
        processId: activeWindow.owner?.processId,
      } as ActiveWindowInfo;
    } catch (error) {
      logger.error("Failed to get active window:", error);
      return {
        title: "",
        appName: "",
      } as ActiveWindowInfo;
    }
  });

  logger.info(`IPC handler registered on channel: ${IPC_CHANNEL}`);
}

/**
 * Initialize the active window bridge
 * Call this once during app startup
 */
export function initActiveWindowBridge(): void {
  registerActiveWindowIPC();
}
