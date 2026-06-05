import { app, Menu, nativeImage, Tray } from "electron";
import { join } from "path";
import { ctx } from "../context";
import { consoleLogger } from "../loggers";
import { createConsoleWindow } from "../windows/console-window";

export function buildTrayIcon(): Electron.NativeImage {
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, "resources", "tray-icon.png"),
        join(process.resourcesPath, "tray-icon.png"),
      ]
    : [join(app.getAppPath(), "resources", "tray-icon.png")];

  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  }

  consoleLogger.warn("Tray icon not found, tried:", candidates);
  return nativeImage.createEmpty();
}

export function showConsoleWindow(): void {
  if (!ctx.consoleWindow || ctx.consoleWindow.isDestroyed()) {
    createConsoleWindow();
    return;
  }
  if (ctx.consoleWindow.isMinimized()) ctx.consoleWindow.restore();
  if (process.platform === "win32") ctx.consoleWindow.setSkipTaskbar(false);
  ctx.consoleWindow.show();
  ctx.consoleWindow.focus();
}

export function createTrayIfSupported(): void {
  if (process.platform !== "win32") return;
  if (ctx.tray) return;

  const icon = buildTrayIcon();
  ctx.tray = new Tray(icon);
  ctx.tray.setToolTip("Mitable");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Mitable",
      click: () => showConsoleWindow(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        ctx.isExplicitQuit = true;
        try {
          ctx.consoleWindow?.close();
        } catch {
          /* ignore */
        }
        app.quit();
      },
    },
  ]);

  ctx.tray.setContextMenu(contextMenu);
  ctx.tray.on("click", () => showConsoleWindow());
}

/**
 * Must run before `quitAndInstall()`. Otherwise on Windows the console `close`
 * handler treats the quit as a normal hide-to-tray (preventDefault), the main
 * process never exits, and Squirrel/electron-updater cannot replace the binary.
 * Destroying the tray also releases the last UI anchor that can keep the app alive.
 */
export function prepareForQuitAndInstall(): void {
  ctx.isExplicitQuit = true;
  if (ctx.tray && !ctx.tray.isDestroyed()) {
    try {
      ctx.tray.destroy();
    } catch {
      /* ignore */
    }
    ctx.tray = null;
  }
}
