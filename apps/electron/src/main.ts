import { app, BrowserWindow, globalShortcut, ipcMain, screen } from "electron";
import { join } from "path";
import { IPC_CHANNELS } from "@mitable/shared";

// Window references
let agentWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let guideWindow: BrowserWindow | null = null;
let nudgeWindow: BrowserWindow | null = null;

function createAgentWindow() {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  // Calculate position: centered horizontally, flush with bottom
  const windowWidth = 740;
  const windowHeight = 696;
  const x = Math.floor((screenWidth - windowWidth) / 2);
  const y = screenHeight - windowHeight;

  agentWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/agent.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    agentWindow.setAlwaysOnTop(true, "modal-panel");
    agentWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    agentWindow.setAlwaysOnTop(true, "normal", 1);
  }

  if (!app.isPackaged) {
    agentWindow.loadURL("http://localhost:5173/agent/index.html");
  } else {
    agentWindow.loadFile(join(__dirname, "../renderer/agent.html"));
  }

  agentWindow.on("closed", () => {
    // Don't set to null - allow recreation via Cmd+H
    agentWindow = null;
  });
}

function createConsoleWindow() {
  consoleWindow = new BrowserWindow({
    width: 1264,
    height: 888,
    transparent: true,
    // Hidden title bar on macOS for native traffic lights with custom positioning
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 6, y: 10 } : undefined,
    frame: process.platform !== "darwin",
    maximizable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/console.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove menu bar on Windows (keep on macOS for native experience)
  if (process.platform !== "darwin") {
    consoleWindow.setMenu(null);
  }

  if (!app.isPackaged) {
    consoleWindow.loadURL("http://localhost:5173/console/index.html");
    consoleWindow.webContents.openDevTools();
  } else {
    consoleWindow.loadFile(join(__dirname, "../renderer/console.html"));
  }

  consoleWindow.on("closed", () => {
    app.quit(); // Quit app when main console window is closed
  });
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/overlay.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!app.isPackaged) {
    overlayWindow.loadURL("http://localhost:5173/overlay/index.html");
  } else {
    overlayWindow.loadFile(join(__dirname, "../renderer/overlay.html"));
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function createGuideWindow() {
  guideWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/guide.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    guideWindow.loadURL("http://localhost:5173/guide/index.html");
  } else {
    guideWindow.loadFile(join(__dirname, "../renderer/guide.html"));
  }

  guideWindow.on("closed", () => {
    guideWindow = null;
  });
}

function createNudgeWindow() {
  nudgeWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/nudge.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    nudgeWindow.loadURL("http://localhost:5173/nudge/index.html");
  } else {
    nudgeWindow.loadFile(join(__dirname, "../renderer/nudge.html"));
  }

  nudgeWindow.on("closed", () => {
    nudgeWindow = null;
  });
}

// IPC Handlers
function setupIPC() {
  // Agent window toggle
  ipcMain.on(IPC_CHANNELS.AGENT_TOGGLE, () => {
    if (agentWindow && !agentWindow.isDestroyed()) {
      if (agentWindow.isVisible()) {
        agentWindow.hide();
      } else {
        agentWindow.show();
      }
    }
  });

  // Show console from agent
  ipcMain.on(IPC_CHANNELS.AGENT_SHOW_CONSOLE, () => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
    }
  });

  // Guide system
  ipcMain.on(IPC_CHANNELS.GUIDE_START, (_event, data) => {
    // Show and position overlay window
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, data);
      overlayWindow.show();
    }

    // Position and show guide window
    if (guideWindow && !guideWindow.isDestroyed()) {
      // Position on left side of screen with some margin
      const primaryDisplay = screen.getPrimaryDisplay();
      const { height: screenHeight } = primaryDisplay.bounds;
      const guideWidth = 400;
      const guideHeight = 400;

      guideWindow.setBounds({
        x: 50,
        y: Math.floor((screenHeight - guideHeight) / 2),
        width: guideWidth,
        height: guideHeight,
      });

      guideWindow.webContents.send(IPC_CHANNELS.GUIDE_DATA, data);
      guideWindow.show();
    }

    // Hide nudge window if visible
    if (nudgeWindow && !nudgeWindow.isDestroyed() && nudgeWindow.isVisible()) {
      nudgeWindow.hide();
    }
  });

  // Guide step update - forward to overlay
  ipcMain.on(IPC_CHANNELS.GUIDE_STEP_UPDATE, (_event, data) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, data);
    }
  });

  ipcMain.on(IPC_CHANNELS.GUIDE_COMPLETE, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    if (guideWindow && !guideWindow.isDestroyed()) {
      guideWindow.hide();
    }
  });

  // Nudge system
  ipcMain.on(IPC_CHANNELS.NUDGE_SHOW, (_event, data) => {
    if (nudgeWindow && !nudgeWindow.isDestroyed()) {
      // Position nudge window to the right of agent window
      if (agentWindow && !agentWindow.isDestroyed()) {
        const agentBounds = agentWindow.getBounds();
        const nudgeBounds = nudgeWindow.getBounds();

        // Position to the right with 16px gap
        const x = agentBounds.x + agentBounds.width + 16;
        const y = agentBounds.y;

        nudgeWindow.setBounds({
          x,
          y,
          width: nudgeBounds.width,
          height: nudgeBounds.height,
        });
      }

      nudgeWindow.webContents.send(IPC_CHANNELS.NUDGE_SHOW, data);
      nudgeWindow.show();
    }
    if (guideWindow && !guideWindow.isDestroyed() && guideWindow.isVisible()) {
      guideWindow.hide();
    }
  });

  // Dynamic mouse events for overlay
  ipcMain.on(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, (_event, ignore: boolean) => {
    if (agentWindow && !agentWindow.isDestroyed()) {
      agentWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
    if (guideWindow && !guideWindow.isDestroyed()) {
      guideWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
    if (nudgeWindow && !nudgeWindow.isDestroyed()) {
      nudgeWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

}

// Global shortcut for help (Cmd+H / Ctrl+H)
function registerGlobalShortcuts() {
  globalShortcut.register("CommandOrControl+H", () => {
    if (!agentWindow || agentWindow.isDestroyed()) {
      // Recreate window if it was closed
      createAgentWindow();
    }
    if (agentWindow && !agentWindow.isDestroyed()) {
      if (agentWindow.isVisible()) {
        agentWindow.hide();
      } else {
        agentWindow.show();
        agentWindow.focus();
      }
    }
  });
}

app.whenReady().then(() => {
  createAgentWindow();
  createConsoleWindow();
  createOverlayWindow();
  createGuideWindow();
  createNudgeWindow();

  setupIPC();
  registerGlobalShortcuts();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
