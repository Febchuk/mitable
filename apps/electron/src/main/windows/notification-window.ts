import { app, BrowserWindow, Notification, screen } from "electron";
import { join } from "path";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { notificationLogger } from "../loggers";
import { updateService } from "../../services/updateService";

export interface NotificationConfig {
  title: string;
  message: string;
  icon?: string;
  actions: Array<{ id: string; label: string; primary?: boolean }>;
  timeout?: number;
}

/** Import this lazily from tray module once it exists */
let _prepareForQuitAndInstall: (() => void) | null = null;

export function setPrepareForQuitAndInstall(fn: () => void) {
  _prepareForQuitAndInstall = fn;
}

export function createNotificationWindow() {
  // Get screen dimensions for bottom-right positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 340;
  const windowHeight = 150;
  const padding = 20;
  const dockHeight = 80; // Account for macOS dock

  ctx.notificationWindow = new BrowserWindow({
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
    ctx.notificationWindow.setAlwaysOnTop(true, "floating");
    ctx.notificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    ctx.notificationWindow.setAlwaysOnTop(true, "normal", 1);
  }

  // Dismiss on blur (click away)
  ctx.notificationWindow.on("blur", () => {
    hideNotification();
  });

  ctx.notificationWindow.on("closed", () => {
    ctx.notificationWindow = null;
  });

  if (!app.isPackaged) {
    ctx.notificationWindow.loadURL("http://localhost:5173/notifications/index.html");
  } else {
    ctx.notificationWindow.loadFile(join(__dirname, "../renderer/notifications/index.html"));
  }

  notificationLogger.info(" Notification window created");
}

export function showNotification(config: NotificationConfig) {
  // Windows: use native toast notification for OS integration (Action Center)
  if (process.platform === "win32") {
    showNativeWindowsNotification(config);
    return;
  }

  // macOS: use custom BrowserWindow notification
  showCustomNotification(config);
}

export function showNativeWindowsNotification(config: NotificationConfig) {
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

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function showCustomNotification(config: NotificationConfig) {
  // Create window if it doesn't exist
  if (!ctx.notificationWindow || ctx.notificationWindow.isDestroyed()) {
    createNotificationWindow();
  }

  // Wait for window to be ready before sending data
  if (ctx.notificationWindow && !ctx.notificationWindow.isDestroyed()) {
    // Send config data to renderer
    ctx.notificationWindow.webContents.send(IPC_CHANNELS.NOTIFICATION_DATA, config);
    ctx.notificationWindow.showInactive(); // Don't steal focus or affect other windows

    notificationLogger.info("Showing custom notification:", config.title);

    // Set up auto-hide timer (as backup, renderer also handles this)
    if (config.timeout && config.timeout > 0) {
      if (ctx.notificationAutoHideTimer) {
        clearTimeout(ctx.notificationAutoHideTimer);
      }
      ctx.notificationAutoHideTimer = setTimeout(() => {
        hideNotification();
      }, config.timeout + 500); // Slightly longer than renderer timeout
    }
  }
}

export function hideNotification() {
  if (ctx.notificationAutoHideTimer) {
    clearTimeout(ctx.notificationAutoHideTimer);
    ctx.notificationAutoHideTimer = null;
  }

  if (ctx.notificationWindow && !ctx.notificationWindow.isDestroyed()) {
    ctx.notificationWindow.hide();
    notificationLogger.info(" Notification hidden");
  }
}

export function handleNotificationAction(actionId: string) {
  switch (actionId) {
    case "turn-on":
    case "focus":
      // Show console and navigate to start session
      if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
        ctx.consoleWindow.show();
        ctx.consoleWindow.focus();
      }
      break;
    case "view-recap":
      // Show console and navigate to recaps page
      if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
        ctx.consoleWindow.show();
        ctx.consoleWindow.focus();
        ctx.consoleWindow.webContents.send("navigate-to-recaps");
      }
      break;
    case "view-update":
      // Show console and navigate to profile/update section
      if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
        ctx.consoleWindow.show();
        ctx.consoleWindow.focus();
        ctx.consoleWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO_UPDATE);
      }
      break;
    case "install-update":
      // Quit and install the downloaded update
      if (_prepareForQuitAndInstall) _prepareForQuitAndInstall();
      updateService.quitAndInstall();
      break;
    case "view-active-session":
      // Show console and navigate to active session
      if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
        ctx.consoleWindow.show();
        ctx.consoleWindow.focus();
        ctx.consoleWindow.webContents.send(IPC_CHANNELS.NAVIGATE_TO_ACTIVE_SESSION);
      }
      break;
    case "dismiss":
      // No-op — notification already dismissed
      break;
    default:
      notificationLogger.warn("Unknown notification action:", actionId);
  }
}
