import { ipcLogger } from "../loggers";
import { registerAuthHandlers } from "./auth-handlers";
import { registerConsoleHandlers } from "./console-handlers";
import { registerUserContextHandlers } from "./user-context-handlers";
import { registerScreenshotHandlers } from "./screenshot-handlers";
import { registerNotificationHandlers } from "./notification-handlers";
import { registerPillHandlers } from "./pill-handlers";
import { registerWatchModeHandlers } from "./watch-mode-handlers";
import { registerMonitoringSessionHandlers } from "./monitoring-session-handlers";
import { registerUpdateHandlers } from "./update-handlers";
import { registerBrowserBridgeHandlers } from "./browser-bridge-handlers";
import { registerFeedbackHandlers } from "./feedback-handlers";
import { registerOnDeviceHandlers } from "./on-device-handlers";
import { registerPdfExportHandlers } from "./pdf-export-handlers";
import { registerAgentHandlers } from "./agent-handlers";

export function registerAllIpc() {
  ipcLogger.info("Setting up IPC handlers...");

  registerConsoleHandlers();
  registerAuthHandlers();
  registerUserContextHandlers();
  registerScreenshotHandlers();
  registerPillHandlers();
  registerNotificationHandlers();
  registerWatchModeHandlers();
  registerMonitoringSessionHandlers();
  registerUpdateHandlers();
  registerBrowserBridgeHandlers();
  registerFeedbackHandlers();
  registerOnDeviceHandlers();
  registerPdfExportHandlers();
  registerAgentHandlers();

  ipcLogger.info("All IPC handlers registered");
}
