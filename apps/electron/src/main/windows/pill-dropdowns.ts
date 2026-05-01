import { app, BrowserWindow } from "electron";
import { join } from "path";
import { ctx } from "../context";

export function createWatchingPillEyeDropdown() {
  if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) return;

  const pillBounds = ctx.watchingPillWindow.getBounds();

  ctx.watchingPillEyeDropdown = new BrowserWindow({
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
    ctx.watchingPillEyeDropdown.setAlwaysOnTop(true, "floating");
    ctx.watchingPillEyeDropdown.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    ctx.watchingPillEyeDropdown.setAlwaysOnTop(true, "normal", 1);
  }

  // Dismiss on blur (click away)
  ctx.watchingPillEyeDropdown.on("blur", () => {
    if (ctx.watchingPillEyeDropdown && !ctx.watchingPillEyeDropdown.isDestroyed()) {
      ctx.watchingPillEyeDropdown.hide();
      ctx.eyeDropdownLastHidden = Date.now(); // Track when hidden for toggle logic
      // Notify pill that dropdown closed
      if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
        ctx.watchingPillWindow.webContents.send("eye-dropdown-closed");
      }
    }
  });

  ctx.watchingPillEyeDropdown.on("closed", () => {
    ctx.watchingPillEyeDropdown = null;
    ctx.eyeDropdownReady = false;
  });

  ctx.watchingPillEyeDropdown.webContents.once("did-finish-load", () => {
    ctx.eyeDropdownReady = true;
  });

  if (!app.isPackaged) {
    ctx.watchingPillEyeDropdown.loadURL("http://localhost:5173/watchingPillDropdown/eye.html");
  } else {
    ctx.watchingPillEyeDropdown.loadFile(
      join(__dirname, "../renderer/watchingPillDropdown/eye.html")
    );
  }
}

export function createWatchingPillMenuDropdown() {
  if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) return;

  const pillBounds = ctx.watchingPillWindow.getBounds();

  ctx.watchingPillMenuDropdown = new BrowserWindow({
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
    ctx.watchingPillMenuDropdown.setAlwaysOnTop(true, "floating");
    ctx.watchingPillMenuDropdown.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    ctx.watchingPillMenuDropdown.setAlwaysOnTop(true, "normal", 1);
  }

  // Dismiss on blur (click away)
  ctx.watchingPillMenuDropdown.on("blur", () => {
    if (ctx.watchingPillMenuDropdown && !ctx.watchingPillMenuDropdown.isDestroyed()) {
      ctx.watchingPillMenuDropdown.hide();
      ctx.menuDropdownLastHidden = Date.now(); // Track when hidden for toggle logic
      // Notify pill that dropdown closed
      if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
        ctx.watchingPillWindow.webContents.send("menu-dropdown-closed");
      }
    }
  });

  ctx.watchingPillMenuDropdown.on("closed", () => {
    ctx.watchingPillMenuDropdown = null;
    ctx.menuDropdownReady = false;
  });

  ctx.watchingPillMenuDropdown.webContents.once("did-finish-load", () => {
    ctx.menuDropdownReady = true;
  });

  if (!app.isPackaged) {
    ctx.watchingPillMenuDropdown.loadURL("http://localhost:5173/watchingPillDropdown/menu.html");
  } else {
    ctx.watchingPillMenuDropdown.loadFile(
      join(__dirname, "../renderer/watchingPillDropdown/menu.html")
    );
  }
}
