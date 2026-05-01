/**
 * Electron main process entry point.
 *
 * This file is intentionally thin — all logic lives in `./main/` submodules.
 * It wires up the app lifecycle and delegates to the extracted modules.
 */
import { app, nativeTheme } from "electron";
import { preferencesService } from "./services/preferencesService";

// Apply stored theme before any window is created
nativeTheme.themeSource = preferencesService.getTheme();

// Register mitable:// protocol for Windows native notification action buttons
if (process.platform === "win32") {
  app.setAsDefaultProtocolClient("mitable");
}

// ── App lifecycle ────────────────────────────────────────────────────────────

import { onAppReady } from "./main/lifecycle/ready";
import { registerBeforeQuitHandlers } from "./main/lifecycle/before-quit";
import { registerWindowEventHandlers } from "./main/lifecycle/window-events";
import { registerPowerMonitorHandlers } from "./main/lifecycle/power-monitor";
import { registerAllIpc } from "./main/ipc";
import { handleNotificationAction } from "./main/windows/notification-window";

app.whenReady().then(() =>
  onAppReady({
    registerAllIpc,
    handleNotificationAction,
  })
);

registerBeforeQuitHandlers();
registerWindowEventHandlers();
registerPowerMonitorHandlers();
