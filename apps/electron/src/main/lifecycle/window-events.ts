import { app, BrowserWindow, globalShortcut } from "electron";
import { ctx } from "../context";
import { createConsoleWindow } from "../windows/console-window";

/**
 * Register `window-all-closed`, `activate`, and `will-quit` app event handlers.
 */
export function registerWindowEventHandlers(): void {
  app.on("window-all-closed", () => {
    if (process.platform === "linux") {
      app.quit();
      return;
    }
    if (ctx.isExplicitQuit) app.quit();
  });

  // macOS: Re-create or focus window when clicking dock icon
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createConsoleWindow();
    } else if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
      if (ctx.consoleWindow.isMinimized()) {
        ctx.consoleWindow.restore();
      }
      ctx.consoleWindow.show();
      ctx.consoleWindow.focus();
    }
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });
}
