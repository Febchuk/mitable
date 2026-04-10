import type {
  MultiWindowCaptureResult,
  SelectedWindowInfo,
  WatchableWindow,
} from "@mitable/shared";
import { IPC_CHANNELS, SESSION_DEFAULTS } from "@mitable/shared";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { dirname, join } from "path";
import electronLogMain from "electron-log/main";
import { initActiveWindowBridge } from "./main/activeWindowBridge";
import { createLogger } from "./lib/logger";
import { audioWebSocketService } from "./services/audioWebSocketService";
import { resolveWindowUrlForWatchSelection } from "./services/macWindowFocusService";
import { windowDetectionService } from "./services/windowDetectionService";
import { monitoringSessionService } from "./services/monitoringSessionService";
import { focusWindowTracker } from "./services/focusWindowTracker";
import { authManager } from "./services/authManager";
import { preferencesService } from "./services/preferencesService";
import { updateService } from "./services/updateService";
import { captureService } from "./services/captureService";
import { isBlockedByPolicy } from "./services/capturePolicy";
import { passiveMonitorService } from "./services/passiveMonitorService";
import { notificationService } from "./services/notificationService";
import { agentSdkService } from "./services/agentSdkService";
import { skillsStore } from "./services/skillsStore";
import { browserBridgeService } from "./services/browserBridgeService";
import {
  initAnalytics,
  trackMainEvent,
  identifyMainUser,
  shutdownAnalytics,
} from "./services/analyticsService";

// Set theme from stored preference (defaults to "system" which follows OS)
nativeTheme.themeSource = preferencesService.getTheme();

// Register mitable:// protocol for Windows native notification action buttons
if (process.platform === "win32") {
  app.setAsDefaultProtocolClient("mitable");
}

// Create loggers for different modules in main process
const consoleLogger = createLogger("Console");
const watchingPillLogger = createLogger("WatchingPill");
const ipcLogger = createLogger("IPC");
const authLogger = createLogger("Auth");
const screenshotLogger = createLogger("Screenshot");
const watchModeLogger = createLogger("WatchMode");
const monitoringLogger = createLogger("MonitoringSession");
const recoveryLogger = createLogger("SessionRecovery");
const updateLogger = createLogger("Update");
const shutdownLogger = createLogger("Shutdown");
const notificationLogger = createLogger("Notification");

// Window references
let consoleWindow: BrowserWindow | null = null;
let watchingPillWindow: BrowserWindow | null = null;
let watchingPillEyeDropdown: BrowserWindow | null = null;
let watchingPillMenuDropdown: BrowserWindow | null = null;
let notificationWindow: BrowserWindow | null = null;

// System tray (Windows-first "keep alive on close" behavior)
let tray: Tray | null = null;
let isExplicitQuit = false;

// Notification timer for periodic prompts
let notificationTimer: NodeJS.Timeout | null = null;
let notificationAutoHideTimer: NodeJS.Timeout | null = null;

// Track when dropdowns were last hidden (to prevent re-opening on button click)
let eyeDropdownLastHidden = 0;
let menuDropdownLastHidden = 0;

// Track whether dropdown webContents have finished loading (first-open data send timing)
let eyeDropdownReady = false;
let menuDropdownReady = false;

// Interval for checking if watched windows are still open
let closedWindowCheckInterval: NodeJS.Timeout | null = null;

// Pill cursor-tracking state (multi-monitor following)
let pillCursorTrackingInterval: NodeJS.Timeout | null = null;
let pillCurrentDisplayId: number | null = null;

// Watch button windows tracking (module scope for cleanup from multiple handlers)
const watchButtonWindows: Map<string, BrowserWindow> = new Map();

// User context storage (shared across all windows for session start)
let currentUserContext: { userId: string; organizationId: string; role?: string } | null = null;

// Auth token storage (shared across all windows)
const authTokens: {
  accessToken: string | null;
  refreshToken: string | null;
} = {
  accessToken: null,
  refreshToken: null,
};

// Throttle for "no active session" audio chunk warnings (avoid log spam)
let lastAudioChunkWarnAt = 0;
// Flag to silently drop audio chunks after cleanup (renderer may lag behind)
let audioCleanupDone = false;
// Tracks whether audio was recording when session was paused (for auto-resume)
let audioActiveBeforePause = false;

/**
 * Stop audio recording infrastructure: disconnect WS, notify backend, tell renderer to kill AudioWorklet.
 * Called from all session-end paths so audio doesn't keep streaming after the session is gone.
 */
async function cleanupAudioRecording(sessionId?: string): Promise<void> {
  // Mark cleanup done so audio-chunk handler silently drops incoming chunks
  audioCleanupDone = true;

  // 1. Disconnect the backend WebSocket (stops forwarding chunks)
  audioWebSocketService.disconnect();

  // 2. Tell the WatchingPill renderer to stop its AudioWorklet (stops IPC flood)
  if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
    watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
  }

  // 3. Notify backend to stop tracking audio duration
  if (sessionId) {
    try {
      await authManager.authenticatedFetch(`/api/monitoring/sessions/${sessionId}/audio/stop`, {
        method: "POST",
      });
    } catch (error) {
      monitoringLogger.error("Failed to notify backend of audio stop during cleanup:", error);
    }
  }

  monitoringLogger.info(
    "🔇 Audio recording cleaned up" + (sessionId ? ` for session ${sessionId}` : "")
  );
}

function isBoundsVisible(bounds: Electron.Rectangle): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const area = display.workArea;
    const withinX = bounds.x + bounds.width > area.x && bounds.x < area.x + area.width;
    const withinY = bounds.y + bounds.height > area.y && bounds.y < area.y + area.height;
    return withinX && withinY;
  });
}

function clampToDisplay(bounds: Electron.Rectangle): Electron.Rectangle {
  const targetDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const { x, y, width, height } = targetDisplay.workArea;

  const clampedWidth = Math.min(bounds.width, width);
  const clampedHeight = Math.min(bounds.height, height);

  const clampedX = Math.min(Math.max(bounds.x, x), x + width - clampedWidth);
  const clampedY = Math.min(Math.max(bounds.y, y), y + height - clampedHeight);

  return {
    x: clampedX,
    y: clampedY,
    width: clampedWidth,
    height: clampedHeight,
  };
}

