import { app, BrowserWindow } from "electron";
import { join } from "path";
import { watchModeLogger } from "../loggers";

export function isBrowserProcess(appName: string, appPath?: string): boolean {
  const haystack = `${appName || ""} ${appPath || ""}`.toLowerCase();

  // Simple heuristic for common browsers across platforms
  const browserPatterns = [
    "chrome",
    "google chrome",
    "msedge",
    "edge",
    "firefox",
    "safari",
    "brave",
    "opera",
    "vivaldi",
    "arc",
  ];

  return browserPatterns.some((pattern) => haystack.includes(pattern));
}

export function createWatchButtonWindow(
  window: any,
  watchButtonWindows: Map<string, BrowserWindow>
) {
  const buttonWindow = new BrowserWindow({
    title: "Watch Button",
    width: 250,
    height: 50,
    x: window.bounds.x + 10,
    y: window.bounds.y + 10,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../preload/watchButton.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Pass data via query parameters
  const queryParams = new URLSearchParams({
    windowId: window.windowId,
    appName: window.appName,
    windowTitle: window.windowTitle,
  });

  if (!app.isPackaged) {
    buttonWindow.loadURL(`http://localhost:5173/watchButton/index.html?${queryParams.toString()}`);
  } else {
    buttonWindow.loadFile(join(__dirname, "../renderer/watchButton/index.html"), {
      query: Object.fromEntries(queryParams.entries()),
    });
  }

  // Cleanup on close
  buttonWindow.on("closed", () => {
    watchModeLogger.info(` Button window closed for: ${window.appName}`);
    watchButtonWindows.delete(window.windowId);
  });

  watchButtonWindows.set(window.windowId, buttonWindow);

  watchModeLogger.info(
    `Created button for ${window.appName} at (${window.bounds.x + 10}, ${window.bounds.y + 10})`
  );
}
