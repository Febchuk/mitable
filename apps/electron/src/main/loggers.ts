import { createLogger } from "../lib/logger";

export const consoleLogger = createLogger("Console");
export const watchingPillLogger = createLogger("WatchingPill");
export const ipcLogger = createLogger("IPC");
export const authLogger = createLogger("Auth");
export const screenshotLogger = createLogger("Screenshot");
export const watchModeLogger = createLogger("WatchMode");
export const monitoringLogger = createLogger("MonitoringSession");
export const recoveryLogger = createLogger("SessionRecovery");
export const updateLogger = createLogger("Update");
export const shutdownLogger = createLogger("Shutdown");
export const notificationLogger = createLogger("Notification");