function createConsoleWindow() {
  consoleLogger.info(" Creating console window...");
  consoleLogger.info(" Preload script path:", join(__dirname, "../preload/console.cjs"));

  // Get dimensions of the display nearest the cursor to avoid off-screen placement
  const cursorPoint = screen.getCursorScreenPoint();
  const targetDisplay = screen.getDisplayNearestPoint(cursorPoint) ?? screen.getPrimaryDisplay();
  const {
    width: screenWidth,
    height: screenHeight,
    x: screenX,
    y: screenY,
  } = targetDisplay.workArea;

  // Calculate window dimensions based on screen size (max 1264x888, with padding)
  const maxWidth = 1264;
  const maxHeight = 888;
  const padding = 100; // Minimum padding from screen edges
  const windowWidth = Math.min(maxWidth, screenWidth - padding);
  const windowHeight = Math.min(maxHeight, screenHeight - padding);

  // Platform-specific window configuration
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";

  consoleWindow = new BrowserWindow({
    title: app.isPackaged ? "Mitable Console" : "Mitable Console (Dev)",
    width: windowWidth,
    height: windowHeight,
    // Center the window within the chosen display's work area
    x: screenX + Math.floor((screenWidth - windowWidth) / 2),
    y: screenY + Math.floor((screenHeight - windowHeight) / 2),
    // Hidden title bar with native controls
    titleBarStyle: "hidden",
    // Show native window controls on Windows/Linux via titleBarOverlay
    ...(isMac
      ? {
          // Position macOS traffic lights within our 44px custom title bar
          trafficLightPosition: { x: 16, y: 14 },
        }
      : {
          titleBarOverlay: {
            color: "#1a1a1a",
            symbolColor: "#ffffff",
            height: 32,
          },
        }),
    maximizable: true,
    fullscreenable: false,
    // Platform-specific transparency and background
    ...(isMac && {
      transparent: true,
      backgroundColor: "#00000000",
      vibrancy: "under-window" as const,
      visualEffectState: "active" as const,
    }),
    // Windows: use Mica/Acrylic on Windows 11, solid background otherwise
    ...(isWindows && {
      backgroundColor: "#1a1a1a",
      backgroundMaterial: "mica" as const,
    }),
    // Linux: solid background
    ...(!isMac &&
      !isWindows && {
        backgroundColor: "#1a1a1a",
      }),
    // Don't show until ready (ensures proper Dock visibility on macOS)
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/console.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show window when ready (ensures proper Dock visibility on macOS)
  consoleWindow.once("ready-to-show", () => {
    if (!consoleWindow) return;

    const bounds = consoleWindow.getBounds();
    if (!isBoundsVisible(bounds)) {
      const clamped = clampToDisplay(bounds);
      consoleLogger.warn(" Console window bounds were off-screen, clamping:", {
        original: bounds,
        clamped,
      });
      consoleWindow.setBounds(clamped);
    }

    consoleWindow.show();
  });

  // Safety timeout: Force show window if ready-to-show doesn't fire (Windows edge case)
  setTimeout(() => {
    if (consoleWindow && !consoleWindow.isVisible()) {
      consoleLogger.warn(" Force-showing window after timeout (ready-to-show didn't fire)");
      consoleWindow.show();
    }
  }, 5000);

  // Log when preload script finishes loading
  consoleWindow.webContents.on("did-finish-load", () => {
    consoleLogger.info(" Window finished loading - preload script should be ready");
  });

  // Log when DOM is ready
  consoleWindow.webContents.on("dom-ready", () => {
    consoleLogger.info(" DOM ready - window.consoleAPI should be available now");
  });

  // Handle external links - open in default browser/app instead of new window
  consoleWindow.webContents.setWindowOpenHandler(({ url }) => {
    consoleLogger.info(" External link clicked:", url);

    // Open in default browser/app (e.g., Slack links open in Slack)
    shell.openExternal(url).catch((err) => {
      consoleLogger.error(" Failed to open external link:", err);
    });

    // Prevent Electron from creating a new window
    return { action: "deny" };
  });

  // Remove menu bar on Windows (keep on macOS for native experience)
  if (process.platform !== "darwin") {
    consoleWindow.setMenu(null);
  }

  if (!app.isPackaged) {
    consoleLogger.info(" Loading dev URL: http://localhost:5173/console/index.html");
    consoleWindow.loadURL("http://localhost:5173/console/index.html");
    consoleWindow.webContents.openDevTools();
  } else {
    consoleWindow.loadFile(join(__dirname, "../renderer/console/index.html"));
  }

  // Slack-style: closing the window hides it (keeps app running).
  // On macOS, users can Cmd+Q to quit; on Windows, tray "Quit" exits fully.
  consoleWindow.on("close", (event) => {
    if (isExplicitQuit) return;

    // Windows: hide-to-tray. macOS: close-to-hide (reopen via dock/activate).
    // Linux: keep default close behavior (no tray UX here yet).
    if (process.platform !== "win32" && process.platform !== "darwin") return;

    event.preventDefault();
    try {
      consoleWindow?.hide();
      if (process.platform === "win32") consoleWindow?.setSkipTaskbar(true);
    } catch {
      /* ignore */
    }
  });

  consoleWindow.on("closed", () => {
    consoleWindow = null;
  });

  // macOS: ensure traffic light buttons stay visible after fullscreen transitions
  if (isMac) {
    consoleWindow.on("enter-full-screen", () => {
      consoleWindow?.setWindowButtonVisibility(true);
    });
    consoleWindow.on("leave-full-screen", () => {
      consoleWindow?.setWindowButtonVisibility(true);
    });
  }
}

function buildTrayIcon(): Electron.NativeImage {
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

function showConsoleWindow(): void {
  if (!consoleWindow || consoleWindow.isDestroyed()) {
    createConsoleWindow();
    return;
  }
  if (consoleWindow.isMinimized()) consoleWindow.restore();
  // If we hid it to tray on Windows, bring it back to taskbar too
  if (process.platform === "win32") consoleWindow.setSkipTaskbar(false);
  consoleWindow.show();
  consoleWindow.focus();
}

function createTrayIfSupported(): void {
  // Windows tray is the primary UX target for "close → keep alive".
  if (process.platform !== "win32") return;
  if (tray) return;

  const icon = buildTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Mitable");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Mitable",
      click: () => showConsoleWindow(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isExplicitQuit = true;
        try {
          // Ensure the main window actually closes (releasing resources)
          consoleWindow?.close();
        } catch {
          /* ignore */
        }
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => showConsoleWindow());
}

function createWatchingPillWindow() {
  // Get screen dimensions for right-edge, vertically centered positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 64; // Pill (~50px) + outer padding (12px) + 2px safety
  const windowHeight = 200; // Pill expanded height + top padding
  const rightMargin = 5;

  watchingPillWindow = new BrowserWindow({
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
    watchingPillWindow.setAlwaysOnTop(true, "floating");
    watchingPillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    watchingPillWindow.setAlwaysOnTop(true, "normal", 1);
  }

  if (!app.isPackaged) {
    watchingPillWindow.loadURL("http://localhost:5173/watchingPill/index.html");
  } else {
    watchingPillWindow.loadFile(join(__dirname, "../renderer/watchingPill/index.html"));
  }

  watchingPillWindow.on("closed", () => {
    // Close dropdowns explicitly (no longer auto-closed without parent)
    if (watchingPillEyeDropdown && !watchingPillEyeDropdown.isDestroyed())
      watchingPillEyeDropdown.close();
    if (watchingPillMenuDropdown && !watchingPillMenuDropdown.isDestroyed())
      watchingPillMenuDropdown.close();
    watchingPillWindow = null;
    stopClosedWindowCheck();
    stopPillCursorTracking();
  });

  watchingPillLogger.info(" Window created at right edge, vertically centered");

  // Start checking for closed windows
  startClosedWindowCheck();
}

/**
 * Start periodic check for closed watched windows
 */
function startClosedWindowCheck() {
  if (closedWindowCheckInterval) return; // Already running

  closedWindowCheckInterval = setInterval(async () => {
    const closedWindows = await windowDetectionService.checkForClosedWindows();

    if (closedWindows.length > 0) {
      // Notify pill and console windows about the update
      const selectedWindows = windowDetectionService.getSelectedWindows();
      const windows = [consoleWindow, watchingPillWindow];

      for (const window of windows) {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, selectedWindows);
        }
      }

      watchModeLogger.info(` Notified windows of ${closedWindows.length} closed windows`);
    }
  }, 2000); // Check every 2 seconds

  watchModeLogger.info(" Started periodic check for closed windows");
}

/**
 * Stop the closed window check interval
 */
function stopClosedWindowCheck() {
  if (closedWindowCheckInterval) {
    clearInterval(closedWindowCheckInterval);
    closedWindowCheckInterval = null;
    watchModeLogger.info(" Stopped periodic check");
  }
}

/**
 * Show the pill window reliably — re-assert always-on-top and visibility flags after show().
 */
function showPillReliably(win: BrowserWindow) {
  win.showInactive();

  // Re-assert always-on-top (macOS can drop the level)
  if (process.platform === "darwin") {
    win.setAlwaysOnTop(true, "floating");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setAlwaysOnTop(true, "normal", 1);
  }
}

/**
 * Move the pill window to the right edge of the given display, vertically centered.
 */
function movePillToDisplay(display: Electron.Display) {
  if (!watchingPillWindow || watchingPillWindow.isDestroyed()) return;

  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = display.bounds;
  const windowWidth = 64;
  const windowHeight = 200;
  const rightMargin = 5;

  watchingPillWindow.setBounds({
    x: screenX + screenWidth - windowWidth - rightMargin,
    y: screenY + Math.floor((screenHeight - windowHeight) / 2),
    width: windowWidth,
    height: windowHeight,
  });

  // Reposition any open dropdown windows relative to new pill location
  const pillBounds = watchingPillWindow.getBounds();
  if (
    watchingPillEyeDropdown &&
    !watchingPillEyeDropdown.isDestroyed() &&
    watchingPillEyeDropdown.isVisible()
  ) {
    watchingPillEyeDropdown.setBounds({
      x: pillBounds.x - 250,
      y: pillBounds.y + 40,
      width: 240,
      height: 280,
    });
  }
  if (
    watchingPillMenuDropdown &&
    !watchingPillMenuDropdown.isDestroyed() &&
    watchingPillMenuDropdown.isVisible()
  ) {
    watchingPillMenuDropdown.setBounds({
      x: pillBounds.x - 170,
      y: pillBounds.y + 90,
      width: 160,
      height: 100,
    });
  }
}

/**
 * Start tracking the cursor position to move the pill across monitors.
 */
function startPillCursorTracking() {
  if (pillCursorTrackingInterval) return; // Already running

  // Initialize with current display
  if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
    const pillBounds = watchingPillWindow.getBounds();
    const currentDisplay = screen.getDisplayNearestPoint({ x: pillBounds.x, y: pillBounds.y });
    pillCurrentDisplayId = currentDisplay.id;
  }

  pillCursorTrackingInterval = setInterval(() => {
    if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
      stopPillCursorTracking();
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const cursorDisplay = screen.getDisplayNearestPoint(cursor);

    if (cursorDisplay.id !== pillCurrentDisplayId) {
      pillCurrentDisplayId = cursorDisplay.id;
      movePillToDisplay(cursorDisplay);
      watchingPillLogger.info(` Pill moved to display ${cursorDisplay.id}`);
    }
  }, 500);

  watchingPillLogger.info(" Started pill cursor tracking");
}

/**
 * Stop cursor tracking for the pill.
 */
function stopPillCursorTracking() {
  if (pillCursorTrackingInterval) {
    clearInterval(pillCursorTrackingInterval);
    pillCursorTrackingInterval = null;
    pillCurrentDisplayId = null;
    watchingPillLogger.info(" Stopped pill cursor tracking");
  }
}

function createWatchingPillEyeDropdown() {
  if (!watchingPillWindow || watchingPillWindow.isDestroyed()) return;

  const pillBounds = watchingPillWindow.getBounds();

  watchingPillEyeDropdown = new BrowserWindow({
    title: "Mitable Nudge",
    width: 240,
    height: 280,
    x: pillBounds.x - 250, // Left of pill
    y: pillBounds.y + 40, // Below eye button position
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    show: false,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../preload/watchingPillDropdown.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top
  if (process.platform === "darwin") {
    watchingPillEyeDropdown.setAlwaysOnTop(true, "floating");
    watchingPillEyeDropdown.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    watchingPillEyeDropdown.setAlwaysOnTop(true, "normal", 1);
  }

  // Dismiss on blur (click away)
  watchingPillEyeDropdown.on("blur", () => {
    if (watchingPillEyeDropdown && !watchingPillEyeDropdown.isDestroyed()) {
      watchingPillEyeDropdown.hide();
      eyeDropdownLastHidden = Date.now(); // Track when hidden for toggle logic
      // Notify pill that dropdown closed
      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        watchingPillWindow.webContents.send("eye-dropdown-closed");
      }
    }
  });

  watchingPillEyeDropdown.on("closed", () => {
    watchingPillEyeDropdown = null;
    eyeDropdownReady = false;
  });

  watchingPillEyeDropdown.webContents.once("did-finish-load", () => {
    eyeDropdownReady = true;
  });

  if (!app.isPackaged) {
    watchingPillEyeDropdown.loadURL("http://localhost:5173/watchingPillDropdown/eye.html");
  } else {
    watchingPillEyeDropdown.loadFile(join(__dirname, "../renderer/watchingPillDropdown/eye.html"));
  }
}

function createWatchingPillMenuDropdown() {
  if (!watchingPillWindow || watchingPillWindow.isDestroyed()) return;

  const pillBounds = watchingPillWindow.getBounds();

  watchingPillMenuDropdown = new BrowserWindow({
    title: "Mitable Nudge",
    width: 160,
    height: 100,
    x: pillBounds.x - 170, // Left of pill
    y: pillBounds.y + 90, // Below menu button position
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    show: false,
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../preload/watchingPillDropdown.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top
  if (process.platform === "darwin") {
    watchingPillMenuDropdown.setAlwaysOnTop(true, "floating");
    watchingPillMenuDropdown.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    watchingPillMenuDropdown.setAlwaysOnTop(true, "normal", 1);
  }

  // Dismiss on blur (click away)
  watchingPillMenuDropdown.on("blur", () => {
    if (watchingPillMenuDropdown && !watchingPillMenuDropdown.isDestroyed()) {
      watchingPillMenuDropdown.hide();
      menuDropdownLastHidden = Date.now(); // Track when hidden for toggle logic
      // Notify pill that dropdown closed
      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        watchingPillWindow.webContents.send("menu-dropdown-closed");
      }
    }
  });

  watchingPillMenuDropdown.on("closed", () => {
    watchingPillMenuDropdown = null;
    menuDropdownReady = false;
  });

  watchingPillMenuDropdown.webContents.once("did-finish-load", () => {
    menuDropdownReady = true;
  });

  if (!app.isPackaged) {
    watchingPillMenuDropdown.loadURL("http://localhost:5173/watchingPillDropdown/menu.html");
  } else {
    watchingPillMenuDropdown.loadFile(
      join(__dirname, "../renderer/watchingPillDropdown/menu.html")
    );
  }
}

// Notification configuration type
interface NotificationConfig {
  title: string;
  message: string;
  icon?: string;
  actions: Array<{ id: string; label: string; primary?: boolean }>;
  timeout?: number;
}

function createNotificationWindow() {
  // Get screen dimensions for bottom-right positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 340;
  const windowHeight = 150;
  const padding = 20;
  const dockHeight = 80; // Account for macOS dock

  notificationWindow = new BrowserWindow({
    title: "Mitable Notification",
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - padding,
    y: screenHeight - windowHeight - padding - dockHeight,
    frame: false,
    transparent: true,
    hasShadow: false, // Disable macOS window shadow for clean transparent look
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false, // Don't steal focus when notification appears
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/notification.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top (below modal-panel so it doesn't cover pill)
  if (process.platform === "darwin") {
    notificationWindow.setAlwaysOnTop(true, "floating");
    notificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    notificationWindow.setAlwaysOnTop(true, "normal", 1);
  }

  // Dismiss on blur (click away)
  notificationWindow.on("blur", () => {
    hideNotification();
  });

  notificationWindow.on("closed", () => {
    notificationWindow = null;
  });

  if (!app.isPackaged) {
    notificationWindow.loadURL("http://localhost:5173/notifications/index.html");
  } else {
    notificationWindow.loadFile(join(__dirname, "../renderer/notifications/index.html"));
  }

  notificationLogger.info(" Notification window created");
}

function showNotification(config: NotificationConfig) {
  // Windows: use native toast notification for OS integration (Action Center)
  if (process.platform === "win32") {
    showNativeWindowsNotification(config);
    return;
  }

  // macOS: use custom BrowserWindow notification
  showCustomNotification(config);
}

function showNativeWindowsNotification(config: NotificationConfig) {
  // Build action buttons XML
  const actionsXml = config.actions
    .map(
      (action) =>
        `<action content="${escapeXml(action.label)}" activationType="protocol" arguments="mitable://${action.id}" />`
    )
    .join("\n        ");

  const toastXml = `
<toast launch="mitable://focus" activationType="protocol">
  <visual>
    <binding template="ToastText02">
      <text id="1">${escapeXml(config.title)}</text>
      <text id="2">${escapeXml(config.message)}</text>
    </binding>
  </visual>
  <actions>
    ${actionsXml}
  </actions>
</toast>`.trim();

  const notification = new Notification({ toastXml });
  notification.show();
  notificationLogger.info("Native Windows notification shown:", config.title);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function showCustomNotification(config: NotificationConfig) {
  // Create window if it doesn't exist
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    createNotificationWindow();
  }

  // Wait for window to be ready before sending data
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    // Send config data to renderer
    notificationWindow.webContents.send(IPC_CHANNELS.NOTIFICATION_DATA, config);
    notificationWindow.showInactive(); // Don't steal focus or affect other windows

    notificationLogger.info("Showing custom notification:", config.title);

    // Set up auto-hide timer (as backup, renderer also handles this)
    if (config.timeout && config.timeout > 0) {
      if (notificationAutoHideTimer) {
        clearTimeout(notificationAutoHideTimer);
      }
      notificationAutoHideTimer = setTimeout(() => {
        hideNotification();
      }, config.timeout + 500); // Slightly longer than renderer timeout
    }
  }
}

function hideNotification() {
  if (notificationAutoHideTimer) {
    clearTimeout(notificationAutoHideTimer);
    notificationAutoHideTimer = null;
  }

  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.hide();
    notificationLogger.info(" Notification hidden");
  }
}

// Shared handler for notification actions (used by both Windows protocol and macOS IPC)
function handleNotificationAction(actionId: string) {
  switch (actionId) {
    case "turn-on":
    case "focus":
      // Show console and navigate to start session
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.show();
        consoleWindow.focus();
      }
      break;
    case "view-recap":
      // Show console and navigate to recaps page
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.show();
        consoleWindow.focus();
        consoleWindow.webContents.send("navigate-to-recaps");
      }
      break;
    case "view-update":
      // Show console and navigate to profile/update section
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.show();
        consoleWindow.focus();
        consoleWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO_UPDATE);
      }
      break;
    case "install-update":
      // Quit and install the downloaded update
      updateService.quitAndInstall();
      break;
    case "view-active-session":
      // Show console and navigate to active session
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.show();
        consoleWindow.focus();
        consoleWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION);
      }
      break;
    case "dismiss":
      // No-op — notification already dismissed
      break;
    default:
      notificationLogger.warn("Unknown notification action:", actionId);
  }
}

