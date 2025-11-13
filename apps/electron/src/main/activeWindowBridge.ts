/**
 * Active Window Bridge - IPC handler for getting focused window info
 * 
 * Uses active-win to detect which window is currently active.
 * This runs in the main process and exposes data to renderer via IPC.
 */

import { ipcMain } from "electron";
import activeWin from "active-win";

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
      console.error("[ActiveWindowBridge] Failed to get active window:", error);
      return {
        title: "",
        appName: "",
      } as ActiveWindowInfo;
    }
  });

  console.log(`[ActiveWindowBridge] IPC handler registered on channel: ${IPC_CHANNEL}`);
}

/**
 * Initialize the active window bridge
 * Call this once during app startup
 */
export function initActiveWindowBridge(): void {
  registerActiveWindowIPC();
}
