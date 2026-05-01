import { app, ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { consoleLogger } from "../loggers";
import { createConsoleWindow } from "../windows";

export function registerConsoleHandlers() {
  ipcMain.on(IPC_CHANNELS.CONSOLE_MINIMIZE, () => {
    if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
      ctx.consoleWindow.minimize();
    }
  });

  ipcMain.on(IPC_CHANNELS.SHOW_CONSOLE, () => {
    consoleLogger.info(" Show requested");
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
  });
}
