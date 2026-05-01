import { app, ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import type { WatchableWindow } from "@mitable/shared";
import { ctx } from "../context";
import { monitoringLogger, watchingPillLogger } from "../loggers";
import { windowDetectionService } from "../../services/windowDetectionService";
import { monitoringSessionService } from "../../services/monitoringSessionService";
import { preferencesService } from "../../services/preferencesService";
import { authManager } from "../../services/authManager";
import {
  createConsoleWindow,
  createWatchingPillWindow,
  createWatchingPillEyeDropdown,
  createWatchingPillMenuDropdown,
  showPillReliably,
  startPillCursorTracking,
  stopPillCursorTracking,
} from "../windows";
import { startSessionFromMain, cleanupAudioRecording } from "../session";

export function registerPillHandlers() {
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_HIDE, () => {
    watchingPillLogger.info(" Hide requested");
    stopPillCursorTracking();
    if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
      ctx.watchingPillWindow.hide();
    }
  });

  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_SHOW, () => {
    watchingPillLogger.info(" Show requested");
    if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) {
      createWatchingPillWindow();
    }
    if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
      showPillReliably(ctx.watchingPillWindow);
      startPillCursorTracking();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WATCHING_PILL_SHOW_EYE_DROPDOWN, async () => {
    if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) return;

    if (Date.now() - ctx.eyeDropdownLastHidden < 200) {
      return;
    }

    if (
      ctx.watchingPillEyeDropdown &&
      !ctx.watchingPillEyeDropdown.isDestroyed() &&
      ctx.watchingPillEyeDropdown.isVisible()
    ) {
      ctx.watchingPillEyeDropdown.hide();
      return;
    }

    if (!ctx.watchingPillEyeDropdown || ctx.watchingPillEyeDropdown.isDestroyed()) {
      createWatchingPillEyeDropdown();
    }

    const pillBounds = ctx.watchingPillWindow.getBounds();
    if (ctx.watchingPillEyeDropdown && !ctx.watchingPillEyeDropdown.isDestroyed()) {
      ctx.watchingPillEyeDropdown.setBounds({
        x: pillBounds.x - 250,
        y: pillBounds.y + 40,
        width: 240,
        height: 280,
      });

      const sendEyeData = async () => {
        if (!ctx.watchingPillEyeDropdown || ctx.watchingPillEyeDropdown.isDestroyed()) return;

        const selectedWindows = windowDetectionService.getSelectedWindows();
        ctx.watchingPillEyeDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
          type: "eye",
          selectedWindows,
          availableWindows: [],
          isLoading: true,
        });

        let availableWindows: WatchableWindow[] = [];
        try {
          availableWindows = await windowDetectionService.getAllVisibleWindows();
        } catch (error) {
          watchingPillLogger.error(" Failed to get visible windows:", error);
        }

        if (ctx.watchingPillEyeDropdown && !ctx.watchingPillEyeDropdown.isDestroyed()) {
          ctx.watchingPillEyeDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
            type: "eye",
            selectedWindows: windowDetectionService.getSelectedWindows(),
            availableWindows,
            isLoading: false,
          });
        }
      };

      ctx.watchingPillEyeDropdown.show();
      ctx.watchingPillEyeDropdown.focus();

      if (ctx.eyeDropdownReady) {
        sendEyeData();
      } else {
        ctx.watchingPillEyeDropdown.webContents.once("did-finish-load", () => {
          sendEyeData();
        });
      }
    }
  });

  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_HIDE_EYE_DROPDOWN, () => {
    if (ctx.watchingPillEyeDropdown && !ctx.watchingPillEyeDropdown.isDestroyed()) {
      ctx.watchingPillEyeDropdown.hide();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WATCHING_PILL_SHOW_MENU_DROPDOWN, async () => {
    if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) return;

    if (Date.now() - ctx.menuDropdownLastHidden < 200) {
      return;
    }

    if (
      ctx.watchingPillMenuDropdown &&
      !ctx.watchingPillMenuDropdown.isDestroyed() &&
      ctx.watchingPillMenuDropdown.isVisible()
    ) {
      ctx.watchingPillMenuDropdown.hide();
      return;
    }

    if (!ctx.watchingPillMenuDropdown || ctx.watchingPillMenuDropdown.isDestroyed()) {
      createWatchingPillMenuDropdown();
    }

    const pillBounds = ctx.watchingPillWindow.getBounds();
    if (ctx.watchingPillMenuDropdown && !ctx.watchingPillMenuDropdown.isDestroyed()) {
      ctx.watchingPillMenuDropdown.setBounds({
        x: pillBounds.x - 170,
        y: pillBounds.y + 90,
        width: 160,
        height: 100,
      });

      const sendMenuData = () => {
        if (!ctx.watchingPillMenuDropdown || ctx.watchingPillMenuDropdown.isDestroyed()) return;
        const sessionState = monitoringSessionService.getSessionState();
        const selectedWindows = windowDetectionService.getSelectedWindows();
        ctx.watchingPillMenuDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
          type: "menu",
          sessionState,
          selectedWindows,
        });
      };

      ctx.watchingPillMenuDropdown.show();
      ctx.watchingPillMenuDropdown.focus();

      if (ctx.menuDropdownReady) {
        sendMenuData();
      } else {
        ctx.watchingPillMenuDropdown.webContents.once("did-finish-load", () => {
          sendMenuData();
        });
      }
    }
  });

  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_HIDE_MENU_DROPDOWN, () => {
    if (ctx.watchingPillMenuDropdown && !ctx.watchingPillMenuDropdown.isDestroyed()) {
      ctx.watchingPillMenuDropdown.hide();
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.WATCHING_PILL_DROPDOWN_ACTION,
    async (_event, action: { type: string; payload?: unknown }) => {
      watchingPillLogger.info(" Dropdown action:", action);

      switch (action.type) {
        case "select-window": {
          const payload = action.payload as {
            windowId: string;
            appName: string;
            windowTitle: string;
          };
          windowDetectionService.addWindow({
            windowId: payload.windowId,
            appName: payload.appName,
            windowTitle: payload.windowTitle,
          });
          const selectedWindows = windowDetectionService.getSelectedWindows();
          if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
            ctx.watchingPillWindow.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          if (ctx.watchingPillEyeDropdown && !ctx.watchingPillEyeDropdown.isDestroyed()) {
            ctx.watchingPillEyeDropdown.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          return { success: true };
        }
        case "unselect-window": {
          const windowId = action.payload as string;
          windowDetectionService.removeWindow(windowId);
          const selectedWindows = windowDetectionService.getSelectedWindows();
          if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
            ctx.watchingPillWindow.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          if (ctx.watchingPillEyeDropdown && !ctx.watchingPillEyeDropdown.isDestroyed()) {
            ctx.watchingPillEyeDropdown.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          return { success: true };
        }
        case "start-session": {
          return startSessionFromMain();
        }
        case "pause-session": {
          return monitoringSessionService.pauseSession();
        }
        case "resume-session": {
          return monitoringSessionService.resumeSession();
        }
        case "end-session": {
          const sessionState = monitoringSessionService.getSessionState();
          if (!sessionState?.id) {
            monitoringLogger.warn(" No active session found for end-session action");
            return { success: false, error: "No active session" };
          }

          monitoringLogger.info(" Ending session from pill with stored defaults");
          const summaryDefaults = preferencesService.getSummaryDefaults();

          const runEndSession = async () => {
            const preEndState = monitoringSessionService.getSessionState();
            await cleanupAudioRecording(preEndState?.id);

            const result = await monitoringSessionService.endSession();

            if (!result.success || !result.sessionId) {
              return result;
            }

            if (!result.localMode) {
              try {
                const autoRecapEnabled = ctx.currentUserContext?.userId
                  ? preferencesService.getUserAutoRecap(ctx.currentUserContext.userId)
                  : true;

                if (result.captures && result.captures.length > 0) {
                  monitoringLogger.info(` Uploading ${result.captures.length} captures to backend`);
                  await authManager.authenticatedFetch(
                    `/api/monitoring/sessions/${result.sessionId}/captures`,
                    {
                      method: "POST",
                      body: JSON.stringify({ captures: result.captures }),
                    }
                  );
                }

                await authManager.authenticatedFetch(
                  `/api/monitoring/sessions/${result.sessionId}/end`,
                  {
                    method: "POST",
                    body: JSON.stringify({
                      preferences: {
                        detailLevel: summaryDefaults.detailLevel,
                        format: summaryDefaults.format,
                        includeScreenshots: summaryDefaults.includeScreenshots,
                      },
                      autoRecap: autoRecapEnabled,
                    }),
                  }
                );
              } catch (error) {
                monitoringLogger.error(" Cloud end-session failed (offline):", error);
              }
            }

            if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
              ctx.watchingPillWindow.hide();
            }

            return result;
          };

          void runEndSession();
          return { success: true, background: true };
        }
        case "show-console": {
          if (!ctx.consoleWindow || ctx.consoleWindow.isDestroyed()) {
            createConsoleWindow();
          }
          if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
            if (ctx.consoleWindow.isMinimized()) {
              ctx.consoleWindow.restore();
            }
            ctx.consoleWindow.show();
            ctx.consoleWindow.focus();
            if (process.platform === "darwin") {
              app.focus({ steal: true });
            }
          }
          return { success: true };
        }
        case "hide-pill": {
          if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
            ctx.watchingPillWindow.hide();
          }
          return { success: true };
        }
        default:
          return { success: false, error: "Unknown action" };
      }
    }
  );
}
