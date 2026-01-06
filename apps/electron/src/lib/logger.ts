/**
 * Main Process Logger
 *
 * Centralized logging utility using electron-log for the main process.
 * Provides scoped loggers with consistent formatting and persistent file logging.
 *
 * Log file locations:
 * - macOS: ~/Library/Logs/mitable/main.log
 * - Windows: %USERPROFILE%\AppData\Roaming\mitable\logs\main.log
 * - Linux: ~/.config/mitable/logs/main.log
 */

import log from "electron-log/main";
import { app } from "electron";

// Determine environment
const isDev = !app.isPackaged;

// Configure file transport
log.transports.file.level = isDev ? "debug" : "info";
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

// Configure console transport
log.transports.console.level = isDev ? "debug" : "warn";
log.transports.console.format = "[{h}:{i}:{s}.{ms}] [{level}] {text}";

// Error serialization for better stack traces
log.errorHandler.startCatching({
  showDialog: false,
  onError({ error }) {
    log.error("[Uncaught Exception]", error);
  },
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  log.error("[Unhandled Rejection]", reason);
});

/**
 * Create a scoped logger for a specific module
 *
 * @example
 * ```typescript
 * import { createLogger } from "../lib/logger";
 * const logger = createLogger("Auth");
 *
 * logger.info("User authenticated:", user.email);
 * logger.error("Login failed:", error);
 * ```
 */
export function createLogger(scope: string) {
  return {
    debug: (msg: string, ...args: unknown[]) => log.debug(`[${scope}]`, msg, ...args),
    info: (msg: string, ...args: unknown[]) => log.info(`[${scope}]`, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => log.warn(`[${scope}]`, msg, ...args),
    error: (msg: string, ...args: unknown[]) => log.error(`[${scope}]`, msg, ...args),
  };
}

/**
 * Initialize electron-log for renderer processes
 * Call this early in the main process startup
 */
export function initializeLogger() {
  log.initialize();
  log.info("[Logger] Initialized - logs will be written to:", log.transports.file.getFile()?.path);
}

export default log;
