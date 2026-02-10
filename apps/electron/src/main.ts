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
  nativeTheme,
  Notification,
  powerMonitor,
  screen,
  shell,
} from "electron";
import { join } from "path";
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

// Force dark theme for consistent vibrancy effect regardless of system settings
nativeTheme.themeSource = "dark";

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

// Watch button windows tracking (module scope for cleanup from multiple handlers)
const watchButtonWindows: Map<string, BrowserWindow> = new Map();

// User context storage (shared across all windows for session start)
let currentUserContext: { userId: string; organizationId: string } | null = null;

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
      const token = authTokens.accessToken;
      const PROD_API_URL = "https://mitablebackend-production.up.railway.app";
      const backendUrl = app.isPackaged
        ? PROD_API_URL
        : process.env.VITE_API_URL || "http://localhost:3000";
      if (token) {
        await fetch(`${backendUrl}/api/monitoring/sessions/${sessionId}/audio/stop`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      }
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
    title: "Mitable Console",
    width: windowWidth,
    height: windowHeight,
    // Center the window within the chosen display's work area
    x: screenX + Math.floor((screenWidth - windowWidth) / 2),
    y: screenY + Math.floor((screenHeight - windowHeight) / 2),
    // Hidden title bar with native controls
    titleBarStyle: "hidden",
    // Show native window controls on Windows/Linux via titleBarOverlay
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: "#1a1a1a",
            symbolColor: "#ffffff",
            height: 32,
          },
        }),
    maximizable: true,
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

  consoleWindow.on("closed", () => {
    app.quit(); // Quit app when main console window is closed
  });
}

