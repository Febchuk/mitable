/**
 * Renderer Process Logger
 *
 * Centralized logging utility using electron-log for renderer processes.
 * Logs are automatically sent to the main process via IPC and written to the same log file.
 *
 * Note: Requires `log.initialize()` to be called in the main process first.
 */

import log from "electron-log/renderer";

// Set up global error handlers for the renderer
if (typeof window !== "undefined") {
  window.onerror = (msg, url, line, col, error) => {
    log.error("[Window Error]", { msg, url, line, col, error });
    return false; // Don't prevent default error handling
  };

  window.onunhandledrejection = (event) => {
    log.error("[Unhandled Promise]", event.reason);
  };
}

/**
 * Create a scoped logger for a specific module
 *
 * @example
 * ```typescript
 * import { createLogger } from "../../lib/logger";
 * const logger = createLogger("ChatService");
 *
 * logger.info("Message sent:", messageId);
 * logger.error("Failed to send message:", error);
 * ```
 */
export function createLogger(scope: string) {
  return {
    debug: (msg: string, ...args: unknown[]) =>
      log.debug(`[${scope}]`, msg, ...args),
    info: (msg: string, ...args: unknown[]) =>
      log.info(`[${scope}]`, msg, ...args),
    warn: (msg: string, ...args: unknown[]) =>
      log.warn(`[${scope}]`, msg, ...args),
    error: (msg: string, ...args: unknown[]) =>
      log.error(`[${scope}]`, msg, ...args),
  };
}

export default log;
