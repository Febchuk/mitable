import { ipcMain, screen } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import type { MultiWindowCaptureResult } from "@mitable/shared";
import { screenshotLogger } from "../loggers";
import { windowDetectionService } from "../../services/windowDetectionService";
import { captureService } from "../../services/captureService";

export function registerScreenshotHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.CAPTURE_SCREENSHOT,
    async (
      _event,
      payload?: {
        message?: string;
      }
    ): Promise<MultiWindowCaptureResult> => {
      screenshotLogger.info(" Multi-window capture requested", {
        hasMessage: !!payload?.message,
      });

      try {
        const selectedWindows = windowDetectionService.getSelectedWindows();
        const hasSelectedWindows = selectedWindows.length > 0;

        screenshotLogger.info(" Capture with filters:", {
          hasSelectedWindows,
          selectedWindows:
            selectedWindows
              .map((window) => `${window.appName} - ${window.windowTitle}`)
              .join(", ") || "none",
        });

        if (!hasSelectedWindows) {
          screenshotLogger.info(" No windows selected, skipping capture");
          return {
            success: false,
            error: "No windows selected for capture",
            reason: "no_selection",
          };
        }

        const selectedApps = selectedWindows.map((w) => ({
          appName: w.appName,
          windowTitle: w.windowTitle,
        }));

        const result = await captureService.captureWithCacheFallback(selectedApps);

        screenshotLogger.info(" Multi-window capture result:", {
          success: result.success,
          screenshotCount: result.success ? result.screenshots.length : 0,
          blockedCount: result.success ? result.blockedWindows.length : 0,
          totalDetected: result.success ? result.totalWindowsDetected : 0,
        });

        return result;
      } catch (error) {
        screenshotLogger.error(" Capture failed with error:", error);
        return {
          success: false,
          error: `Failed to capture windows: ${error instanceof Error ? error.message : "Unknown error"}`,
          reason: "technical_error",
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.GET_DISPLAY_METADATA, () => {
    const displays = screen.getAllDisplays();
    return displays.map((display) => ({
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    }));
  });
}
