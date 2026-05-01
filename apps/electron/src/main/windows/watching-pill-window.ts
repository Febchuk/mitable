import { app, BrowserWindow, screen } from "electron";
import { join } from "path";
import { ctx } from "../context";
import { watchingPillLogger, watchModeLogger } from "../loggers";
import { createWatchingPillEyeDropdown, createWatchingPillMenuDropdown } from "./pill-dropdowns";

export function createWatchingPillWindow() {
  // Get screen dimensions for right-edge, vertically centered positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 64; // Pill (~50px) + outer padding (12px) + 2px safety
  const windowHeight = 200; // Pill expanded height + top padding
  const rightMargin = 5;

  ctx.watchingPillWindow = new BrowserWindow({
    title: "Mitable Guide",
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - rightMargin,
    y: Math.floor((screenHeight - windowHeight) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    skipTaskbar: true,
    show: false,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../preload/watchingPill.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    ctx.watchingPillWindow.setAlwaysOnTop(true, "floating");
    ctx.watchingPillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    ctx.watchingPillWindow.setAlwaysOnTop(true, "normal", 1);
  }

  if (!app.isPackaged) {
    ctx.watchingPillWindow.loadURL("http://localhost:5173/watchingPill/index.html");
  } else {
    ctx.watchingPillWindow.loadFile(join(__dirname, "../renderer/watchingPill/index.html"));
  }

  // Pre-warm dropdown windows so first click is instant (no cold BrowserWindow creation)
  ctx.watchingPillWindow.webContents.once("did-finish-load", () => {
    if (!ctx.watchingPillEyeDropdown || ctx.watchingPillEyeDropdown.isDestroyed()) {
      createWatchingPillEyeDropdown();
    }
    if (!ctx.watchingPillMenuDropdown || ctx.watchingPillMenuDropdown.isDestroyed()) {
      createWatchingPillMenuDropdown();
    }
  });

  ctx.watchingPillWindow.on("closed", () => {
    // Close dropdowns explicitly (no longer auto-closed without parent)
    if (ctx.watchingPillEyeDropdown && !ctx.watchingPillEyeDropdown.isDestroyed())
      ctx.watchingPillEyeDropdown.close();
    if (ctx.watchingPillMenuDropdown && !ctx.watchingPillMenuDropdown.isDestroyed())
      ctx.watchingPillMenuDropdown.close();
    ctx.watchingPillWindow = null;
    stopClosedWindowCheck();
    stopPillCursorTracking();
  });

  watchingPillLogger.info(" Window created at right edge, vertically centered");

  // Start checking for closed windows
  startClosedWindowCheck();
}

export function startClosedWindowCheck() {
  if (ctx.closedWindowCheckInterval) return; // Already running

  // Closed-window checks are handled by monitoringSessionService.startWindowCleanupLoop()
  // (every 10s) — no need for a duplicate 2s check here.
  watchModeLogger.info(" Closed-window check delegated to monitoring session service");
}

export function stopClosedWindowCheck() {
  if (ctx.closedWindowCheckInterval) {
    clearInterval(ctx.closedWindowCheckInterval);
    ctx.closedWindowCheckInterval = null;
    watchModeLogger.info(" Stopped periodic check");
  }
}

export function showPillReliably(win: BrowserWindow) {
  win.showInactive();

  // Re-assert always-on-top (macOS can drop the level)
  if (process.platform === "darwin") {
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(true, "normal", 1);
  }
}

export function movePillToDisplay(display: Electron.Display) {
  if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) return;

  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = display.bounds;
  const windowWidth = 64;
  const windowHeight = 200;
  const rightMargin = 5;

  ctx.watchingPillWindow.setBounds({
    x: screenX + screenWidth - windowWidth - rightMargin,
    y: screenY + Math.floor((screenHeight - windowHeight) / 2),
    width: windowWidth,
    height: windowHeight,
  });

  // Reposition any open dropdown windows relative to new pill location
  const pillBounds = ctx.watchingPillWindow.getBounds();
  if (
    ctx.watchingPillEyeDropdown &&
    !ctx.watchingPillEyeDropdown.isDestroyed() &&
    ctx.watchingPillEyeDropdown.isVisible()
  ) {
    ctx.watchingPillEyeDropdown.setBounds({
      x: pillBounds.x - 250,
      y: pillBounds.y + 40,
      width: 240,
      height: 280,
    });
  }
  if (
    ctx.watchingPillMenuDropdown &&
    !ctx.watchingPillMenuDropdown.isDestroyed() &&
    ctx.watchingPillMenuDropdown.isVisible()
  ) {
    ctx.watchingPillMenuDropdown.setBounds({
      x: pillBounds.x - 170,
      y: pillBounds.y + 90,
      width: 160,
      height: 100,
    });
  }
}

export function startPillCursorTracking() {
  if (ctx.pillCursorTrackingInterval) return; // Already running

  // Initialize with current display
  if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
    const pillBounds = ctx.watchingPillWindow.getBounds();
    const currentDisplay = screen.getDisplayNearestPoint({ x: pillBounds.x, y: pillBounds.y });
    ctx.pillCurrentDisplayId = currentDisplay.id;
  }

  ctx.pillCursorTrackingInterval = setInterval(() => {
    if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) {
      stopPillCursorTracking();
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const cursorDisplay = screen.getDisplayNearestPoint(cursor);

    if (cursorDisplay.id !== ctx.pillCurrentDisplayId) {
      ctx.pillCurrentDisplayId = cursorDisplay.id;
      movePillToDisplay(cursorDisplay);
      watchingPillLogger.info(` Pill moved to display ${cursorDisplay.id}`);
    }
  }, 2000);

  watchingPillLogger.info(" Started pill cursor tracking");
}

export function stopPillCursorTracking() {
  if (ctx.pillCursorTrackingInterval) {
    clearInterval(ctx.pillCursorTrackingInterval);
    ctx.pillCursorTrackingInterval = null;
    ctx.pillCurrentDisplayId = null;
    watchingPillLogger.info(" Stopped pill cursor tracking");
  }
}
