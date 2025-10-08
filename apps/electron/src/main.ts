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
  agentWindow = new BrowserWindow({
    width: 80,
    height: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/agent.mjs"),
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
    agentWindow.loadURL("http://localhost:5173/agent");
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
    width: 1200,
    height: 800,
    backgroundColor: "#000000",
    webPreferences: {
      preload: join(__dirname, "../preload/console.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    consoleWindow.loadURL("http://localhost:5173/console");
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
      preload: join(__dirname, "../preload/overlay.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!app.isPackaged) {
    overlayWindow.loadURL("http://localhost:5173/overlay");
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
      preload: join(__dirname, "../preload/guide.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    guideWindow.loadURL("http://localhost:5173/guide");
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
      preload: join(__dirname, "../preload/nudge.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    nudgeWindow.loadURL("http://localhost:5173/nudge");
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
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, data);
    }
    if (guideWindow && !guideWindow.isDestroyed()) {
      guideWindow.webContents.send(IPC_CHANNELS.GUIDE_DATA, data);
      guideWindow.show();
    }
    if (nudgeWindow && !nudgeWindow.isDestroyed() && nudgeWindow.isVisible()) {
      nudgeWindow.hide();
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