function createWatchingPillWindow() {
  // Get screen dimensions for right-edge, vertically centered positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 50; // Just the pill width
  const windowHeight = 180; // Pill height with mic button (increased from 130 to accommodate 4 buttons + rounded caps)
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
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/watchingPill.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    watchingPillWindow.setAlwaysOnTop(true, "modal-panel");
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
    watchingPillWindow = null;
    stopClosedWindowCheck();
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
    show: false,
    parent: watchingPillWindow, // Child of pill window
    webPreferences: {
      preload: join(__dirname, "../preload/watchingPillDropdown.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top
  if (process.platform === "darwin") {
    watchingPillEyeDropdown.setAlwaysOnTop(true, "modal-panel");
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
    show: false,
    parent: watchingPillWindow, // Child of pill window
    webPreferences: {
      preload: join(__dirname, "../preload/watchingPillDropdown.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top
  if (process.platform === "darwin") {
    watchingPillMenuDropdown.setAlwaysOnTop(true, "modal-panel");
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

// Setup powerMonitor listeners for auto session start
function setupPowerMonitor() {
  const powerLogger = createLogger("PowerMonitor");

  // Listen for system resume (wake from sleep or unlock)
  powerMonitor.on("resume", async () => {
    powerLogger.info(" System resumed (wake from sleep/unlock)");

    // Check if auto session start is enabled for current user
    if (!currentUserContext?.userId) {
      powerLogger.info(" No user context, skipping auto session start");
      return;
    }

    const autoSessionStartEnabled = preferencesService.getUserAutoSessionStart(
      currentUserContext.userId
    );
    if (!autoSessionStartEnabled) {
      powerLogger.info(" Auto session start disabled, skipping");
      return;
    }

    // Check if there's already an active session
    const sessionState = monitoringSessionService.getSessionState();
    const isSessionActive = sessionState?.status === "active" || sessionState?.status === "paused";

    if (isSessionActive) {
      powerLogger.info(" Session already active, continuing existing session");
      // If session was paused, resume it
      if (sessionState?.status === "paused") {
        await monitoringSessionService.resumeSession();
      }
      return;
    }

    // No active session - start a new one
    powerLogger.info(" No active session, starting new session via auto-start");
    try {
      const result = await startSessionFromMain();
      if (result.success) {
        powerLogger.info(" Auto session started successfully:", result.sessionId);
      } else {
        powerLogger.warn(" Auto session start failed:", result.error);
      }
    } catch (error) {
      powerLogger.error(" Error starting auto session:", error);
    }
  });

  powerLogger.info(" PowerMonitor listeners registered");
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
      watchingPillWindow.show();
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
          // Check if user wants to be asked for summary preferences
          const alwaysAsk = preferencesService.getAlwaysAskOnSessionEnd();

          const sessionState = monitoringSessionService.getSessionState();
          if (!sessionState?.id) {
            monitoringLogger.warn(" No active session found for end-session action");
            return { success: false, error: "No active session" };
          }

          const sessionId = sessionState.id;

          const sendToConsole = (send: () => void) => {
            if (!consoleWindow || consoleWindow.isDestroyed()) {
              createConsoleWindow();
            }

            if (consoleWindow && !consoleWindow.isDestroyed()) {
              consoleWindow.show();
              consoleWindow.focus();

              if (consoleWindow.webContents.isLoading()) {
                consoleWindow.webContents.once("did-finish-load", send);
              } else {
                send();
              }
            }
          };

          if (alwaysAsk) {
            // Open Console and trigger the EndSessionDialog
            monitoringLogger.info(" Always ask is enabled - showing Console with dialog");
            sendToConsole(() => {
              consoleWindow?.webContents.send(IPC_CHANNELS.NAVIGATE_TO_SESSION_DETAIL, {
                sessionId,
                openEndDialog: true,
              });
            });
            return { success: true, dialogTriggered: true };
          }

          // User doesn't want dialog - use stored defaults
          monitoringLogger.info(" Using stored summary defaults (dialog disabled)");
          const summaryDefaults = preferencesService.getSummaryDefaults();

          sendToConsole(() => {
            consoleWindow?.webContents.send(IPC_CHANNELS.NAVIGATE_TO_SESSION_DETAIL, {
              sessionId,
              showSummaryToast: true,
            });
          });

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
          if (consoleWindow && !consoleWindow.isDestroyed()) {
            consoleWindow.show();
            consoleWindow.focus();
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
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
      consoleWindow.focus();
    }
  });

  // ==================== User Context IPC Handlers ====================
  // Store user context for cross-window access (e.g., WatchingPill needs userId/orgId)
  // Note: currentUserContext is defined at module scope for access from global shortcuts

  ipcMain.on(
    IPC_CHANNELS.USER_CONTEXT_SET,
    (_event, user: { userId: string; organizationId: string }) => {
      consoleLogger.info(" Set:", user);
      currentUserContext = user;

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
        const shouldShowPill = preferencesService.getShowPillOnSessionStart();
        if (shouldShowPill) {
          if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
            createWatchingPillWindow();
          }
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            watchingPillWindow.show();
          }
        }
      }

      return result;
    }
  );

  // Pause the active session
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_PAUSE, async () => {
    monitoringLogger.info(" Pausing session");
    return monitoringSessionService.pauseSession();
  });

  // Resume the paused session
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_RESUME, async () => {
    monitoringLogger.info(" Resuming session");
    return monitoringSessionService.resumeSession();
  });

  // End the active session
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_END, async () => {
    monitoringLogger.info(" Ending session");

    // Stop audio recording before ending session (prevents runaway AudioWorklet)
    const preEndState = monitoringSessionService.getSessionState();
    await cleanupAudioRecording(preEndState?.id);

    const result = await monitoringSessionService.endSession();

    // Only hide watching pill if preference is enabled
    const shouldHide = preferencesService.getHidePillOnSessionEnd();
    if (shouldHide && result.success && watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.hide();
    }

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
        const token = authTokens.accessToken;
        if (!token) {
          return { success: false, error: "No auth token available" };
        }

        // Production API URL (Railway) - must match renderer config
        const PROD_API_URL = "https://mitablebackend-production.up.railway.app";
        const API_BASE_URL = app.isPackaged
          ? PROD_API_URL
          : process.env.VITE_API_URL || "http://localhost:3000";

        // Step 1: Upload captures to backend
        if (captures.length > 0) {
          monitoringLogger.info(" Uploading", captures.length, "captures to backend");
          const uploadResponse = await fetch(
            `${API_BASE_URL}/api/monitoring/sessions/${sessionId}/captures`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
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
        const endResponse = await fetch(
          `${API_BASE_URL}/api/monitoring/sessions/${sessionId}/end`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
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
    return { success: true };
  });

  // Get current session status
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_STATUS, async () => {
    return monitoringSessionService.getSessionState();
  });

  // Session Recovery handlers
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_RECOVERABLE, async () => {
    recoveryLogger.info(" Getting recoverable sessions");
    return monitoringSessionService.getRecoverableSessions();
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
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BLOCK_LIST_ADD, (_, userId: string, appName: string) => {
    preferencesService.addUserBlockedApp(userId, appName);
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

    // Connect WebSocket to backend for audio streaming
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
    monitoringLogger.info("🔇 Stopping audio recording");

    const sessionState = monitoringSessionService.getSessionState();

    // Close WebSocket connection to backend
    audioWebSocketService.disconnect();

    // Notify backend to stop tracking and accumulate duration
    if (sessionState?.id) {
      try {
        const token = authTokens.accessToken;
        // Note: VITE_* env vars are NOT available in main process at runtime
        const PROD_API_URL = "https://mitablebackend-production.up.railway.app";
        const backendUrl = app.isPackaged
          ? PROD_API_URL
          : process.env.VITE_API_URL || "http://localhost:3000";
        if (token) {
          await fetch(`${backendUrl}/api/monitoring/sessions/${sessionState.id}/audio/stop`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
        }
      } catch (error) {
        monitoringLogger.error("Failed to notify backend of audio stop:", error);
        // Don't fail the stop operation if backend notification fails
      }
    }

    return { success: true };
  });

  // Auto session start IPC handlers (user-scoped)
  ipcMain.handle(IPC_CHANNELS.AUTO_SESSION_START_GET, (_, userId: string) => {
    return preferencesService.getUserAutoSessionStart(userId);
  });

  ipcMain.handle(IPC_CHANNELS.AUTO_SESSION_START_SET, (_, userId: string, enabled: boolean) => {
    preferencesService.setUserAutoSessionStart(userId, enabled);
    return { success: true };
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

  // End session with preferences (called from Console after dialog confirmation)
  ipcMain.handle(
    IPC_CHANNELS.END_SESSION_WITH_PREFERENCES,
    async (
      _,
      preferences: {
        detailLevel: "concise" | "verbose";
        format: "bullets" | "paragraphs";
        includeScreenshots: boolean;
      }
    ) => {
      monitoringLogger.info(" End session with preferences requested:", preferences);

      // Stop audio recording before ending session (prevents runaway AudioWorklet)
      const preEndState = monitoringSessionService.getSessionState();
      await cleanupAudioRecording(preEndState?.id);

      // End Electron-side capture loop and get captures
      const result = await monitoringSessionService.endSession();

      if (!result.success || !result.sessionId) {
        return result;
      }

      // Upload captures and end backend session with preferences
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

        // End backend session with preferences
        monitoringLogger.info(` Triggering backend summarization with preferences`);
        await authManager.authenticatedFetch(`/api/monitoring/sessions/${result.sessionId}/end`, {
          method: "POST",
          body: JSON.stringify({
            preferences: {
              detailLevel: preferences.detailLevel,
              format: preferences.format,
              includeScreenshots: preferences.includeScreenshots,
            },
          }),
        });
      } catch (error) {
        monitoringLogger.error(" Error ending session with preferences:", error);
      }

      // Hide watching pill after successful end
      if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
        watchingPillWindow.hide();
      }

      return result;
    }
  );

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

  ipcMain.handle("download-update", async () => {
    updateLogger.info(" Download update requested");
    try {
      await updateService.downloadUpdate();
      return { success: true };
    } catch (error) {
      updateLogger.error(" Download failed:", error);
      return { success: false, error: String(error) };
    }
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

// Helper function to start a session from main process (used by shortcuts and pill)
async function startSessionFromMain(): Promise<{
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
    const sessionName = SESSION_DEFAULTS.DEFAULT_NAME;
    const captureIntervalMs = SESSION_DEFAULTS.CAPTURE_INTERVAL_MS;

    shortcutLogger.info(` Creating backend session: ${sessionName}`);
    const response = await authManager.authenticatedFetch("/api/monitoring/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: sessionName,
        selectedWindows: [], // Empty - focus tracker adds windows dynamically
        captureIntervalMs,
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
          watchingPillWindow.show();
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
          // Show success notification
          const notification = new Notification({
            title: "Session Started",
            body: "Your work session is now being tracked",
            silent: false,
          });

          notification.on("click", () => {
            if (consoleWindow && !consoleWindow.isDestroyed()) {
              consoleWindow.show();
              consoleWindow.focus();
              consoleWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION);
            }
          });

          notification.show();
        } else {
          // Show error notification
          const notification = new Notification({
            title: "Could not start session",
            body: result.error || "Please try again",
            silent: false,
          });

          notification.on("click", () => {
            if (consoleWindow && !consoleWindow.isDestroyed()) {
              consoleWindow.show();
              consoleWindow.focus();
            }
          });

          notification.show();
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
    try {
      const notification = new Notification({
        title: "Time to Send an Update",
        body: "Click to open your session and share your progress",
        silent: false,
      });

      notification.on("click", () => {
        if (consoleWindow && !consoleWindow.isDestroyed()) {
          consoleWindow.show();
          consoleWindow.focus();
          consoleWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION);
        }
      });

      notification.show();
    } catch {
      // Fallback: just open console if notification fails
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.show();
        consoleWindow.focus();
        consoleWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION);
      }
    }
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
          watchingPillWindow.hide();
        } else {
          watchingPillWindow.show();
        }
      }
    } catch {
      // Silently handle errors
    }
  });
}

