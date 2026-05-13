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
import { registerLocalAuthHandlers } from "./local-auth-handlers";
import { registerLocalAgentHandlers } from "./local-agent-handlers";
import { registerLocalDocsHandlers } from "./local-docs-handlers";
import { registerWhisperHandlers } from "./whisper-handlers";
import { registerMeActivityHandlers } from "./me-activity-handlers";

export function registerAllIpc() {
  ipcLogger.info("Setting up IPC handlers...");

  registerConsoleHandlers();
  registerAuthHandlers();
  registerLocalAuthHandlers();
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
  registerLocalAgentHandlers();
  registerLocalDocsHandlers();
  registerWhisperHandlers();
  registerMeActivityHandlers();

  ipcLogger.info("All IPC handlers registered");
}