// Start periodic notification timer (prompts user to turn on monitoring)
function startNotificationTimer() {
  // Get user's preferred notification frequency (defaults to 30 minutes)
  let notificationFrequencyMinutes = 30;
  if (currentUserContext?.userId) {
    notificationFrequencyMinutes = preferencesService.getUserNotificationFrequency(
      currentUserContext.userId
    );
  }
  const NOTIFICATION_INTERVAL = notificationFrequencyMinutes * 60 * 1000; // Convert minutes to milliseconds
  // const NOTIFICATION_INTERVAL = 10 * 1000; // 10 seconds for testing

  if (notificationTimer) {
    clearInterval(notificationTimer);
  }

  notificationTimer = setInterval(() => {
    // Only show if:
    // 1. No active monitoring session
    // 2. User is logged in (has auth token)
    const sessionState = monitoringSessionService.getSessionState();
    const isMonitoringActive =
      sessionState?.status === "active" || sessionState?.status === "paused";
    const isLoggedIn = authTokens.accessToken !== null;

    if (!isMonitoringActive && isLoggedIn) {
      notificationLogger.info(" Triggering periodic notification (monitoring is off)");
      showNotification({
        title: "Ready to track your work?",
        message: "Turn on Mitable to log your activity and get better insights.",
        actions: [
          { id: "turn-on", label: "Turn On", primary: true },
          { id: "dismiss", label: "Later" },
        ],
        timeout: 10000, // 10 seconds auto-dismiss
      });
    }
  }, NOTIFICATION_INTERVAL);

  notificationLogger.info(
    ` Notification timer started (${notificationFrequencyMinutes} min interval)`
  );
}

function stopNotificationTimer() {
  if (notificationTimer) {
    clearInterval(notificationTimer);
    notificationTimer = null;
    notificationLogger.info(" Notification timer stopped");
  }
}

// (Auto session start removed — passive monitoring handles session lifecycle)

/**
 * Auto-enable passive monitoring if the user's preference allows it (default: true).
 * Called after user context is established (login or session restore).
 */
function autoEnablePassiveMonitoring(userId: string) {
  const enabled = preferencesService.getUserPassiveMonitoringEnabled(userId);
  if (!enabled) {
    monitoringLogger.info("Passive monitoring preference is off, skipping auto-enable");
    return;
  }

  const { state } = passiveMonitorService.getState();
  if (state !== "disabled") {
    monitoringLogger.info(`Passive monitoring already ${state}, skipping auto-enable`);
    return;
  }

  monitoringLogger.info("Auto-enabling passive monitoring on startup");
  passiveMonitorService.enable({
    startSession: () => startSessionFromMain("passive"),
    endSession: (sessionId) => endPassiveSessionFromMain(sessionId),
    isAudioActive: () => audioWebSocketService.isConnected(),
  });
}

// IPC Handlers
function setupIPC() {
  ipcLogger.info(" Setting up IPC handlers...");

  // Minimize console window
  ipcMain.on(IPC_CHANNELS.CONSOLE_MINIMIZE, () => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.minimize();
    }
  });

  // Auth Management - Cross-window token sharing
  // Console sets tokens after login
  ipcMain.on(IPC_CHANNELS.AUTH_SET_TOKENS, (_event, accessToken: string, refreshToken: string) => {
    authLogger.info(" Tokens received from Console window", {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length || 0,
      hasRefreshToken: !!refreshToken,
    });

    authTokens.accessToken = accessToken;
    authTokens.refreshToken = refreshToken;

    // Update centralized auth manager + persist refresh token to OS keychain
    const userCtx = currentUserContext
      ? { orgId: currentUserContext.organizationId, userId: currentUserContext.userId }
      : undefined;

    authManager.setTokens(accessToken, refreshToken, userCtx).then(() => {
      authLogger.info(" Auth manager token state after sync:", {
        managerHasToken: !!authManager.getAccessToken(),
        persistedToKeychain: !!userCtx,
      });
    });

    // Broadcast token update to all windows
    const allWindows = [consoleWindow, watchingPillWindow];
    allWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AUTH_TOKEN_UPDATED, accessToken);
      }
    });
  });

  // Any window can request current auth token
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_TOKEN, () => {
    authLogger.info(" Token requested, returning:", authTokens.accessToken ? "present" : "null");
    return authTokens.accessToken;
  });

  // Console clears tokens on logout
  ipcMain.on(IPC_CHANNELS.AUTH_CLEAR, async () => {
    authLogger.info(" Tokens cleared");
    authTokens.accessToken = null;
    authTokens.refreshToken = null;

    // Clear centralized auth manager + keychain (await to ensure keychain is cleared before app exit)
    const userCtx = currentUserContext
      ? { orgId: currentUserContext.organizationId, userId: currentUserContext.userId }
      : undefined;

    await authManager.clearTokens(userCtx);
    authLogger.info(" Auth manager and keychain cleared");

    if (currentUserContext?.userId) {
      trackMainEvent(currentUserContext.userId, "electron_auth_cleared");
    }
    currentUserContext = null;

    // Broadcast token clear to all windows
    const allWindows = [consoleWindow, watchingPillWindow];
    allWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AUTH_TOKEN_UPDATED, null);
      }
    });
  });

  // ==================== Watching Pill IPC Handlers ====================
  // Note: Session lifecycle (pause/resume/start/end) is handled by the monitoring session handlers
  // which broadcast to all windows including the watching pill

  // Hide watching pill
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_HIDE, () => {
    watchingPillLogger.info(" Hide requested");
    stopPillCursorTracking();
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.hide();
    }
  });

  // Show watching pill
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_SHOW, () => {
    watchingPillLogger.info(" Show requested");
    if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
      createWatchingPillWindow();
    }
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      showPillReliably(watchingPillWindow);
      startPillCursorTracking();
    }
  });

  // Toggle eye dropdown (window selector)
  ipcMain.handle(IPC_CHANNELS.WATCHING_PILL_SHOW_EYE_DROPDOWN, async () => {
    if (!watchingPillWindow || watchingPillWindow.isDestroyed()) return;

    // If dropdown was just hidden by blur (within 200ms), don't re-open
    // This handles the case where clicking the button triggers blur before click
    if (Date.now() - eyeDropdownLastHidden < 200) {
      return;
    }

    // Toggle: if visible, hide it
    if (
      watchingPillEyeDropdown &&
      !watchingPillEyeDropdown.isDestroyed() &&
      watchingPillEyeDropdown.isVisible()
    ) {
      watchingPillEyeDropdown.hide();
      return;
    }

    // Create dropdown if it doesn't exist
    if (!watchingPillEyeDropdown || watchingPillEyeDropdown.isDestroyed()) {
      createWatchingPillEyeDropdown();
    }

    // Reposition relative to current pill location
    const pillBounds = watchingPillWindow.getBounds();
    if (watchingPillEyeDropdown && !watchingPillEyeDropdown.isDestroyed()) {
      watchingPillEyeDropdown.setBounds({
        x: pillBounds.x - 250,
        y: pillBounds.y + 40,
        width: 240,
        height: 280,
      });

      // Helper: send initial + async data to the eye dropdown
      const sendEyeData = async () => {
        if (!watchingPillEyeDropdown || watchingPillEyeDropdown.isDestroyed()) return;

        // Send initial data with loading state
        const selectedWindows = windowDetectionService.getSelectedWindows();
        watchingPillEyeDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
          type: "eye",
          selectedWindows,
          availableWindows: [],
          isLoading: true,
        });

        // Fetch available windows asynchronously, then update
        let availableWindows: WatchableWindow[] = [];
        try {
          availableWindows = await windowDetectionService.getAllVisibleWindows();
        } catch (error) {
          watchingPillLogger.error(" Failed to get visible windows:", error);
        }

        if (watchingPillEyeDropdown && !watchingPillEyeDropdown.isDestroyed()) {
          watchingPillEyeDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
            type: "eye",
            selectedWindows: windowDetectionService.getSelectedWindows(),
            availableWindows,
            isLoading: false,
          });
        }
      };

      // Show dropdown immediately
      watchingPillEyeDropdown.show();
      watchingPillEyeDropdown.focus();

      // Defer data send until renderer is ready (first open) or send immediately (re-open)
      if (eyeDropdownReady) {
        sendEyeData();
      } else {
        watchingPillEyeDropdown.webContents.once("did-finish-load", () => {
          sendEyeData();
        });
      }
    }
  });

  // Hide eye dropdown
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_HIDE_EYE_DROPDOWN, () => {
    if (watchingPillEyeDropdown && !watchingPillEyeDropdown.isDestroyed()) {
      watchingPillEyeDropdown.hide();
    }
  });

  // Toggle menu dropdown (session controls)
  ipcMain.handle(IPC_CHANNELS.WATCHING_PILL_SHOW_MENU_DROPDOWN, async () => {
    if (!watchingPillWindow || watchingPillWindow.isDestroyed()) return;

    // If dropdown was just hidden by blur (within 200ms), don't re-open
    // This handles the case where clicking the button triggers blur before click
    if (Date.now() - menuDropdownLastHidden < 200) {
      return;
    }

    // Toggle: if visible, hide it
    if (
      watchingPillMenuDropdown &&
      !watchingPillMenuDropdown.isDestroyed() &&
      watchingPillMenuDropdown.isVisible()
    ) {
      watchingPillMenuDropdown.hide();
      return;
    }

    // Create dropdown if it doesn't exist
    if (!watchingPillMenuDropdown || watchingPillMenuDropdown.isDestroyed()) {
      createWatchingPillMenuDropdown();
    }

    // Reposition relative to current pill location
    const pillBounds = watchingPillWindow.getBounds();
    if (watchingPillMenuDropdown && !watchingPillMenuDropdown.isDestroyed()) {
      watchingPillMenuDropdown.setBounds({
        x: pillBounds.x - 170,
        y: pillBounds.y + 90,
        width: 160,
        height: 100,
      });

      // Helper: send session data to the menu dropdown
      const sendMenuData = () => {
        if (!watchingPillMenuDropdown || watchingPillMenuDropdown.isDestroyed()) return;
        const sessionState = monitoringSessionService.getSessionState();
        const selectedWindows = windowDetectionService.getSelectedWindows();
        watchingPillMenuDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
          type: "menu",
          sessionState,
          selectedWindows,
        });
      };

      // Show dropdown immediately
      watchingPillMenuDropdown.show();
      watchingPillMenuDropdown.focus();

      // Defer data send until renderer is ready (first open) or send immediately (re-open)
      if (menuDropdownReady) {
        sendMenuData();
      } else {
        watchingPillMenuDropdown.webContents.once("did-finish-load", () => {
          sendMenuData();
        });
      }
    }
  });

  // Hide menu dropdown
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_HIDE_MENU_DROPDOWN, () => {
    if (watchingPillMenuDropdown && !watchingPillMenuDropdown.isDestroyed()) {
      watchingPillMenuDropdown.hide();
    }
  });

  // Handle actions from dropdown windows
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
          // Notify pill and dropdown to update badge count / selected windows list
          const selectedWindows = windowDetectionService.getSelectedWindows();
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            watchingPillWindow.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          if (watchingPillEyeDropdown && !watchingPillEyeDropdown.isDestroyed()) {
            watchingPillEyeDropdown.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          return { success: true };
        }
        case "unselect-window": {
          const windowId = action.payload as string;
          windowDetectionService.removeWindow(windowId);
          // Notify pill and dropdown to update badge count / selected windows list
          const selectedWindows = windowDetectionService.getSelectedWindows();
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            watchingPillWindow.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          if (watchingPillEyeDropdown && !watchingPillEyeDropdown.isDestroyed()) {
            watchingPillEyeDropdown.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          return { success: true };
        }
        case "start-session": {
          // Use shared helper function for session start
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

          // Always end directly from pill — no dialog navigation needed.
          // The console calendar block updates reactively via session state changes.
          monitoringLogger.info(" Ending session from pill with stored defaults");
          const summaryDefaults = preferencesService.getSummaryDefaults();

          const runEndSession = async () => {
            // 0. Stop audio recording before ending session (prevents runaway AudioWorklet)
            const preEndState = monitoringSessionService.getSessionState();
            await cleanupAudioRecording(preEndState?.id);

            // 1. End Electron-side capture loop and get captures
            const result = await monitoringSessionService.endSession();

            if (!result.success || !result.sessionId) {
              return result;
            }

            // 2. Upload captures and end backend session with defaults
            try {
              // Upload captures if any exist
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

              // End backend session with stored preferences
              monitoringLogger.info(` Triggering backend summarization with defaults`);
              const autoRecapEnabled = currentUserContext?.userId
                ? preferencesService.getUserAutoRecap(currentUserContext.userId)
                : true;
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
              monitoringLogger.error(" Error:", error);
            }

            // Hide watching pill after successful end
            if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
              watchingPillWindow.hide();
            }

            return result;
          };

          void runEndSession();
          return { success: true, background: true };
        }
        case "show-console": {
          if (!consoleWindow || consoleWindow.isDestroyed()) {
            createConsoleWindow();
          }
          if (consoleWindow && !consoleWindow.isDestroyed()) {
            if (consoleWindow.isMinimized()) {
              consoleWindow.restore();
            }
            consoleWindow.show();
            consoleWindow.focus();
            if (process.platform === "darwin") {
              app.focus({ steal: true });
            }
          }
          return { success: true };
        }
        case "hide-pill": {
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            watchingPillWindow.hide();
          }
          return { success: true };
        }
        default:
          return { success: false, error: "Unknown action" };
      }
    }
  );

  // Show console window
  ipcMain.on(IPC_CHANNELS.SHOW_CONSOLE, () => {
    consoleLogger.info(" Show requested");
    if (!consoleWindow || consoleWindow.isDestroyed()) {
      createConsoleWindow();
    }
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      if (consoleWindow.isMinimized()) {
        consoleWindow.restore();
      }
      consoleWindow.show();
      consoleWindow.focus();
      // macOS: app.focus() brings the app to the foreground
      // which helps when focus is on an always-on-top pill window
      if (process.platform === "darwin") {
        app.focus({ steal: true });
      }
    }
  });

  // ==================== User Context IPC Handlers ====================
  // Store user context for cross-window access (e.g., WatchingPill needs userId/orgId)
  // Note: currentUserContext is defined at module scope for access from global shortcuts

  ipcMain.on(
    IPC_CHANNELS.USER_CONTEXT_SET,
    (_event, user: { userId: string; organizationId: string; role?: string }) => {
      consoleLogger.info(" Set:", user);
      currentUserContext = user;

      // Identify user in PostHog
      identifyMainUser(user.userId, {
        organizationId: user.organizationId,
        role: user.role,
      });

      // Store user role in auth manager so services (e.g. agent) can check it
      if (user.role) {
        authManager.setUserRole(user.role);
      }

      // If tokens are already in memory but weren't persisted to keychain
      // (because user context wasn't available yet), persist now.
      if (authTokens.refreshToken) {
        authManager
          .setTokens(authTokens.accessToken!, authTokens.refreshToken, {
            orgId: user.organizationId,
            userId: user.userId,
          })
          .then(() => {
            authLogger.info("Refresh token persisted to keychain after user context set");
          });
      }

      // Auto-enable passive monitoring if preference is on (default: true)
      autoEnablePassiveMonitoring(user.userId);
    }
  );

  ipcMain.handle(IPC_CHANNELS.USER_CONTEXT_GET, () => {
    return currentUserContext;
  });

  // Screenshot Capture - Multi-window capture with smart caching
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
        // Get currently selected windows
        const selectedWindows = windowDetectionService.getSelectedWindows();
        const hasSelectedWindows = selectedWindows.length > 0;

        screenshotLogger.info(" Capture with filters:", {
          hasSelectedWindows,
          selectedWindows:
            selectedWindows
              .map((window) => `${window.appName} - ${window.windowTitle}`)
              .join(", ") || "none",
        });

        // Return early if no windows selected (watch mode OFF)
        if (!hasSelectedWindows) {
          screenshotLogger.info(" No windows selected, skipping capture");
          return {
            success: false,
            error: "No windows selected for capture",
            reason: "no_selection",
          };
        }

        // Convert selected windows to the format expected by captureWithCacheFallback
        const selectedApps = selectedWindows.map((w) => ({
          appName: w.appName,
          windowTitle: w.windowTitle,
        }));

        // Use smart capture with cache fallback (matches by appName, not windowId)
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

  // Display Metadata - for multi-monitor support
  ipcMain.handle(IPC_CHANNELS.GET_DISPLAY_METADATA, () => {
    const displays = screen.getAllDisplays();
    return displays.map((display) => ({
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    }));
  });

  ipcLogger.info(" Screenshot capture and display metadata handlers registered successfully");

  // Watch Mode IPC Handlers
  setupWatchModeHandlers();

  // Monitoring Session IPC Handlers
  setupMonitoringSessionHandlers();

  // Update notification handlers
  setupUpdateHandlers();

  // Custom notification handlers
  setupNotificationHandlers();

  // PDF export handler
  setupPdfExportHandler();

  // Agent IPC handlers
  setupAgentHandlers();
}

