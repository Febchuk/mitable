import { app, ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { consoleLogger } from "../loggers";
import { showConsoleWindow } from "../tray";

export function registerConsoleHandlers() {
  ipcMain.on(IPC_CHANNELS.CONSOLE_MINIMIZE, () => {
    if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
      ctx.consoleWindow.minimize();
    }
  });

  ipcMain.on(IPC_CHANNELS.SHOW_CONSOLE, () => {
    consoleLogger.info(" Show requested");
    showConsoleWindow();
    if (process.platform === "darwin") {
      app.focus({ steal: true });
    }
  });
}