app.whenReady().then(async () => {
  // Enforce Single Instance Lock - must be first to prevent duplicate initialization
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    consoleLogger.info(" Another instance is already running. Quitting...");
    app.quit();
    return;
  }

  // Set App User Model ID for Windows notification center integration
  if (process.platform === "win32") {
    app.setAppUserModelId("com.mitable.app");
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

  setupIPC();
  registerGlobalShortcuts();

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

  // Setup powerMonitor listeners for auto session start
  setupPowerMonitor();

  // Start automatic update checks (every 4 hours)
  updateService.startPeriodicChecks(240);

  // Start periodic notification timer (prompts user to turn on monitoring)
  startNotificationTimer();

  // Check for recoverable sessions on startup (crash recovery)
  try {
    const recoverableSessions = await monitoringSessionService.getRecoverableSessions();
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
  if (process.platform !== "darwin") {
    app.quit();
  }
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

// Graceful shutdown: end active session on backend before exit
let isQuitting = false;
app.on("before-quit", async (event) => {
  // Prevent infinite loop
  if (isQuitting) return;

  // Check if there's an active session
  const sessionState = monitoringSessionService.getSessionState();
  if (sessionState && (sessionState.status === "active" || sessionState.status === "paused")) {
    event.preventDefault(); // Prevent immediate quit
    isQuitting = true;

    shutdownLogger.info(" Ending active session before quit...");

    // Stop audio recording before ending session
    await cleanupAudioRecording(sessionState.id);

    try {
      // End local session and get captures
      const result = await monitoringSessionService.endSession();

      if (result.success && result.sessionId) {
        // End on backend (triggers summarization)
        await authManager.authenticatedFetch(`/api/monitoring/sessions/${result.sessionId}/end`, {
          method: "POST",
        });
        shutdownLogger.info(" Session ended successfully on backend");
      }
    } catch (error) {
      shutdownLogger.error(" Error ending session:", error);
    }

    // Now quit for real
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  updateService.stopPeriodicChecks();
  stopNotificationTimer();
  // Ensure focus window tracker is stopped even if session state is corrupted
  focusWindowTracker.stop();
});