// Custom notification handlers (Granola-style prompts)
function setupNotificationHandlers() {
  // Show notification (from renderer or internal)
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_SHOW, async (_, config: NotificationConfig) => {
    showNotification(config);
    return { success: true };
  });

  // Hide notification
  ipcMain.on(IPC_CHANNELS.NOTIFICATION_HIDE, () => {
    hideNotification();
  });

  // Handle notification action button clicks (from custom macOS notification)
  ipcMain.on(IPC_CHANNELS.NOTIFICATION_ACTION, async (_, actionId: string) => {
    notificationLogger.info("Notification action (IPC):", actionId);
    hideNotification();
    handleNotificationAction(actionId);
  });

  // Recap-ready notification — delegates to centralized NotificationService
  ipcMain.handle(
    IPC_CHANNELS.SHOW_RECAP_NOTIFICATION,
    async (_, config: { title: string; message: string }) => {
      notificationService.notifyRecapReady(config.title);
      return { success: true };
    }
  );

  ipcLogger.info(" Notification handlers registered successfully");
}

// Watch mode handlers for selective screenshot capture
function setupWatchModeHandlers() {
  // Toggle watch mode on/off
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_TOGGLE, async (_event, enabled: boolean) => {
    watchModeLogger.info(` Toggling watch mode: ${enabled}`);

    windowDetectionService.setWatchingMode(enabled);

    if (enabled) {
      // Get all visible windows
      const windows = await windowDetectionService.getAllVisibleWindows();
      watchModeLogger.info(` Found ${windows.length} watchable windows`);

      // Create overlay buttons for ALL windows (including blocked ones to show policy)
      for (const window of windows) {
        createWatchButtonWindow(window, watchButtonWindows);
      }
    } else {
      // Close all watch button windows (but preserve selected windows state)
      watchModeLogger.info(" Closing all watch button windows");
      for (const [windowId, buttonWindow] of watchButtonWindows.entries()) {
        if (!buttonWindow.isDestroyed()) {
          buttonWindow.close();
        }
        watchButtonWindows.delete(windowId);
      }
      // Don't clear selected windows - preserve state for re-expansion
    }
  });

  // Get all visible windows (for monitoring session window selection)
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

  // Select a window to watch
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

      // On non-macOS platforms, block all browser windows from watch mode
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

      // macOS: only run focus + URL resolution for browser apps
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

  // Unselect a window
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOW_UNSELECT, async (_event, windowId: string) => {
    watchModeLogger.info(` Unselecting window: ${windowId}`);

    // Get the window info before removing to clear the cache
    const selectedWindows = windowDetectionService.getSelectedWindows();
    const windowToRemove = selectedWindows.find((w) => w.windowId === windowId);

    const removed = windowDetectionService.removeWindow(windowId);
    // Also remove from focusWindowTracker so it doesn't silently re-add on next tick
    focusWindowTracker.removeTrackedWindow(windowId);

    if (removed) {
      // Clear the cached screenshot for this window (keyed by windowTitle)
      if (windowToRemove) {
        captureService.clearCachedScreenshot(windowToRemove.windowTitle);
        watchModeLogger.info(` Cleared cache for ${windowToRemove.windowTitle}`);
      }
      broadcastWatchWindowsUpdate();
    }
  });

  // Get currently selected windows
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_GET_SELECTED, async () => {
    const selectedWindows = windowDetectionService.getSelectedWindows();
    watchModeLogger.info(` Returning ${selectedWindows.length} selected windows`);
    return selectedWindows;
  });

  // Broadcast updated window list to all windows
  function broadcastWatchWindowsUpdate() {
    const selectedWindows = windowDetectionService.getSelectedWindows();
    const windows = [consoleWindow, watchingPillWindow];

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
      const buttonWindow = watchButtonWindows.get(windowInfo.windowId);

      if (buttonWindow && !buttonWindow.isDestroyed()) {
        watchModeLogger.info(
          `Closing button for selected window: ${windowInfo.appName} (windowId: ${windowInfo.windowId})`
        );
        buttonWindow.close();
      }

      watchButtonWindows.delete(windowInfo.windowId);
      broadcastWatchWindowsUpdate();

      // Capture and cache screenshot immediately (window is visible now)
      // Match by windowTitle since desktopCapturer returns titles, not app names
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

// Monitoring Session handlers for work session tracking
function setupMonitoringSessionHandlers() {
  // Start a new monitoring session
  ipcMain.handle(
    IPC_CHANNELS.MONITORING_SESSION_START,
    async (
      _event,
      config: {
        sessionId: string; // Backend's session ID - ensures Electron uses same ID
        selectedWindows: any[];
        captureIntervalMs?: number;
        name?: string;
        userId: string;
        organizationId: string;
      }
    ) => {
      monitoringLogger.info(" Starting session:", {
        sessionId: config.sessionId,
        windowCount: config.selectedWindows.length,
        intervalMs: config.captureIntervalMs,
      });

      // Clear old windows before registering new ones (ensures clean slate for each session)
      windowDetectionService.clearAll();

      // Register windows with windowDetectionService so watch pill can access them
      for (const windowInfo of config.selectedWindows) {
        windowDetectionService.addWindow({
          windowId: windowInfo.windowId,
          appName: windowInfo.appName,
          windowTitle: windowInfo.windowTitle,
        });
      }

      // Broadcast update so watch pill gets the windows immediately
      const selectedWindows = windowDetectionService.getSelectedWindows();
      const allWindows = [consoleWindow, watchingPillWindow];
      for (const window of allWindows) {
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, selectedWindows);
        }
      }

      // Notify passive monitor that a manual session is starting
      await passiveMonitorService.onManualSessionStart();

      const result = await monitoringSessionService.startSession({
        sessionId: config.sessionId,
        selectedWindows: config.selectedWindows,
        captureIntervalMs: config.captureIntervalMs || SESSION_DEFAULTS.CAPTURE_INTERVAL_MS,
        name: config.name,
        userId: config.userId,
        organizationId: config.organizationId,
      });

      // After session starts successfully, show the watching pill if preference allows
      if (!result.error) {
        trackMainEvent(config.userId, "electron_session_started", {
          session_id: config.sessionId,
          window_count: config.selectedWindows.length,
          capture_interval_ms: config.captureIntervalMs || SESSION_DEFAULTS.CAPTURE_INTERVAL_MS,
        });
        const shouldShowPill = preferencesService.getShowPillOnSessionStart();
        if (shouldShowPill) {
          if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
            createWatchingPillWindow();
          }
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            showPillReliably(watchingPillWindow);
            startPillCursorTracking();
          }
        }
      }

      return result;
    }
  );

  // Pause the active session — also stops audio recording
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_PAUSE, async () => {
    monitoringLogger.info(" Pausing session");
    if (currentUserContext?.userId) {
      trackMainEvent(currentUserContext.userId, "electron_session_paused", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }

    audioActiveBeforePause = audioWebSocketService.isConnected();
    const sessionState = monitoringSessionService.getSessionState();

    // Stop audio if it was running (non-blocking)
    if (audioActiveBeforePause) {
      monitoringLogger.info("🔇 Pausing audio recording");
      audioWebSocketService.disconnect();
      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
      }
      // Notify backend to stop tracking audio duration
      if (sessionState?.id) {
        authManager
          .authenticatedFetch(`/api/monitoring/sessions/${sessionState.id}/audio/stop`, {
            method: "POST",
          })
          .catch((err) => monitoringLogger.error("Failed to stop audio on pause:", err));
      }
    }

    return monitoringSessionService.pauseSession();
  });

  // Resume the paused session — restarts audio if it was active before pause
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_RESUME, async () => {
    monitoringLogger.info(" Resuming session");
    if (currentUserContext?.userId) {
      trackMainEvent(currentUserContext.userId, "electron_session_resumed", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }
    const result = await monitoringSessionService.resumeSession();

    if (result.success && audioActiveBeforePause) {
      monitoringLogger.info("🎤 Audio was active before pause — signalling pill to restart");
      audioActiveBeforePause = false;
      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_START);
      }
    }

    return result;
  });

  // End the active session — returns immediately after stopping captures.
  // Audio WS is disconnected synchronously; backend notification runs in background.
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_END, async () => {
    monitoringLogger.info(" Ending session");
    audioActiveBeforePause = false;

    // Grab state before ending so we can notify backend in background
    const preEndState = monitoringSessionService.getSessionState();

    // Eagerly disconnect audio WS + kill AudioWorklet so a new session
    // won't collide with stale audio infrastructure
    audioCleanupDone = true;
    audioWebSocketService.disconnect();
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
    }

    // Stop captures / trackers — fast now that Top-K is removed
    const result = await monitoringSessionService.endSession();

    if (result.success && currentUserContext?.userId) {
      trackMainEvent(currentUserContext.userId, "electron_session_ended", {
        session_id: preEndState?.id,
      });
    }

    // Always hide watching pill when session ends
    if (result.success && watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.hide();
    }

    // Fire-and-forget: backend audio-stop notification + passive monitoring resume
    (async () => {
      if (preEndState?.id) {
        try {
          await authManager.authenticatedFetch(
            `/api/monitoring/sessions/${preEndState.id}/audio/stop`,
            { method: "POST" }
          );
        } catch (err) {
          monitoringLogger.error(" Background audio stop notification failed:", err);
        }
      }
      if (currentUserContext?.userId) {
        const passiveEnabled = preferencesService.getUserPassiveMonitoringEnabled(
          currentUserContext.userId
        );
        if (passiveEnabled) {
          passiveMonitorService.onManualSessionEnd();
        }
      }
    })();

    return result;
  });

  // Finalize session: upload captures to backend + trigger summarization
  ipcMain.handle(
    IPC_CHANNELS.MONITORING_SESSION_FINALIZE,
    async (
      _event,
      sessionId: string,
      captures: Array<{
        sequenceNumber: number;
        captureTrigger: "periodic" | "focus_change" | "manual";
        capturedAt: number;
        windowId?: string;
        appName?: string;
        windowTitle?: string;
        screenshotPath?: string;
        screenshotHash?: string;
      }>
    ) => {
      monitoringLogger.info("Finalizing session:", sessionId, "captures:", captures.length);

      try {
        // Step 1: Upload captures to backend
        if (captures.length > 0) {
          monitoringLogger.info(" Uploading", captures.length, "captures to backend");
          const uploadResponse = await authManager.authenticatedFetch(
            `/api/monitoring/sessions/${sessionId}/captures`,
            {
              method: "POST",
              body: JSON.stringify({ captures }),
            }
          );

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            monitoringLogger.error(" Upload captures error:", errorText);
            return { success: false, error: `Failed to upload captures: ${uploadResponse.status}` };
          }
          monitoringLogger.info(" Captures uploaded successfully");
        }

        // Step 2: Call /end endpoint to trigger summarization
        monitoringLogger.info(" Triggering summarization");
        const autoRecapForFinalize = currentUserContext?.userId
          ? preferencesService.getUserAutoRecap(currentUserContext.userId)
          : true;
        const endResponse = await authManager.authenticatedFetch(
          `/api/monitoring/sessions/${sessionId}/end`,
          {
            method: "POST",
            body: JSON.stringify({ autoRecap: autoRecapForFinalize }),
          }
        );

        if (!endResponse.ok) {
          const errorText = await endResponse.text();
          monitoringLogger.error(" End session error:", errorText);
          return { success: false, error: `Failed to end session: ${endResponse.status}` };
        }

        monitoringLogger.info(" Session finalized successfully");
        return { success: true };
      } catch (error) {
        monitoringLogger.error(" Finalize error:", error);
        return { success: false, error: String(error) };
      }
    }
  );

  // Reset/clear session state (used when session is deleted externally)
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_RESET, async () => {
    monitoringLogger.info(" Resetting session state");
    monitoringSessionService.resetSession();

    // Only resume passive monitoring if user has it enabled
    if (currentUserContext?.userId) {
      const passiveEnabled = preferencesService.getUserPassiveMonitoringEnabled(
        currentUserContext.userId
      );
      if (passiveEnabled) {
        passiveMonitorService.onManualSessionEnd();
      }
    }

    return { success: true };
  });

  // Passive monitoring IPC handlers
  ipcMain.handle(IPC_CHANNELS.PASSIVE_MONITORING_SET_ENABLED, async (_, enabled: boolean) => {
    monitoringLogger.info(` Passive monitoring set enabled: ${enabled}`);
    if (enabled) {
      if (currentUserContext) {
        passiveMonitorService.enable({
          startSession: () => startSessionFromMain("passive"),
          endSession: (sessionId) => endPassiveSessionFromMain(sessionId),
          isAudioActive: () => audioWebSocketService.isConnected(),
        });
        preferencesService.setUserPassiveMonitoringEnabled(currentUserContext.userId, true);
      } else {
        monitoringLogger.warn(" Cannot enable passive monitoring: no user context");
        return { success: false };
      }
    } else {
      await passiveMonitorService.disable();
      if (currentUserContext) {
        preferencesService.setUserPassiveMonitoringEnabled(currentUserContext.userId, false);
      }
    }
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.PASSIVE_MONITORING_GET_STATE, async () => {
    return passiveMonitorService.getState();
  });

  // Get current session status
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_STATUS, async () => {
    return monitoringSessionService.getSessionState();
  });

  // Session Recovery handlers
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_RECOVERABLE, async () => {
    recoveryLogger.info(" Getting recoverable sessions");
    return monitoringSessionService.getRecoverableSessions(currentUserContext?.userId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_RECOVER, async (_, sessionId: string) => {
    recoveryLogger.info(" Recovering session:", sessionId);
    return monitoringSessionService.recoverSession(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DISCARD, async (_, sessionId: string) => {
    recoveryLogger.info(" Discarding session:", sessionId);
    await monitoringSessionService.discardRecoverableSession(sessionId);
    return { success: true };
  });

  // Preferences IPC handlers
  ipcMain.handle(IPC_CHANNELS.PREFERENCES_GET, (_, key: string) => {
    return preferencesService.getPreference(key);
  });

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_SET, (_, key: string, value: boolean) => {
    if (currentUserContext?.userId) {
      trackMainEvent(currentUserContext.userId, "electron_preference_changed", {
        preference_key: key,
        new_value: value,
      });
    }
    return preferencesService.setPreference(key, value);
  });

  ipcMain.handle(IPC_CHANNELS.PREFERENCES_GET_ALL, () => {
    return preferencesService.getAllPreferences();
  });

  // Block list IPC handlers (user-scoped)
  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_GET, (_, userId: string) => {
    return preferencesService.getUserBlockedApps(userId);
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_SET, (_, userId: string, blockedApps: string[]) => {
    preferencesService.setUserBlockedApps(userId, blockedApps);
    focusWindowTracker.removeBlockedWindows();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_ADD, (_, userId: string, appName: string) => {
    preferencesService.addUserBlockedApp(userId, appName);
    focusWindowTracker.removeBlockedWindows();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_REMOVE, (_, userId: string, appName: string) => {
    preferencesService.removeUserBlockedApp(userId, appName);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_GET_DETECTED_APPS, () => {
    const detectedApps = windowDetectionService.getDetectedApps();
    const appsWithOriginalNames = detectedApps.map((normalized) => ({
      normalizedName: normalized,
      originalName: windowDetectionService.getOriginalAppName(normalized) || normalized,
    }));
    return appsWithOriginalNames;
  });

  // Get all blockable apps (detected + installed)
  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_GET_ALL_APPS, async (_, forceRefresh?: boolean) => {
    try {
      const allApps = await windowDetectionService.getAllBlockableApps(forceRefresh ?? false);
      return { success: true, apps: allApps };
    } catch (error) {
      ipcLogger.error("Error getting all blockable apps:", error);
      return { success: false, apps: [], error: (error as Error).message };
    }
  });

  // Refresh installed apps cache
  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_REFRESH_INSTALLED_APPS, async () => {
    try {
      await windowDetectionService.refreshInstalledApps();
      const allApps = await windowDetectionService.getAllBlockableApps(false);
      return { success: true, apps: allApps };
    } catch (error) {
      ipcLogger.error("Error refreshing installed apps:", error);
      return { success: false, apps: [], error: (error as Error).message };
    }
  });

  // Notification frequency IPC handlers (user-scoped)
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_FREQUENCY_GET, (_, userId: string) => {
    return preferencesService.getUserNotificationFrequency(userId);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_FREQUENCY_SET, (_, userId: string, minutes: number) => {
    preferencesService.setUserNotificationFrequency(userId, minutes);
    // Restart the notification timer with the new frequency
    startNotificationTimer();
    return { success: true };
  });

  // Audio recording IPC handlers
  ipcMain.handle(IPC_CHANNELS.MONITORING_AUDIO_START, async () => {
    monitoringLogger.info("🎤 Starting audio recording");
    if (currentUserContext?.userId) {
      trackMainEvent(currentUserContext.userId, "electron_audio_started", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }

    // Reset cleanup flag so audio chunks are processed again
    audioCleanupDone = false;

    const sessionState = monitoringSessionService.getSessionState();
    if (!sessionState || !sessionState.id) {
      return {
        success: false,
        hasSystemAudio: false,
        error: "No active session. Start a monitoring session first.",
      };
    }

    // Proactively refresh the access token before connecting the audio WebSocket.
    // Supabase JWTs expire after ~1 hour. If the user clicks mic after a long
    // idle period, the main-process token may be stale.
    const userCtx = currentUserContext
      ? { orgId: currentUserContext.organizationId, userId: currentUserContext.userId }
      : undefined;
    const freshToken = await authManager.refreshAccessToken(userCtx);
    if (freshToken) {
      authTokens.accessToken = freshToken;
      authTokens.refreshToken = authManager.getRefreshToken();
      monitoringLogger.info("🔑 Access token refreshed before audio WebSocket connect");
    }

    const token = authTokens.accessToken;
    if (!token) {
      return {
        success: false,
        hasSystemAudio: false,
        error: "No auth token available. Please log in first.",
      };
    }

    // Note: VITE_* env vars are NOT available in main process at runtime
    const PROD_API_URL = "https://mitablebackend-production.up.railway.app";
    const backendUrl = app.isPackaged
      ? PROD_API_URL
      : process.env.VITE_API_URL || "http://localhost:3000";
    const wsResult = await audioWebSocketService.connect(sessionState.id, backendUrl, token);

    if (!wsResult.success) {
      return {
        success: false,
        hasSystemAudio: false,
        error: wsResult.error,
      };
    }

    // Notify backend to start tracking audio recording duration
    try {
      const token = authTokens.accessToken;
      if (token) {
        await fetch(`${backendUrl}/api/monitoring/sessions/${sessionState.id}/audio/start`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      }
    } catch (error) {
      monitoringLogger.error("Failed to notify backend of audio start:", error);
      // Don't fail the audio recording if backend notification fails
    }

    monitoringLogger.info("✅ Audio WebSocket connected, ready for renderer to start capture");

    return {
      success: true,
      hasSystemAudio: false, // Will be set by renderer audio service
    };
  });

  // Handle audio chunks from renderer
  ipcMain.on("audio-chunk", (_event, audioBuffer: ArrayBuffer) => {
    try {
      // After cleanup, silently discard all chunks (renderer AudioWorklet may still be running)
      if (audioCleanupDone) {
        return;
      }

      const sessionState = monitoringSessionService.getSessionState();
      if (!sessionState?.id) {
        const now = Date.now();
        if (now - lastAudioChunkWarnAt > 5000) {
          monitoringLogger.warn(
            "⚠️ Received audio chunk but no active session (throttled, suppressing for 5s)"
          );
          lastAudioChunkWarnAt = now;
        }
        return;
      }

      // Forward audio chunk to backend via WebSocket
      audioWebSocketService.sendAudioChunk(audioBuffer);
    } catch (error) {
      monitoringLogger.error("❌ Error processing audio chunk:", error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MONITORING_AUDIO_STOP, async () => {
    if (currentUserContext?.userId) {
      trackMainEvent(currentUserContext.userId, "electron_audio_stopped", {
        session_id: monitoringSessionService.getSessionState()?.id,
      });
    }
    monitoringLogger.info("🔇 Stopping audio recording");

    const sessionState = monitoringSessionService.getSessionState();

    // Close WebSocket connection to backend
    audioWebSocketService.disconnect();

    // Notify backend to stop tracking and accumulate duration
    if (sessionState?.id) {
      try {
        await authManager.authenticatedFetch(
          `/api/monitoring/sessions/${sessionState.id}/audio/stop`,
          { method: "POST" }
        );
      } catch (error) {
        monitoringLogger.error("Failed to notify backend of audio stop:", error);
        // Don't fail the stop operation if backend notification fails
      }
    }

    return { success: true };
  });

  // Auto recap IPC handlers (user-scoped)
  ipcMain.handle(IPC_CHANNELS.AUTO_RECAP_GET, (_, userId: string) => {
    return preferencesService.getUserAutoRecap(userId);
  });

  ipcMain.handle(IPC_CHANNELS.AUTO_RECAP_SET, (_, userId: string, enabled: boolean) => {
    preferencesService.setUserAutoRecap(userId, enabled);
    return { success: true };
  });

  // Agent feature toggle IPC handlers
  ipcMain.handle(IPC_CHANNELS.AGENT_ENABLED_GET, (_, userId: string) => {
    return preferencesService.getUserAgentEnabled(userId);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_ENABLED_SET, (_, userId: string, enabled: boolean) => {
    preferencesService.setUserAgentEnabled(userId, enabled);
    return { success: true };
  });

  // Permissions IPC handlers (macOS)
  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_GET_STATUS, () => {
    if (process.platform === "darwin") {
      return {
        screen: systemPreferences.getMediaAccessStatus("screen"),
        accessibility: systemPreferences.isTrustedAccessibilityClient(false),
      };
    }
    // Non-macOS: report all granted
    return { screen: "granted", accessibility: true };
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_REQUEST_ACCESSIBILITY, () => {
    if (process.platform === "darwin") {
      systemPreferences.isTrustedAccessibilityClient(true);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSIONS_OPEN_SCREEN_RECORDING, async () => {
    if (process.platform === "darwin") {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
      );
    }
  });

  // Summary preferences IPC handlers
  ipcMain.handle(IPC_CHANNELS.SUMMARY_PREFERENCES_GET, () => {
    return preferencesService.getSummaryPreferences();
  });

  ipcMain.handle(
    IPC_CHANNELS.SUMMARY_PREFERENCES_SET,
    (
      _,
      prefs: {
        detailLevel?: "concise" | "verbose";
        format?: "bullets" | "paragraphs";
        includeScreenshots?: boolean;
        alwaysAskOnSessionEnd?: boolean;
      }
    ) => {
      return preferencesService.setSummaryPreferences(prefs);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SUMMARY_DEFAULTS_GET, () => {
    return preferencesService.getSummaryDefaults();
  });

  ipcMain.handle(
    IPC_CHANNELS.SUMMARY_DEFAULTS_SET,
    (
      _,
      defaults: {
        detailLevel?: "concise" | "verbose";
        format?: "bullets" | "paragraphs";
        includeScreenshots?: boolean;
      }
    ) => {
      return preferencesService.setSummaryDefaults(defaults);
    }
  );

  ipcMain.handle(IPC_CHANNELS.ALWAYS_ASK_ON_SESSION_END_GET, () => {
    return preferencesService.getAlwaysAskOnSessionEnd();
  });

  ipcMain.handle(IPC_CHANNELS.ALWAYS_ASK_ON_SESSION_END_SET, (_, value: boolean) => {
    return preferencesService.setAlwaysAskOnSessionEnd(value);
  });

  // Audio preferences IPC handlers
  // NOTE: navigator.mediaDevices is NOT available in Electron's main process.
  // We delegate device enumeration to the console renderer via webContents.executeJavaScript().
  ipcMain.handle(IPC_CHANNELS.AUDIO_DEVICES_ENUMERATE, async () => {
    try {
      if (!consoleWindow || consoleWindow.isDestroyed()) {
        return { success: false, devices: [], error: "Console window not available" };
      }

      const audioInputs = await consoleWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices
              .filter(d => d.kind === 'audioinput')
              .map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone ' + d.deviceId.slice(0, 8), groupId: d.groupId }));
            stream.getTracks().forEach(t => t.stop());
            return inputs;
          } catch (e) {
            return [];
          }
        })()
      `);

      monitoringLogger.info(`🎤 Found ${audioInputs.length} audio input devices`);
      return { success: true, devices: audioInputs };
    } catch (error) {
      monitoringLogger.error("Failed to enumerate audio devices:", error);
      return {
        success: false,
        devices: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIO_PREFERENCES_GET, () => {
    return preferencesService.getAudioPreferences();
  });

  ipcMain.handle(
    IPC_CHANNELS.AUDIO_PREFERENCES_SET,
    (
      _,
      prefs: {
        microphoneDeviceId?: string | null;
        systemAudioEnabled?: boolean;
      }
    ) => {
      return preferencesService.setAudioPreferences(prefs);
    }
  );

  // Theme / appearance preference
  ipcMain.handle(IPC_CHANNELS.THEME_GET, () => {
    return preferencesService.getTheme();
  });

  ipcMain.handle(IPC_CHANNELS.THEME_SET, (_, theme: "dark" | "light" | "system") => {
    nativeTheme.themeSource = theme;
    preferencesService.setTheme(theme);
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.THEME_CHANGED, theme);
      }
    }
    return { success: true };
  });

  // Pill display mode preference
  ipcMain.handle(IPC_CHANNELS.PILL_DISPLAY_MODE_GET, (_, userId: string) => {
    return preferencesService.getUserPillDisplayMode(userId);
  });

  ipcMain.handle(
    IPC_CHANNELS.PILL_DISPLAY_MODE_SET,
    (_, userId: string, mode: "compact" | "expanded") => {
      preferencesService.setUserPillDisplayMode(userId, mode);
      // Notify the watching pill window immediately
      const allWindows = BrowserWindow.getAllWindows();
      for (const win of allWindows) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.PILL_DISPLAY_MODE_CHANGED, mode);
        }
      }
      return { success: true };
    }
  );

  // End session fully: stop Electron captures + upload + POST /end to backend
  ipcMain.handle(IPC_CHANNELS.END_SESSION_FULL, async () => {
    monitoringLogger.info(" End session requested");
    audioActiveBeforePause = false;

    // Eagerly disconnect audio WS + kill AudioWorklet so a new session
    // won't collide with stale audio infrastructure
    const preEndState = monitoringSessionService.getSessionState();
    audioCleanupDone = true;
    audioWebSocketService.disconnect();
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
    }

    // End Electron-side capture loop — fast (no Top-K / base64)
    const result = await monitoringSessionService.endSession();

    // Fire-and-forget: backend audio-stop notification
    if (preEndState?.id) {
      authManager
        .authenticatedFetch(`/api/monitoring/sessions/${preEndState.id}/audio/stop`, {
          method: "POST",
        })
        .catch((err) => monitoringLogger.error(" Background audio stop notification failed:", err));
    }

    if (!result.success || !result.sessionId) {
      return result;
    }

    // Upload captures and trigger backend summarization
    try {
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

      monitoringLogger.info(` Triggering backend summarization`);
      const autoRecap = currentUserContext?.userId
        ? preferencesService.getUserAutoRecap(currentUserContext.userId)
        : true;
      await authManager.authenticatedFetch(`/api/monitoring/sessions/${result.sessionId}/end`, {
        method: "POST",
        body: JSON.stringify({ autoRecap }),
      });
    } catch (error) {
      monitoringLogger.error(" Error ending session:", error);
    }

    // Hide watching pill after successful end
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.hide();
    }

    return result;
  });

  ipcLogger.info(" Monitoring session handlers registered successfully");
}

// Update notification handlers
function setupUpdateHandlers() {
  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("check-for-updates", async () => {
    updateLogger.info(" Manual check for updates requested");
    await updateService.checkForUpdates();
    return { success: true };
  });

  ipcMain.handle("install-update", () => {
    updateLogger.info(" Install update requested");
    updateService.quitAndInstall();
    return { success: true };
  });

  ipcLogger.info(" Update handlers registered successfully");
}

function isBrowserProcess(appName: string, appPath?: string): boolean {
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

// Helper function to create a watch button window
function createWatchButtonWindow(window: any, watchButtonWindows: Map<string, BrowserWindow>) {
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

// Helper function to start a session from main process (used by shortcuts, pill, and passive monitoring)
async function startSessionFromMain(sessionType: "focused" | "passive" = "focused"): Promise<{
  success: boolean;
  error?: string;
  sessionId?: string;
}> {
  const shortcutLogger = createLogger("SessionShortcut");

  // Check if user is logged in
  if (!currentUserContext) {
    shortcutLogger.warn(" Start session failed: User not logged in");
    // Show Console so user can log in
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
      consoleWindow.focus();
    }
    return { success: false, error: "Please log in through the Console first" };
  }

  // Check if session already active
  const existingSession = monitoringSessionService.getSessionState();
  if (existingSession) {
    shortcutLogger.warn(" Start session failed: Session already active");
    return { success: false, error: "A session is already active" };
  }

  try {
    // Notify passive monitor that a manual session is starting (only for focused sessions)
    if (sessionType === "focused") {
      await passiveMonitorService.onManualSessionStart();
    }

    const sessionName = SESSION_DEFAULTS.DEFAULT_NAME;
    const captureIntervalMs = SESSION_DEFAULTS.CAPTURE_INTERVAL_MS;

    shortcutLogger.info(` Creating backend session: ${sessionName} (type: ${sessionType})`);
    const response = await authManager.authenticatedFetch("/api/monitoring/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: sessionName,
        selectedWindows: [], // Empty - focus tracker adds windows dynamically
        captureIntervalMs,
        sessionType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      shortcutLogger.error(" Backend session creation failed:", errorText);
      return { success: false, error: "Failed to create session" };
    }

    const backendResult = await response.json();
    if (!backendResult.session?.id) {
      shortcutLogger.error(" Backend returned no session ID");
      return { success: false, error: "Failed to create session" };
    }

    // Start Electron-side capture (focus tracker starts automatically)
    shortcutLogger.info(` Starting Electron capture for session: ${backendResult.session.id}`);
    const startResult = await monitoringSessionService.startSession({
      sessionId: backendResult.session.id,
      selectedWindows: [], // Empty - focus tracker adds windows based on user activity
      captureIntervalMs,
      userId: currentUserContext.userId,
      organizationId: currentUserContext.organizationId,
    });

    if (!startResult.error) {
      shortcutLogger.info(" Session started successfully");

      // Show the watching pill if preference allows (same logic as IPC handler)
      const shouldShowPill = preferencesService.getShowPillOnSessionStart();
      if (shouldShowPill) {
        if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
          createWatchingPillWindow();
        }
        if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
          showPillReliably(watchingPillWindow);
          startPillCursorTracking();
        }
      }

      return { success: true, sessionId: startResult.sessionId };
    }

    return { success: false, error: startResult.error };
  } catch (error) {
    shortcutLogger.error(" Start session error:", error);
    return { success: false, error: "Failed to start session" };
  }
}

// Helper function to end a passive session from main process
async function endPassiveSessionFromMain(sessionId: string): Promise<void> {
  const passiveLogger = createLogger("PassiveSession");
  passiveLogger.info(`Ending passive session: ${sessionId}`);

  try {
    // End via monitoringSessionService (handles captures/cleanup)
    const endResult = await monitoringSessionService.endSession();

    if (endResult.success) {
      passiveLogger.info(`Passive session ended, ${endResult.captureCount} captures`);

      // Upload captures to backend
      if (endResult.captures && endResult.captures.length > 0) {
        try {
          await authManager.authenticatedFetch(`/api/monitoring/sessions/${sessionId}/finalize`, {
            method: "POST",
            body: JSON.stringify({ captures: endResult.captures }),
          });
          passiveLogger.info("Passive session captures uploaded to backend");
        } catch (uploadError) {
          passiveLogger.error("Failed to upload passive session captures:", uploadError);
        }
      }

      // End the session on backend
      try {
        await authManager.authenticatedFetch(`/api/monitoring/sessions/${sessionId}/end`, {
          method: "POST",
        });
      } catch (endError) {
        passiveLogger.error("Failed to end session on backend:", endError);
      }
    }

    // Always hide watching pill when session ends
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.hide();
    }
  } catch (error) {
    passiveLogger.error("Error ending passive session:", error);
  }
}

/**
 * End all active sessions (focused or passive) with a timeout.
 * Used by before-quit, suspend, and shutdown handlers.
 * Best-effort: if backend call fails, stale cleanup catches it on next startup.
 */
async function endAllActiveSessions(timeoutMs: number): Promise<void> {
  const passiveState = passiveMonitorService.getState();
  const sessionState = monitoringSessionService.getSessionState();

  // Determine the active session ID from either source
  const sessionId = sessionState?.id ?? passiveState.sessionId;

  if (!sessionId) {
    shutdownLogger.info("No active session to end");
    return;
  }

  shutdownLogger.info(
    `Ending active session ${sessionId} (timeout: ${timeoutMs}ms, ` +
      `focused: ${sessionState?.status ?? "none"}, passive: ${passiveState.state})`
  );

  // 1. Stop audio recording
  await cleanupAudioRecording(sessionId);

  // 2. End local session (stops capture loop, activity tracker, saves checkpoint)
  try {
    const result = await monitoringSessionService.endSession();
    if (result.success) {
      shutdownLogger.info(`Local session ended, ${result.captureCount} captures`);
    }
  } catch (error) {
    shutdownLogger.error("Error ending local session:", error);
  }

  // 3. Best-effort backend /end call with timeout
  try {
    const autoRecap = currentUserContext?.userId
      ? preferencesService.getUserAutoRecap(currentUserContext.userId)
      : true;
    await authManager.authenticatedFetch(`/api/monitoring/sessions/${sessionId}/end`, {
      method: "POST",
      body: JSON.stringify({ autoRecap }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    shutdownLogger.info("Session ended successfully on backend");
  } catch (error) {
    shutdownLogger.error("Backend /end call failed (stale cleanup will handle):", error);
  }

  // 4. Reset passive monitor state (avoids double-end via callback)
  passiveMonitorService.forceReset();

  // 5. Hide watching pill
  if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
    watchingPillWindow.hide();
  }
}

// Track sequence for Cmd+M+M detection (Mac) or Ctrl+M+M (Windows)
let shortcutSequence: string[] = [];
let lastShortcutKeyTime = 0;
const SEQUENCE_TIMEOUT_MS = 2000; // 2 second timeout for sequence

// Global shortcuts
function registerGlobalShortcuts() {
  const shortcutLogger = createLogger("GlobalShortcuts");

  // Helper to reset sequence if timeout exceeded
  const resetSequenceIfNeeded = () => {
    const now = Date.now();
    if (now - lastShortcutKeyTime > SEQUENCE_TIMEOUT_MS) {
      shortcutSequence = [];
    }
  };

  // Session Start Shortcut (Cmd+M+M on Mac, Ctrl+M+M on Windows - press M twice while holding Cmd/Ctrl)
  globalShortcut.register("CommandOrControl+M", async () => {
    resetSequenceIfNeeded();
    lastShortcutKeyTime = Date.now();

    // Check if this is the second M press
    if (shortcutSequence.length === 1 && shortcutSequence[0] === "M") {
      // Complete sequence detected - start session
      shortcutLogger.info(" Cmd+M+M / Ctrl+M+M detected - starting session");
      shortcutSequence = []; // Reset

      try {
        const result = await startSessionFromMain();

        if (result.success) {
          notificationService.notifySessionStarted("focused");
        } else {
          notificationService.show({
            title: "Could not start session",
            body: result.error || "Please try again",
            clickAction: "focus",
          });
        }
      } catch (error) {
        shortcutLogger.error(" Error starting session via shortcut:", error);
      }
    } else {
      // First M press - start tracking sequence
      shortcutSequence = ["M"];
    }
  });

  // Update Prompt Trigger (Cmd+Shift+U) - Shows notification to send update
  globalShortcut.register("CommandOrControl+Shift+U", () => {
    notificationService.show({
      title: "Time to Send an Update",
      body: "Click to open your session and share your progress",
      clickAction: "view-active-session",
    });
  });

  // Watching Pill Toggle (Cmd+Shift+W)
  globalShortcut.register("CommandOrControl+Shift+W", () => {
    try {
      // Create window if it doesn't exist
      if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
        createWatchingPillWindow();
      }

      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        if (watchingPillWindow.isVisible()) {
          stopPillCursorTracking();
          watchingPillWindow.hide();
        } else {
          showPillReliably(watchingPillWindow);
          startPillCursorTracking();
        }
      }
    } catch {
      // Silently handle errors
    }
  });
}

app.whenReady().then(async () => {
  // Enforce Single Instance Lock - scoped by packaged vs dev so both can run simultaneously
  const lockData = { mode: app.isPackaged ? "production" : "development" };
  const gotTheLock = app.requestSingleInstanceLock(lockData);
  if (!gotTheLock) {
    consoleLogger.info(" Another instance is already running. Quitting...");
    app.quit();
    return;
  }

  // Differentiate dev instance so it uses separate userData/logs paths
  if (!app.isPackaged) {
    app.setName("Mitable Dev");
  }

  // Initialize PostHog analytics
  initAnalytics();
  trackMainEvent("anonymous", "electron_app_launched", {
    version: app.getVersion(),
    arch: process.arch,
    is_packaged: app.isPackaged,
  });

  // Set App User Model ID for Windows notification center integration
  if (process.platform === "win32") {
    app.setAppUserModelId(app.isPackaged ? "com.mitable.app" : "com.mitable.dev");
  }

  app.on("second-instance", (_event, commandLine) => {
    // Check for mitable:// protocol URL from Windows notification action clicks
    const protocolUrl = commandLine.find((arg) => arg.startsWith("mitable://"));
    if (protocolUrl) {
      const actionId = protocolUrl.replace("mitable://", "").replace(/\/$/, "");
      notificationLogger.info("Protocol action received:", actionId);
      handleNotificationAction(actionId);
      return;
    }

    // Default: focus the console window
    if (consoleWindow) {
      if (consoleWindow.isMinimized()) consoleWindow.restore();
      consoleWindow.show();
      consoleWindow.focus();
    }
  });

  // Initialize active window bridge for capture policy
  initActiveWindowBridge();

  // Create Console window (main dashboard)
  createConsoleWindow();
  // WatchingPill is created on-demand when session starts

  createTrayIfSupported();

  setupIPC();
  registerGlobalShortcuts();

  // Start Browser Bridge WebSocket server for Chrome Extension
  browserBridgeService.start().catch((err) => {
    consoleLogger.error("Failed to start BrowserBridgeService:", err);
  });

  // Broadcast connection updates to console window
  browserBridgeService.onConnectionChange((connected) => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.webContents.send(IPC_CHANNELS.BROWSER_BRIDGE_CONNECTION_UPDATE, connected);
    }
  });

  // IPC handlers for browser bridge
  ipcMain.handle(IPC_CHANNELS.BROWSER_BRIDGE_STATUS, () => {
    return browserBridgeService.isConnected();
  });
  ipcMain.handle(IPC_CHANNELS.BROWSER_BRIDGE_GET_INFO, () => {
    return browserBridgeService.getConnectionInfo();
  });

  // Feedback: main.log tail + renderer.log (DevTools/console stream persisted on disk next to main.log)
  const FEEDBACK_MAIN_LOG_TAIL_LINES = 10_000;
  const FEEDBACK_RENDERER_LOG_TAIL_LINES = 10_000;
  const MAIN_LOG_READ_MAX_BYTES = 4 * 1024 * 1024;
  const RENDERER_LOG_MAX_BYTES = 12 * 1024 * 1024;
  const RENDERER_LOG_READ_MAX_BYTES = 6 * 1024 * 1024;

  const getRendererLogPath = (): string | null => {
    const mainPath = electronLogMain.transports.file.getFile()?.path;
    if (!mainPath) return null;
    return join(dirname(mainPath), "renderer.log");
  };

  ipcMain.on(IPC_CHANNELS.FEEDBACK_APPEND_RENDERER_LOG, (_event, chunk: unknown) => {
    if (typeof chunk !== "string" || chunk.length === 0) return;
    if (chunk.length > 1_500_000) return;
    void (async () => {
      try {
        const fsp = await import("fs/promises");
        const rPath = getRendererLogPath();
        if (!rPath) return;
        await fsp.appendFile(rPath, chunk, "utf8");
        const st = await fsp.stat(rPath);
        if (st.size > RENDERER_LOG_MAX_BYTES) {
          const bak = `${rPath}.1`;
          try {
            await fsp.unlink(bak);
          } catch {
            /* no prior backup */
          }
          await fsp.rename(rPath, bak);
          await fsp.writeFile(
            rPath,
            `${new Date().toISOString()} [console.log] [renderer] Older lines rotated to renderer.log.1 (size cap)\n`,
            "utf8"
          );
        }
      } catch {
        /* avoid breaking renderer */
      }
    })();
  });

  ipcMain.handle(IPC_CHANNELS.FEEDBACK_GET_LOGS, async () => {
    try {
      const mainPath = electronLogMain.transports.file.getFile()?.path;
      if (!mainPath) {
        return { success: false, logs: "", rendererLogs: "", error: "Log file path not found" };
      }

      const fsp = await import("fs/promises");

      let mainContent = "";
      const stMain = await fsp.stat(mainPath).catch(() => null);
      if (stMain && stMain.size > 0) {
        if (stMain.size <= MAIN_LOG_READ_MAX_BYTES) {
          mainContent = await fsp.readFile(mainPath, "utf-8");
        } else {
          const fh = await fsp.open(mainPath, "r");
          try {
            const start = Number(stMain.size) - MAIN_LOG_READ_MAX_BYTES;
            const buf = Buffer.alloc(MAIN_LOG_READ_MAX_BYTES);
            await fh.read(buf, 0, MAIN_LOG_READ_MAX_BYTES, start);
            let s = buf.toString("utf8");
            const nl = s.indexOf("\n");
            if (nl !== -1) s = s.slice(nl + 1);
            mainContent =
              `...[main.log: last ~${Math.round(MAIN_LOG_READ_MAX_BYTES / 1024)}KB of file]\n\n` +
              s;
          } finally {
            await fh.close();
          }
        }
      }
      const mainLines = mainContent.split("\n");
      const mainTail = mainLines.slice(-FEEDBACK_MAIN_LOG_TAIL_LINES).join("\n");

      let rendererLogs = "";
      const rPath = getRendererLogPath();
      if (rPath) {
        try {
          const st = await fsp.stat(rPath).catch(() => null);
          if (st && st.size > 0) {
            if (st.size <= RENDERER_LOG_READ_MAX_BYTES) {
              rendererLogs = await fsp.readFile(rPath, "utf-8");
            } else {
              const fh = await fsp.open(rPath, "r");
              try {
                const start = Number(st.size) - RENDERER_LOG_READ_MAX_BYTES;
                const buf = Buffer.alloc(RENDERER_LOG_READ_MAX_BYTES);
                await fh.read(buf, 0, RENDERER_LOG_READ_MAX_BYTES, start);
                let s = buf.toString("utf8");
                const nl = s.indexOf("\n");
                if (nl !== -1) s = s.slice(nl + 1);
                rendererLogs =
                  `...[renderer.log: last ~${Math.round(RENDERER_LOG_READ_MAX_BYTES / 1024)}KB of file]\n\n` +
                  s;
              } finally {
                await fh.close();
              }
            }
          }
        } catch {
          rendererLogs = "";
        }
        if (rendererLogs) {
          const rl = rendererLogs.split("\n");
          rendererLogs = rl.slice(-FEEDBACK_RENDERER_LOG_TAIL_LINES).join("\n");
        }
      }

      return { success: true, logs: mainTail, rendererLogs };
    } catch (err) {
      return { success: false, logs: "", rendererLogs: "", error: String(err) };
    }
  });

  // Wire centralized notification service
  notificationService.setClickHandler(handleNotificationAction);
  notificationService.setUserIdProvider(() => currentUserContext?.userId ?? null);

  // Wire max-duration handler: auto-end session after 6 hours with OS notification
  monitoringSessionService.setMaxDurationHandler(async (sessionId) => {
    const maxDurLogger = createLogger("MaxDuration");
    maxDurLogger.info(`Session hit 6h cap — auto-ending: ${sessionId}`);

    try {
      audioActiveBeforePause = false;
      audioCleanupDone = true;
      audioWebSocketService.disconnect();
      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        watchingPillWindow.webContents.send(IPC_CHANNELS.MONITORING_AUDIO_FORCE_STOP);
      }

      const result = await monitoringSessionService.endSession();

      if (result.success && result.sessionId) {
        if (result.captures && result.captures.length > 0) {
          await authManager.authenticatedFetch(
            `/api/monitoring/sessions/${result.sessionId}/captures`,
            { method: "POST", body: JSON.stringify({ captures: result.captures }) }
          );
        }

        const autoRecap = currentUserContext?.userId
          ? preferencesService.getUserAutoRecap(currentUserContext.userId)
          : true;
        await authManager.authenticatedFetch(`/api/monitoring/sessions/${result.sessionId}/end`, {
          method: "POST",
          body: JSON.stringify({ autoRecap }),
        });
      }

      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        watchingPillWindow.hide();
      }

      // Broadcast to Console renderer so the UI updates
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.webContents.send("session-auto-ended", { sessionId, reason: "max_duration" });
      }
    } catch (err) {
      maxDurLogger.error("Failed to auto-end max-duration session:", String(err));
    }

    notificationService.show({
      title: "Session Ended — 6 Hour Limit",
      body: "Your session reached the maximum length and was saved automatically. Start a new session to keep tracking.",
      category: "session",
      dedupeKey: `max-duration-${sessionId}`,
      clickAction: "focus",
    });
  });

  // OS notification only when update is downloaded and ready to install
  updateService.setOnUpdateDownloaded((version) =>
    notificationService.notifyUpdateDownloaded(version)
  );

  // In dev mode, wait for the backend to be reachable before making any network calls.
  // Both processes start together via `npm run dev`, so the backend may still be initializing.
  if (!app.isPackaged) {
    const backendUrl = process.env.VITE_API_URL || "http://localhost:3000";
    const MAX_WAIT = 30_000; // 30s max
    const POLL_MS = 1_000;
    const startWait = Date.now();
    authLogger.info(`Waiting for backend at ${backendUrl}/health …`);

    while (Date.now() - startWait < MAX_WAIT) {
      try {
        const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          authLogger.info(`Backend ready (${Date.now() - startWait}ms)`);
          break;
        }
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  // Restore auth session from OS keychain (survives app restarts)
  try {
    const restored = await authManager.restoreSession();
    if (restored) {
      authLogger.info("Session restored from keychain on startup", {
        userId: restored.userId,
        orgId: restored.organizationId,
      });

      // Populate in-memory token cache
      authTokens.accessToken = restored.accessToken;
      authTokens.refreshToken = restored.refreshToken;

      // Restore user context so subsequent IPC handlers can persist to keychain
      currentUserContext = {
        userId: restored.userId,
        organizationId: restored.organizationId,
      };

      // Auto-enable passive monitoring if preference is on (default: true)
      autoEnablePassiveMonitoring(restored.userId);

      // Push restored tokens to the console renderer once it's ready
      const pushTokensToConsole = () => {
        if (consoleWindow && !consoleWindow.isDestroyed()) {
          consoleWindow.webContents.send(IPC_CHANNELS.AUTH_SESSION_RESTORED, {
            accessToken: restored.accessToken,
            refreshToken: restored.refreshToken,
          });
          authLogger.info("Restored tokens pushed to console renderer");
        }
      };

      // Console may still be loading — wait for dom-ready then push
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        if (consoleWindow.webContents.isLoading()) {
          consoleWindow.webContents.once("did-finish-load", pushTokensToConsole);
        } else {
          // Already loaded (unlikely at this point but safe)
          pushTokensToConsole();
        }
      }
    } else {
      authLogger.info("No session to restore — user will need to log in");
    }
  } catch (error) {
    authLogger.error("Session restore failed on startup:", error);
  }

  // Start automatic update checks (every 4 hours)
  updateService.startPeriodicChecks(240);

  // Start periodic notification timer (prompts user to turn on monitoring)
  startNotificationTimer();

  // Clean up stale sessions on startup (laptop closed, crash, etc.)
  // Runs server-side for this user — auto-ends sessions with no recent captures
  try {
    if (authManager.getAccessToken()) {
      const cleanupRes = await authManager.authenticatedFetch(
        "/api/monitoring/sessions/cleanup-stale",
        {
          method: "POST",
        }
      );
      if (cleanupRes.ok) {
        const cleanupData = await cleanupRes.json();
        if (cleanupData.sessionsEnded > 0) {
          recoveryLogger.info(
            `Auto-ended ${cleanupData.sessionsEnded} stale session(s) on startup`
          );
        }
      }
    }
  } catch (error) {
    recoveryLogger.warn("Stale session cleanup failed on startup (non-fatal):", error);
  }

  // Check for recoverable sessions on startup (crash recovery)
  try {
    const recoverableSessions = await monitoringSessionService.getRecoverableSessions(
      currentUserContext?.userId
    );
    if (recoverableSessions.length > 0) {
      recoveryLogger.info(` Found ${recoverableSessions.length} recoverable session(s)`);
      // Notify console window to show recovery dialog
      setTimeout(() => {
        if (consoleWindow && !consoleWindow.isDestroyed()) {
          consoleWindow.webContents.send(
            IPC_CHANNELS.SESSION_SHOW_RECOVERY_DIALOG,
            recoverableSessions
          );
        }
      }, 2000); // Give console time to fully load
    }
  } catch (error) {
    recoveryLogger.error(" Error checking for recoverable sessions:", error);
  }
});

app.on("window-all-closed", () => {
  // If user explicitly quits (tray "Quit"), allow shutdown.
  // Otherwise, keep running so the app can be reopened quickly.
  if (process.platform === "linux") {
    app.quit();
    return;
  }
  if (isExplicitQuit) app.quit();
});

// macOS: Re-create or focus window when clicking dock icon
app.on("activate", () => {
  // On macOS, re-create Console if no windows exist, otherwise focus it
  if (BrowserWindow.getAllWindows().length === 0) {
    createConsoleWindow();
  } else if (consoleWindow && !consoleWindow.isDestroyed()) {
    // Show and focus the Console window
    if (consoleWindow.isMinimized()) {
      consoleWindow.restore();
    }
    consoleWindow.show();
    consoleWindow.focus();
  }
});

// Graceful shutdown: end active sessions on quit, suspend, and shutdown
let isEndingSession = false;
let wasPassiveRunning = false;

app.on("before-quit", async (event) => {
  // Prevent re-entry (suspend/shutdown handler may already be running)
  if (isEndingSession) return;

  // Check if there's any active session (focused or passive)
  const sessionState = monitoringSessionService.getSessionState();
  const passiveState = passiveMonitorService.getState();
  const hasActiveSession =
    (sessionState && (sessionState.status === "active" || sessionState.status === "paused")) ||
    passiveState.sessionId !== null;

  if (hasActiveSession) {
    event.preventDefault();
    isEndingSession = true;

    shutdownLogger.info("Ending active session before quit...");
    await endAllActiveSessions(5000);

    // Now quit for real
    app.quit();
  }
});

// Suspend — laptop lid close / system sleep
powerMonitor.on("suspend", async () => {
  shutdownLogger.info("System suspending (lid close / sleep)");
  if (isEndingSession) return;

  wasPassiveRunning = passiveMonitorService.wasEnabled();
  isEndingSession = true;

  await endAllActiveSessions(3000);

  // Reset flag so quit-after-resume still works
  isEndingSession = false;
});

// Resume — laptop lid open / system wake
powerMonitor.on("resume", () => {
  shutdownLogger.info("System resumed from suspend");

  if (wasPassiveRunning) {
    // Check if user preference still has passive monitoring enabled
    const userId = currentUserContext?.userId;
    const prefEnabled = userId ? preferencesService.getUserPassiveMonitoringEnabled(userId) : false;

    if (prefEnabled) {
      shutdownLogger.info("Restarting passive monitoring after resume (5s delay)");
      setTimeout(() => {
        // Re-check: user may have toggled preference during the delay
        const stillEnabled = userId
          ? preferencesService.getUserPassiveMonitoringEnabled(userId)
          : false;
        if (stillEnabled && passiveMonitorService.getState().state === "disabled") {
          passiveMonitorService.enable({
            startSession: () => startSessionFromMain("passive"),
            endSession: (sessionId) => endPassiveSessionFromMain(sessionId),
            isAudioActive: () => audioWebSocketService.isConnected(),
          });
        }
      }, 5000);
    }
    wasPassiveRunning = false;
  }
});

// Shutdown — system shutdown / restart
powerMonitor.on("shutdown", async () => {
  shutdownLogger.info("System shutting down");
  if (isEndingSession) return;
  isEndingSession = true;

  await endAllActiveSessions(3000);
});

// PDF Export — generate PDF from HTML via hidden BrowserWindow
function setupPdfExportHandler() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { dialog } = require("electron") as typeof import("electron");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { writeFile } = require("fs/promises") as typeof import("fs/promises");

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_PDF,
    async (_, { html, title }: { html: string; title: string }) => {
      const pdfLogger = createLogger("PDFExport");
      try {
        // Create a hidden window to render the HTML
        const win = new BrowserWindow({
          width: 800,
          height: 1100,
          show: false,
          webPreferences: {
            offscreen: true,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });

        const styledHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; font-size: 13px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
  h3 { font-size: 14px; margin-top: 20px; margin-bottom: 6px; }
  p { margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  th { font-weight: 600; background: #f5f5f5; }
  ul, ol { padding-left: 24px; }
  li { margin-bottom: 4px; }
  strong { font-weight: 600; }
</style></head><body>${html}</body></html>`;

        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`);

        // Wait for content to render
        await new Promise((r) => setTimeout(r, 500));

        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
        });

        win.close();

        // Show Save As dialog
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim() || "Report";
        const { filePath } = await dialog.showSaveDialog({
          defaultPath: `${sanitizedTitle}.pdf`,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });

        if (filePath) {
          await writeFile(filePath, pdfBuffer);
          pdfLogger.info("PDF saved to:", filePath);
          return { success: true, filePath };
        }

        return { success: false, cancelled: true };
      } catch (error) {
        pdfLogger.error("PDF export failed:", error);
        return { success: false, error: String(error) };
      }
    }
  );
}

function setupAgentHandlers() {
  const agentLogger = createLogger("Agent");

  // Send message to agent
  ipcMain.handle(
    IPC_CHANNELS.AGENT_SEND_MESSAGE,
    async (_event, conversationId: string, message: string) => {
      agentLogger.info("Agent message received", { conversationId });
      await agentSdkService.sendMessage(conversationId, message, {
        onEvent: (event) => {
          if (consoleWindow && !consoleWindow.isDestroyed()) {
            consoleWindow.webContents.send(IPC_CHANNELS.AGENT_MESSAGE_EVENT, event);
          }
        },
      });
    }
  );

  // Cancel active agent query
  ipcMain.handle(IPC_CHANNELS.AGENT_CANCEL, async () => {
    agentLogger.info("Agent cancel requested");
    agentSdkService.cancel();
  });

  // Approve or deny a proposed agent plan
  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPROVE_PLAN,
    async (_event, conversationId: string, approved: boolean) => {
      agentLogger.info("Agent plan response", { conversationId, approved });
      if (approved) {
        await agentSdkService.approvePlan(conversationId, {
          onEvent: (event) => {
            if (consoleWindow && !consoleWindow.isDestroyed()) {
              consoleWindow.webContents.send(IPC_CHANNELS.AGENT_MESSAGE_EVENT, event);
            }
          },
        });
      } else {
        agentSdkService.denyPlan(conversationId);
      }
    }
  );

  // Decay stale skills on startup
  skillsStore.decayStaleSkills().catch((e) => {
    agentLogger.error("Failed to decay stale skills", e);
  });
}

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  updateService.stopPeriodicChecks();
  stopNotificationTimer();
  // Ensure focus window tracker is stopped even if session state is corrupted
  focusWindowTracker.stop();
  // Ensure passive polling stops on quit
  passiveMonitorService.forceReset();
  // Stop browser bridge WebSocket server
  browserBridgeService.stop();

  // Track app quit and flush PostHog events
  if (currentUserContext?.userId) {
    trackMainEvent(currentUserContext.userId, "electron_app_quit");
  }
  shutdownAnalytics();
});
