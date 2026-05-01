import { app, BrowserWindow, screen, shell } from "electron";
import { join } from "path";
import { ctx } from "../context";
import { consoleLogger } from "../loggers";
import { isBoundsVisible, clampToDisplay } from "./window-geometry";

export function createConsoleWindow() {
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

  ctx.consoleWindow = new BrowserWindow({
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
  ctx.consoleWindow.once("ready-to-show", () => {
    if (!ctx.consoleWindow) return;

    const bounds = ctx.consoleWindow.getBounds();
    if (!isBoundsVisible(bounds)) {
      const clamped = clampToDisplay(bounds);
      consoleLogger.warn(" Console window bounds were off-screen, clamping:", {
        original: bounds,
        clamped,
      });
      ctx.consoleWindow.setBounds(clamped);
    }

    ctx.consoleWindow.show();
  });

  // Safety timeout: Force show window if ready-to-show doesn't fire (Windows edge case)
  setTimeout(() => {
    if (ctx.consoleWindow && !ctx.consoleWindow.isVisible()) {
      consoleLogger.warn(" Force-showing window after timeout (ready-to-show didn't fire)");
      ctx.consoleWindow.show();
    }
  }, 5000);

  // Log when preload script finishes loading
  ctx.consoleWindow.webContents.on("did-finish-load", () => {
    consoleLogger.info(" Window finished loading - preload script should be ready");
  });

  // Log when DOM is ready
  ctx.consoleWindow.webContents.on("dom-ready", () => {
    consoleLogger.info(" DOM ready - window.consoleAPI should be available now");
  });

  // Handle external links - open in default browser/app instead of new window
  ctx.consoleWindow.webContents.setWindowOpenHandler(({ url }) => {
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
    ctx.consoleWindow.setMenu(null);
  }

  if (!app.isPackaged) {
    consoleLogger.info(" Loading dev URL: http://localhost:5173/console/index.html");
    ctx.consoleWindow.loadURL("http://localhost:5173/console/index.html");
    ctx.consoleWindow.webContents.openDevTools();
  } else {
    ctx.consoleWindow.loadFile(join(__dirname, "../renderer/console/index.html"));
  }

  // Slack-style: closing the window hides it (keeps app running).
  // On macOS, users can Cmd+Q to quit; on Windows, tray "Quit" exits fully.
  ctx.consoleWindow.on("close", (event) => {
    if (ctx.isExplicitQuit) return;

    // Windows: hide-to-tray. macOS: close-to-hide (reopen via dock/activate).
    // Linux: keep default close behavior (no tray UX here yet).
    if (process.platform !== "win32" && process.platform !== "darwin") return;

    event.preventDefault();
    try {
      ctx.consoleWindow?.hide();
      if (process.platform === "win32") ctx.consoleWindow?.setSkipTaskbar(true);
    } catch {
      /* ignore */
    }
  });

  ctx.consoleWindow.on("closed", () => {
    ctx.consoleWindow = null;
  });

  // macOS: ensure traffic light buttons stay visible after fullscreen transitions
  if (isMac) {
    ctx.consoleWindow.on("enter-full-screen", () => {
      ctx.consoleWindow?.setWindowButtonVisibility(true);
    });
    ctx.consoleWindow.on("leave-full-screen", () => {
      ctx.consoleWindow?.setWindowButtonVisibility(true);
    });
  }
}
