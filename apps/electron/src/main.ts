import type { MultiWindowCaptureResult, SelectedWindowInfo } from "@mitable/shared";
import { IPC_CHANNELS } from "@mitable/shared";
import { app, BrowserWindow, globalShortcut, ipcMain, Notification, screen, shell } from "electron";
import { join } from "path";
import { initActiveWindowBridge } from "./main/activeWindowBridge";
import { isBlockedByPolicy } from "./services/capturePolicy";
import { captureService } from "./services/captureService";
import { resolveWindowUrlForWatchSelection } from "./services/macWindowFocusService";
import { windowDetectionService } from "./services/windowDetectionService";
import { monitoringSessionService } from "./services/monitoringSessionService";
import { authManager } from "./services/authManager";
import { preferencesService } from "./services/preferencesService";
import { updateService } from "./services/updateService";

// Window references
let consoleWindow: BrowserWindow | null = null;
let watchingPillWindow: BrowserWindow | null = null;
let watchingPillEyeDropdown: BrowserWindow | null = null;
let watchingPillMenuDropdown: BrowserWindow | null = null;

// Track when dropdowns were last hidden (to prevent re-opening on button click)
let eyeDropdownLastHidden = 0;
let menuDropdownLastHidden = 0;

// Interval for checking if watched windows are still open
let closedWindowCheckInterval: NodeJS.Timeout | null = null;

// Watch button windows tracking (module scope for cleanup from multiple handlers)
const watchButtonWindows: Map<string, BrowserWindow> = new Map();

// Auth token storage (shared across all windows)
const authTokens: {
  accessToken: string | null;
  refreshToken: string | null;
} = {
  accessToken: null,
  refreshToken: null,
};

function createConsoleWindow() {
  console.log("[Console] Creating console window...");
  console.log("[Console] Preload script path:", join(__dirname, "../preload/console.cjs"));

  // Get screen dimensions for responsive window sizing
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

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
    // Center the window
    x: Math.floor((screenWidth - windowWidth) / 2),
    y: Math.floor((screenHeight - windowHeight) / 2),
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
    consoleWindow?.show();
  });

  // Log when preload script finishes loading
  consoleWindow.webContents.on("did-finish-load", () => {
    console.log("[Console] Window finished loading - preload script should be ready");
  });

  // Log when DOM is ready
  consoleWindow.webContents.on("dom-ready", () => {
    console.log("[Console] DOM ready - window.consoleAPI should be available now");
  });

  // Handle external links - open in default browser/app instead of new window
  consoleWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[Console] External link clicked:", url);

    // Open in default browser/app (e.g., Slack links open in Slack)
    shell.openExternal(url).catch((err) => {
      console.error("[Console] Failed to open external link:", err);
    });

    // Prevent Electron from creating a new window
    return { action: "deny" };
  });

  // Remove menu bar on Windows (keep on macOS for native experience)
  if (process.platform !== "darwin") {
    consoleWindow.setMenu(null);
  }

  if (!app.isPackaged) {
    console.log("[Console] Loading dev URL: http://localhost:5173/console/index.html");
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
  const windowHeight = 130; // Just the pill height
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

  console.log("[WatchingPill] Window created at right edge, vertically centered");

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

      console.log(`[ClosedWindowCheck] Notified windows of ${closedWindows.length} closed windows`);
    }
  }, 2000); // Check every 2 seconds

  console.log("[ClosedWindowCheck] Started periodic check for closed windows");
}

/**
 * Stop the closed window check interval
 */
function stopClosedWindowCheck() {
  if (closedWindowCheckInterval) {
    clearInterval(closedWindowCheckInterval);
    closedWindowCheckInterval = null;
    console.log("[ClosedWindowCheck] Stopped periodic check");
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
  });

  if (!app.isPackaged) {
    watchingPillMenuDropdown.loadURL("http://localhost:5173/watchingPillDropdown/menu.html");
  } else {
    watchingPillMenuDropdown.loadFile(
      join(__dirname, "../renderer/watchingPillDropdown/menu.html")
    );
  }
}

