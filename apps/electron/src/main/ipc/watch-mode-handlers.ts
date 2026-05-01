import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import type { SelectedWindowInfo } from "@mitable/shared";
import { ctx } from "../context";
import { ipcLogger, watchModeLogger } from "../loggers";
import { windowDetectionService } from "../../services/windowDetectionService";
import { captureService } from "../../services/captureService";
import { focusWindowTracker } from "../../services/focusWindowTracker";
import { isBlockedByPolicy } from "../../services/capturePolicy";
import { resolveWindowUrlForWatchSelection } from "../../services/macWindowFocusService";
import { createWatchButtonWindow, isBrowserProcess } from "../windows";

export function registerWatchModeHandlers() {
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_TOGGLE, async (_event, enabled: boolean) => {
    watchModeLogger.info(` Toggling watch mode: ${enabled}`);

    windowDetectionService.setWatchingMode(enabled);

    if (enabled) {
      const windows = await windowDetectionService.getAllVisibleWindows();
      watchModeLogger.info(` Found ${windows.length} watchable windows`);

      for (const window of windows) {
        createWatchButtonWindow(window, ctx.watchButtonWindows);
      }
    } else {
      watchModeLogger.info(" Closing all watch button windows");
      for (const [windowId, buttonWindow] of ctx.watchButtonWindows.entries()) {
        if (!buttonWindow.isDestroyed()) {
          buttonWindow.close();
        }
        ctx.watchButtonWindows.delete(windowId);
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_GET_ALL, async () => {
    try {
      const windows = await windowDetectionService.getAllVisibleWindows();
      watchModeLogger.info(` Returning ${windows.length} visible windows`);
      return { success: true, windows };
    } catch (error) {
      watchModeLogger.error(" Error getting visible windows:", error);
      return { success: false, windows: [], error: String(error) };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.WATCH_WINDOW_SELECT,
    async (_event, windowInfo: SelectedWindowInfo) => {
      watchModeLogger.info(
        `Selecting window: ${windowInfo.appName} (${windowInfo.windowTitle}) [${windowInfo.windowId}]`
      );

      const windowDetails = windowDetectionService.getWindowDetails(windowInfo.windowId);

      if (!windowDetails) {
        watchModeLogger.warn(
          "[Watch Mode] Window details not found for selection, likely closed or stale",
          {
            windowId: windowInfo.windowId,
            appName: windowInfo.appName,
            windowTitle: windowInfo.windowTitle,
          }
        );
        return {
          allowed: false,
          reason: "This window is no longer available. Please try again.",
        };
      }

      if (process.platform !== "darwin") {
        const isBrowser = isBrowserProcess(windowDetails.appName, windowDetails.path);
        if (isBrowser) {
          watchModeLogger.info(" Blocking browser window selection on non-macOS platform", {
            appName: windowDetails.appName,
            path: windowDetails.path,
          });
          return {
            allowed: false,
            reason: "Browser windows cannot be watched on this platform to protect sensitive data.",
          };
        }

        return selectWindowForWatch(windowInfo);
      }

      let resolvedTitle = windowDetails.title;
      let resolvedAppName = windowDetails.appName;
      let resolvedUrl: string | undefined = undefined;

      const isBrowserApp = isBrowserProcess(windowDetails.appName, windowDetails.path);

      if (isBrowserApp) {
        const resolved = await resolveWindowUrlForWatchSelection({
          processId: windowDetails.processId,
          appName: windowDetails.appName,
          windowTitle: windowDetails.title,
        });

        resolvedTitle = resolved.title;
        resolvedAppName = resolved.appName;
        resolvedUrl = resolved.url;
      }

      const policyDecision = isBlockedByPolicy(
        resolvedTitle,
        resolvedAppName,
        undefined,
        resolvedUrl
      );

      if (policyDecision.blocked) {
        watchModeLogger.info(" Selection blocked by capture policy", {
          title: resolvedTitle,
          appName: resolvedAppName,
          reason: policyDecision.reason,
          hasUrl: !!resolvedUrl,
        });
        return {
          allowed: false,
          reason: policyDecision.reason || "Blocked by capture policy.",
        };
      }

      return selectWindowForWatch(windowInfo);
    }
  );

  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOW_UNSELECT, async (_event, windowId: string) => {
    watchModeLogger.info(` Unselecting window: ${windowId}`);

    const selectedWindows = windowDetectionService.getSelectedWindows();
    const windowToRemove = selectedWindows.find((w) => w.windowId === windowId);

    const removed = windowDetectionService.removeWindow(windowId);
    focusWindowTracker.removeTrackedWindow(windowId);

    if (removed) {
      if (windowToRemove) {
        captureService.clearCachedScreenshot(windowToRemove.windowTitle);
        watchModeLogger.info(` Cleared cache for ${windowToRemove.windowTitle}`);
      }
      broadcastWatchWindowsUpdate();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_GET_SELECTED, async () => {
    const selectedWindows = windowDetectionService.getSelectedWindows();
    watchModeLogger.info(` Returning ${selectedWindows.length} selected windows`);
    return selectedWindows;
  });

  function broadcastWatchWindowsUpdate() {
    const selectedWindows = windowDetectionService.getSelectedWindows();
    const windows = [ctx.consoleWindow, ctx.watchingPillWindow];

    for (const window of windows) {
      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, selectedWindows);
      }
    }

    watchModeLogger.info(
      `Broadcasted update to windows. Selected windows: ${
        selectedWindows.map((window) => `${window.appName} - ${window.windowTitle}`).join(", ") ||
        "none"
      }`
    );
  }

  async function selectWindowForWatch(
    windowInfo: SelectedWindowInfo
  ): Promise<{ allowed: boolean }> {
    const added = windowDetectionService.addWindow(windowInfo);

    if (added) {
      const buttonWindow = ctx.watchButtonWindows.get(windowInfo.windowId);

      if (buttonWindow && !buttonWindow.isDestroyed()) {
        watchModeLogger.info(
          `Closing button for selected window: ${windowInfo.appName} (windowId: ${windowInfo.windowId})`
        );
        buttonWindow.close();
      }

      ctx.watchButtonWindows.delete(windowInfo.windowId);
      broadcastWatchWindowsUpdate();

      try {
        const captureResult = await captureService.captureVisibleWindows(false);
        if (captureResult.success && captureResult.screenshots) {
          const screenshot = captureResult.screenshots.find(
            (s) => s.windowTitle.toLowerCase() === windowInfo.windowTitle.toLowerCase()
          );
          if (screenshot) {
            captureService.cacheScreenshot(windowInfo.windowTitle, {
              appName: windowInfo.appName,
              windowTitle: windowInfo.windowTitle,
              dataUrl: screenshot.dataUrl,
              capturedAt: Date.now(),
              metadata: screenshot.metadata,
            });
            watchModeLogger.info(
              `Cached screenshot for ${windowInfo.windowTitle} at selection time`
            );
          }
        }
      } catch (error) {
        watchModeLogger.warn(" Failed to cache screenshot at selection time:", error);
      }
    }

    return { allowed: true };
  }

  ipcLogger.info(" Watch mode handlers registered successfully");
}