// IPC Handlers
function setupIPC() {
  console.log("[IPC] Setting up IPC handlers...");

  // Minimize console window
  ipcMain.on(IPC_CHANNELS.CONSOLE_MINIMIZE, () => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.minimize();
    }
  });

  // Auth Management - Cross-window token sharing
  // Console sets tokens after login
  ipcMain.on(IPC_CHANNELS.AUTH_SET_TOKENS, (_event, accessToken: string, refreshToken: string) => {
    console.log("[Auth] Tokens set from Console window");
    authTokens.accessToken = accessToken;
    authTokens.refreshToken = refreshToken;

    // Update centralized auth manager (used by services like monitoringSessionService)
    authManager.setTokens(accessToken, refreshToken);

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
    console.log("[Auth] Token requested, returning:", authTokens.accessToken ? "present" : "null");
    return authTokens.accessToken;
  });

  // Console clears tokens on logout
  ipcMain.on(IPC_CHANNELS.AUTH_CLEAR, () => {
    console.log("[Auth] Tokens cleared");
    authTokens.accessToken = null;
    authTokens.refreshToken = null;

    // Clear centralized auth manager
    authManager.clearTokens();

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
    console.log("[WatchingPill] Hide requested");
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.hide();
    }
  });

  // Show watching pill
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_SHOW, () => {
    console.log("[WatchingPill] Show requested");
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

      // Get current window data and send to dropdown
      const selectedWindows = windowDetectionService.getSelectedWindows();
      const availableWindows = await windowDetectionService.getAllVisibleWindows();

      watchingPillEyeDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
        type: "eye",
        selectedWindows,
        availableWindows,
      });

      watchingPillEyeDropdown.show();
      watchingPillEyeDropdown.focus();
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

      // Get session state and send to dropdown
      const sessionState = monitoringSessionService.getSessionState();
      const selectedWindows = windowDetectionService.getSelectedWindows();

      watchingPillMenuDropdown.webContents.send(IPC_CHANNELS.WATCHING_PILL_DROPDOWN_DATA, {
        type: "menu",
        sessionState,
        selectedWindows,
      });

      watchingPillMenuDropdown.show();
      watchingPillMenuDropdown.focus();
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
      console.log("[WatchingPill] Dropdown action:", action);

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
          // Notify pill to update badge count
          const selectedWindows = windowDetectionService.getSelectedWindows();
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            watchingPillWindow.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          return { success: true };
        }
        case "unselect-window": {
          const windowId = action.payload as string;
          windowDetectionService.removeWindow(windowId);
          // Notify pill to update badge count
          const selectedWindows = windowDetectionService.getSelectedWindows();
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            watchingPillWindow.webContents.send(
              IPC_CHANNELS.WATCH_WINDOWS_UPDATED,
              selectedWindows
            );
          }
          return { success: true };
        }
        case "start-session": {
          // This needs user context - handled by the pill itself
          return { success: false, error: "Use pill to start session" };
        }
        case "pause-session": {
          return monitoringSessionService.pauseSession();
        }
        case "resume-session": {
          return monitoringSessionService.resumeSession();
        }
        case "end-session": {
          // 1. End Electron-side capture loop and get captures
          const result = await monitoringSessionService.endSession();

          if (!result.success || !result.sessionId) {
            return result;
          }

          // 2. Upload captures and end backend session
          try {
            // Upload captures if any exist
            if (result.captures && result.captures.length > 0) {
              console.log(`[EndSession] Uploading ${result.captures.length} captures to backend`);
              await authManager.authenticatedFetch(
                `/api/monitoring/sessions/${result.sessionId}/captures`,
                {
                  method: "POST",
                  body: JSON.stringify({ captures: result.captures }),
                }
              );
            }

            // ALWAYS end backend session (triggers summarization)
            console.log(`[EndSession] Triggering backend summarization`);
            await authManager.authenticatedFetch(
              `/api/monitoring/sessions/${result.sessionId}/end`,
              { method: "POST" }
            );
          } catch (error) {
            console.error("[EndSession] Error:", error);
          }

          // Hide watching pill after successful end
          if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
            watchingPillWindow.hide();
          }

          return result;
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
    console.log("[Console] Show requested");
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
      consoleWindow.focus();
    }
  });

  // ==================== User Context IPC Handlers ====================
  // Store user context for cross-window access (e.g., WatchingPill needs userId/orgId)
  let currentUserContext: { userId: string; organizationId: string } | null = null;

  ipcMain.on(
    IPC_CHANNELS.USER_CONTEXT_SET,
    (_event, user: { userId: string; organizationId: string }) => {
      console.log("[UserContext] Set:", user);
      currentUserContext = user;
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
      console.log("[Screenshot] Multi-window capture requested", {
        hasMessage: !!payload?.message,
      });

      try {
        // Get currently selected windows
        const selectedWindows = windowDetectionService.getSelectedWindows();
        const hasSelectedWindows = selectedWindows.length > 0;

        console.log("[Screenshot] Capture with filters:", {
          hasSelectedWindows,
          selectedWindows:
            selectedWindows
              .map((window) => `${window.appName} - ${window.windowTitle}`)
              .join(", ") || "none",
        });

        // Return early if no windows selected (watch mode OFF)
        if (!hasSelectedWindows) {
          console.log("[Screenshot] No windows selected, skipping capture");
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

        console.log("[Screenshot] Multi-window capture result:", {
          success: result.success,
          screenshotCount: result.success ? result.screenshots.length : 0,
          blockedCount: result.success ? result.blockedWindows.length : 0,
          totalDetected: result.success ? result.totalWindowsDetected : 0,
        });

        return result;
      } catch (error) {
        console.error("[Screenshot] Capture failed with error:", error);
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

  console.log("[IPC] Screenshot capture and display metadata handlers registered successfully");

  // Watch Mode IPC Handlers
  setupWatchModeHandlers();

  // Monitoring Session IPC Handlers
  setupMonitoringSessionHandlers();

  // Update notification handlers
  setupUpdateHandlers();
}

// Watch mode handlers for selective screenshot capture
function setupWatchModeHandlers() {
  // Toggle watch mode on/off
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_TOGGLE, async (_event, enabled: boolean) => {
    console.log(`[Watch Mode] Toggling watch mode: ${enabled}`);

    windowDetectionService.setWatchingMode(enabled);

    if (enabled) {
      // Get all visible windows
      const windows = await windowDetectionService.getAllVisibleWindows();
      console.log(`[Watch Mode] Found ${windows.length} watchable windows`);

      // Create overlay buttons for ALL windows (including blocked ones to show policy)
      for (const window of windows) {
        createWatchButtonWindow(window, watchButtonWindows);
      }
    } else {
      // Close all watch button windows (but preserve selected windows state)
      console.log("[Watch Mode] Closing all watch button windows");
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
      console.log(`[Watch Mode] Returning ${windows.length} visible windows`);
      return { success: true, windows };
    } catch (error) {
      console.error("[Watch Mode] Error getting visible windows:", error);
      return { success: false, windows: [], error: String(error) };
    }
  });

  // Select a window to watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_WINDOW_SELECT,
    async (_event, windowInfo: SelectedWindowInfo) => {
      console.log(
        `[Watch Mode] Selecting window: ${windowInfo.appName} (${windowInfo.windowTitle}) [${windowInfo.windowId}]`
      );

      const windowDetails = windowDetectionService.getWindowDetails(windowInfo.windowId);

      if (!windowDetails) {
        console.warn(
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
          console.log("[Watch Mode] Blocking browser window selection on non-macOS platform", {
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
        console.log("[Watch Mode] Selection blocked by capture policy", {
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
    console.log(`[Watch Mode] Unselecting window: ${windowId}`);

    // Get the window info before removing to clear the cache
    const selectedWindows = windowDetectionService.getSelectedWindows();
    const windowToRemove = selectedWindows.find((w) => w.windowId === windowId);

    const removed = windowDetectionService.removeWindow(windowId);

    if (removed) {
      // Clear the cached screenshot for this window (keyed by windowTitle)
      if (windowToRemove) {
        captureService.clearCachedScreenshot(windowToRemove.windowTitle);
        console.log(`[Watch Mode] Cleared cache for ${windowToRemove.windowTitle}`);
      }
      broadcastWatchWindowsUpdate();
    }
  });

  // Get currently selected windows
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_GET_SELECTED, async () => {
    const selectedWindows = windowDetectionService.getSelectedWindows();
    console.log(`[Watch Mode] Returning ${selectedWindows.length} selected windows`);
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

    console.log(
      `[Watch Mode] Broadcasted update to windows. Selected windows: ${
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
        console.log(
          `[Watch Mode] Closing button for selected window: ${windowInfo.appName} (windowId: ${windowInfo.windowId})`
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
            console.log(
              `[Watch Mode] Cached screenshot for ${windowInfo.windowTitle} at selection time`
            );
          }
        }
      } catch (error) {
        console.warn("[Watch Mode] Failed to cache screenshot at selection time:", error);
      }
    }

    return { allowed: true };
  }

  console.log("[IPC] Watch mode handlers registered successfully");
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
      console.log("[Monitoring Session] Starting session:", {
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
        captureIntervalMs: config.captureIntervalMs || 30000,
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
    console.log("[Monitoring Session] Pausing session");
    return monitoringSessionService.pauseSession();
  });

  // Resume the paused session
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_RESUME, async () => {
    console.log("[Monitoring Session] Resuming session");
    return monitoringSessionService.resumeSession();
  });

  // End the active session
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_END, async () => {
    console.log("[Monitoring Session] Ending session");
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
      console.log(
        "[Monitoring Session] Finalizing session:",
        sessionId,
        "captures:",
        captures.length
      );

      try {
        const token = authTokens.accessToken;
        if (!token) {
          return { success: false, error: "No auth token available" };
        }

        const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:3000";

        // Step 1: Upload captures to backend
        if (captures.length > 0) {
          console.log("[Monitoring Session] Uploading", captures.length, "captures to backend");
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
            console.error("[Monitoring Session] Upload captures error:", errorText);
            return { success: false, error: `Failed to upload captures: ${uploadResponse.status}` };
          }
          console.log("[Monitoring Session] Captures uploaded successfully");
        }

        // Step 2: Call /end endpoint to trigger summarization
        console.log("[Monitoring Session] Triggering summarization");
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
          console.error("[Monitoring Session] End session error:", errorText);
          return { success: false, error: `Failed to end session: ${endResponse.status}` };
        }

        console.log("[Monitoring Session] Session finalized successfully");
        return { success: true };
      } catch (error) {
        console.error("[Monitoring Session] Finalize error:", error);
        return { success: false, error: String(error) };
      }
    }
  );

  // Reset/clear session state (used when session is deleted externally)
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_RESET, async () => {
    console.log("[Monitoring Session] Resetting session state");
    monitoringSessionService.resetSession();
    return { success: true };
  });

  // Get current session status
  ipcMain.handle(IPC_CHANNELS.MONITORING_SESSION_STATUS, async () => {
    return monitoringSessionService.getSessionState();
  });

  // Session Recovery handlers
  ipcMain.handle(IPC_CHANNELS.SESSION_GET_RECOVERABLE, async () => {
    console.log("[Session Recovery] Getting recoverable sessions");
    return monitoringSessionService.getRecoverableSessions();
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_RECOVER, async (_, sessionId: string) => {
    console.log("[Session Recovery] Recovering session:", sessionId);
    return monitoringSessionService.recoverSession(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_DISCARD, async (_, sessionId: string) => {
    console.log("[Session Recovery] Discarding session:", sessionId);
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

  console.log("[IPC] Monitoring session handlers registered successfully");
}

// Update notification handlers
function setupUpdateHandlers() {
  ipcMain.handle("check-for-updates", async () => {
    console.log("[Update] Manual check for updates requested");
    await updateService.checkForUpdates();
    return { success: true };
  });

  ipcMain.handle("download-update", async () => {
    console.log("[Update] Download update requested");
    try {
      await updateService.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error("[Update] Download failed:", error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("install-update", () => {
    console.log("[Update] Install update requested");
    updateService.quitAndInstall();
    return { success: true };
  });

  console.log("[IPC] Update handlers registered successfully");
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
    console.log(`[Watch Mode] Button window closed for: ${window.appName}`);
    watchButtonWindows.delete(window.windowId);
  });

  watchButtonWindows.set(window.windowId, buttonWindow);

  console.log(
    `[Watch Mode] Created button for ${window.appName} at (${window.bounds.x + 10}, ${window.bounds.y + 10})`
  );
}

// Global shortcuts
function registerGlobalShortcuts() {
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
  // Initialize active window bridge for capture policy
  initActiveWindowBridge();

  // Create Console window (main dashboard)
  createConsoleWindow();
  // WatchingPill is created on-demand when session starts

  setupIPC();
  registerGlobalShortcuts();

  // Start automatic update checks (every 4 hours)
  updateService.startPeriodicChecks(240);

  // Check for recoverable sessions on startup (crash recovery)
  try {
    const recoverableSessions = await monitoringSessionService.getRecoverableSessions();
    if (recoverableSessions.length > 0) {
      console.log(`[Session Recovery] Found ${recoverableSessions.length} recoverable session(s)`);
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
    console.error("[Session Recovery] Error checking for recoverable sessions:", error);
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

    console.log("[Shutdown] Ending active session before quit...");

    try {
      // End local session and get captures
      const result = await monitoringSessionService.endSession();

      if (result.success && result.sessionId) {
        // End on backend (triggers summarization)
        await authManager.authenticatedFetch(
          `/api/monitoring/sessions/${result.sessionId}/end`,
          { method: "POST" }
        );
        console.log("[Shutdown] Session ended successfully on backend");
      }
    } catch (error) {
      console.error("[Shutdown] Error ending session:", error);
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
});
